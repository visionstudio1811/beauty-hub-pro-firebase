
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('settings');
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

  // userCreationSchema (src/lib/validation.ts) carries English messages and is a
  // Do-Not-Change file, so map each Zod issue to an i18n key by field path + issue
  // code instead. Falls back to the raw Zod message when no key matches.
  const flattenIssues = (issues: any[]): any[] =>
    issues.flatMap((issue: any) =>
      issue?.code === 'invalid_union' && Array.isArray(issue.unionErrors)
        ? flattenIssues(issue.unionErrors.flatMap((e: any) => e?.issues ?? []))
        : [issue],
    );

  const translateIssue = (issue: any): string => {
    const field = Array.isArray(issue?.path) ? String(issue.path[0] ?? '') : '';
    const key = `userCreation.validation.${field}.${issue?.code}`;
    const fallback = typeof issue?.message === 'string' ? issue.message : t('userCreation.validationFailed');
    return field && issue?.code ? t(key, { defaultValue: fallback }) : fallback;
  };

  const validateForm = () => {
    try {
      validateAndSanitize(userCreationSchema, newUser);
      setValidationErrors([]);
      return true;
    } catch (error: any) {
      const rawIssues: any[] | undefined = error.issues ?? error.errors;
      const errors = rawIssues?.length
        ? Array.from(new Set(flattenIssues(rawIssues).map(translateIssue)))
        : [t('userCreation.validationFailed')];
      setValidationErrors(errors);
      return false;
    }
  };

  const handleAddUser = async () => {
    if (!validateForm()) {
      toast({
        title: t('userCreation.toasts.validationErrorTitle'),
        description: validationErrors.join(', '),
        variant: "destructive",
      });
      return;
    }

    if (!currentOrganization?.id) {
      toast({
        title: t('common:status.error'),
        description: t('userCreation.toasts.noOrgContext'),
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
        title: t('userCreation.toasts.createdTitle'),
        description: t('userCreation.toasts.createdDescription', { name: sanitizedData.full_name }),
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
        title: t('common:status.error'),
        description: error.message || t('userCreation.toasts.createFailed'),
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const copyPassword = () => {
    navigator.clipboard.writeText(tempPassword);
    toast({
      title: t('userCreation.toasts.copiedTitle'),
      description: t('userCreation.toasts.copiedDescription'),
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
          <Plus className="h-4 w-4 me-2" />
          {t('userCreation.addUser')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('userCreation.title')}</DialogTitle>
          <DialogDescription>
            {t('userCreation.description')}
            <br />
            <span className="text-sm text-orange-600 font-medium">
              {t('userCreation.adminNote')}
            </span>
          </DialogDescription>
        </DialogHeader>
        
        {validationErrors.length > 0 && (
          <div className="space-y-2 p-3 bg-red-50 border border-red-200 rounded-md">
            <h4 className="text-sm font-medium text-red-800">{t('userCreation.validationErrors')}</h4>
            <ul className="text-xs text-red-600 list-disc list-inside">
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        
        {userCreated ? (
          <div className="space-y-4 p-4 bg-green-50 rounded-lg">
            <h4 className="font-medium text-green-800">{t('userCreation.successTitle')}</h4>
            <div className="space-y-2">
              <label className="text-sm font-medium text-green-700">{t('userCreation.temporaryPassword')}</label>
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <Input
                  value={tempPassword}
                  readOnly
                  dir="ltr"
                  className="bg-white font-mono"
                  type="password"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyPassword}
                  aria-label={t('userCreation.copyPassword')}
                  title={t('userCreation.copyPassword')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-green-600">
                {t('userCreation.sharePasswordHint')}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="full_name">{t('userCreation.fields.fullName')}</Label>
              <Input
                id="full_name"
                value={newUser.full_name}
                onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                placeholder={t('userCreation.fields.fullNamePlaceholder')}
                maxLength={100}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">{t('userCreation.fields.email')}</Label>
              <Input
                id="email"
                type="email"
                dir="ltr"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder={t('userCreation.fields.emailPlaceholder')}
                maxLength={255}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">{t('userCreation.fields.phone')}</Label>
              <Input
                id="phone"
                type="tel"
                dir="ltr"
                value={newUser.phone}
                onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                placeholder={t('userCreation.fields.phonePlaceholder')}
                maxLength={20}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">{t('userCreation.fields.role')}</Label>
              <Select onValueChange={(value) => setNewUser({ ...newUser, role: value })} value={newUser.role}>
                <SelectTrigger>
                  <SelectValue placeholder={t('userCreation.fields.rolePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">{t('common:roles.staff')}</SelectItem>
                  <SelectItem value="reception">{t('common:roles.reception')}</SelectItem>
                  <SelectItem value="beautician">{t('common:roles.beautician')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {!tempPassword && (
              <div className="flex items-center space-x-2 rtl:space-x-reverse pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={generateSecurePassword}
                  className="flex items-center space-x-2 rtl:space-x-reverse"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>{t('userCreation.generatePassword')}</span>
                </Button>
                {tempPassword && (
                  <span className="text-xs text-green-600">{t('userCreation.passwordReady')}</span>
                )}
              </div>
            )}
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={closeDialog}>
            {userCreated ? t('common:actions.close') : t('common:actions.cancel')}
          </Button>
          {!userCreated && (
            <Button onClick={handleAddUser} disabled={isCreating}>
              {isCreating ? t('userCreation.creating') : t('userCreation.createUser')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
