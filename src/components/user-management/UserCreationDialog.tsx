
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Copy, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { userCreationSchema, validateAndSanitize } from '@/lib/validation';
import { useSecurityValidation } from '@/hooks/useSecurityValidation';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSecurePasswordGenerator } from './SecurePasswordGenerator';

interface UserCreationDialogProps {
  onUserCreated: () => void;
}

export const UserCreationDialog: React.FC<UserCreationDialogProps> = ({
  onUserCreated
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    full_name: '',
    email: '',
    role: 'staff',
    phone: ''
  });
  const [tempPassword, setTempPassword] = useState('');
  // Flips to true only after the Cloud Function actually creates the user.
  // We can't gate the success panel on `tempPassword` alone — the password
  // exists locally before any server call, so doing so used to render
  // "User Created Successfully!" prematurely while the CF was never invoked.
  const [userCreated, setUserCreated] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const { toast } = useToast();
  const { logSecurityEvent } = useSecurityValidation();
  const { currentOrganization } = useOrganization();
  const { generatePassword, validatePasswordStrength } = useSecurePasswordGenerator();

  const buildSecurePassword = (): string => {
    // Loop locally so we can return the value synchronously — using setState +
    // recursion-via-rerender used to race the submit handler.
    for (let i = 0; i < 5; i++) {
      const candidate = generatePassword({
        length: 16,
        includeUppercase: true,
        includeLowercase: true,
        includeNumbers: true,
        includeSymbols: true,
        excludeSimilar: true,
      });
      if (validatePasswordStrength(candidate).isValid) return candidate;
    }
    // Generator is well-known to produce strong passwords; this is a hard
    // fallback that should never fire in practice.
    return generatePassword({ length: 20, includeUppercase: true, includeLowercase: true, includeNumbers: true, includeSymbols: true, excludeSimilar: true });
  };

  const generateSecurePassword = () => {
    setTempPassword(buildSecurePassword());
  };

  const validateForm = () => {
    try {
      validateAndSanitize(userCreationSchema, newUser);
      setValidationErrors([]);
      return true;
    } catch (error: any) {
      const errors = error.errors?.map((err: any) => err.message) || ['Validation failed'];
      setValidationErrors(errors);
      return false;
    }
  };

  const handleAddUser = async () => {
    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: validationErrors.join(', '),
        variant: "destructive",
      });
      return;
    }

    if (!currentOrganization?.id) {
      toast({
        title: "Error",
        description: "No organization context — refresh the page and try again.",
        variant: "destructive",
      });
      return;
    }

    // Use the existing temp password if the admin already generated one;
    // otherwise generate one inline. Capture locally because setState is async
    // and we need the value in this same call.
    const passwordToUse = tempPassword || buildSecurePassword();
    if (!tempPassword) setTempPassword(passwordToUse);

    setIsCreating(true);

    try {
      const sanitizedData = validateAndSanitize(userCreationSchema, newUser);

      // CF expects camelCase `fullName`, top-level `password`, and the
      // `organizationId` of the calling admin. The form schema uses snake_case
      // for historical reasons; we re-map here.
      const payload = {
        email: sanitizedData.email,
        fullName: sanitizedData.full_name,
        phone: sanitizedData.phone || undefined,
        role: sanitizedData.role,
        password: passwordToUse,
        organizationId: currentOrganization.id,
      };

      const adminCreateUserFn = httpsCallable(functions, 'adminCreateUser');
      const result = await adminCreateUserFn(payload);
      const data = result.data as { uid?: string; success?: boolean; error?: string };

      if (data.error) {
        throw new Error(data.error);
      }

      setUserCreated(true);
      onUserCreated();

      await logSecurityEvent('USER_CREATED', {
        targetUserId: data.uid,
        targetUserRole: sanitizedData.role
      });

      toast({
        title: "User Created",
        description: `${sanitizedData.full_name} has been added successfully.`,
      });
    } catch (error: any) {
      console.error('Error creating user:', error);

      await logSecurityEvent('USER_CREATION_FAILED', {
        error: error.message
      });

      // Clear the temp password on failure so the admin doesn't share a
      // password for an account that doesn't exist.
      setTempPassword('');

      toast({
        title: "Error",
        description: error.message || "Failed to create user.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const copyPassword = () => {
    navigator.clipboard.writeText(tempPassword);
    toast({
      title: "Copied",
      description: "Temporary password copied to clipboard.",
    });
  };

  const closeDialog = () => {
    setIsOpen(false);
    setTempPassword('');
    setUserCreated(false);
    setNewUser({ full_name: '', email: '', role: 'staff', phone: '' });
    setValidationErrors([]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New User</DialogTitle>
          <DialogDescription>
            Create a new user account. A secure temporary password will be generated.
            <br />
            <span className="text-sm text-orange-600 font-medium">
              Note: Admin users can only be created directly in the database.
            </span>
          </DialogDescription>
        </DialogHeader>
        
        {validationErrors.length > 0 && (
          <div className="space-y-2 p-3 bg-red-50 border border-red-200 rounded-md">
            <h4 className="text-sm font-medium text-red-800">Validation Errors:</h4>
            <ul className="text-xs text-red-600 list-disc list-inside">
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        
        {userCreated ? (
          <div className="space-y-4 p-4 bg-green-50 rounded-lg">
            <h4 className="font-medium text-green-800">User Created Successfully!</h4>
            <div className="space-y-2">
              <label className="text-sm font-medium text-green-700">Temporary Password:</label>
              <div className="flex items-center space-x-2">
                <Input
                  value={tempPassword}
                  readOnly
                  className="bg-white font-mono"
                  type="password"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyPassword}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-green-600">
                Please share this password securely with the user. They should change it on first login.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="full_name">Full Name *</Label>
              <Input
                id="full_name"
                value={newUser.full_name}
                onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                placeholder="Enter full name"
                maxLength={100}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="Enter email address"
                maxLength={255}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={newUser.phone}
                onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                placeholder="Enter phone number"
                maxLength={20}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Role *</Label>
              <Select onValueChange={(value) => setNewUser({ ...newUser, role: value })} value={newUser.role}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="reception">Reception</SelectItem>
                  <SelectItem value="beautician">Beautician</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {!tempPassword && (
              <div className="flex items-center space-x-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={generateSecurePassword}
                  className="flex items-center space-x-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Generate Secure Password</span>
                </Button>
                {tempPassword && (
                  <span className="text-xs text-green-600">✓ Secure password ready</span>
                )}
              </div>
            )}
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={closeDialog}>
            {userCreated ? 'Close' : 'Cancel'}
          </Button>
          {!userCreated && (
            <Button onClick={handleAddUser} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create User'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
