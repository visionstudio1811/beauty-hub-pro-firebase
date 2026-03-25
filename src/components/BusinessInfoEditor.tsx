
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Pencil, Globe } from 'lucide-react';
import { useSupabaseBusinessInfo } from '@/hooks/useSupabaseBusinessInfo';
import { useOrganization } from '@/contexts/OrganizationContext';

const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Toronto', label: 'Eastern Canada' },
  { value: 'America/Vancouver', label: 'Pacific Canada' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central Europe (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Europe/Rome', label: 'Rome (CET)' },
  { value: 'Europe/Madrid', label: 'Madrid (CET)' },
  { value: 'Europe/Athens', label: 'Eastern Europe (EET)' },
  { value: 'Asia/Jerusalem', label: 'Israel (IST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Tokyo', label: 'Japan (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEST)' },
  { value: 'Pacific/Auckland', label: 'New Zealand (NZST)' },
];

interface BusinessInfoForm {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
}

export const BusinessInfoEditor: React.FC = () => {
  const { businessInfo, loading, updateBusinessInfo } = useSupabaseBusinessInfo();
  const { currentOrganization, updateOrganization } = useOrganization();
  const [formData, setFormData] = useState<BusinessInfoForm>({
    name: '',
    address: '',
    phone: '',
    email: '',
    website: '',
  });
  const [selectedTimezone, setSelectedTimezone] = useState('America/New_York');
  const [isEditing, setIsEditing] = useState(false);

  // Update form data when business info is loaded
  useEffect(() => {
    if (businessInfo) {
      setFormData({
        name: businessInfo.name || '',
        address: businessInfo.address || '',
        phone: businessInfo.phone || '',
        email: businessInfo.email || '',
        website: businessInfo.website || '',
      });
    }
  }, [businessInfo]);

  useEffect(() => {
    if (currentOrganization?.timezone) {
      setSelectedTimezone(currentOrganization.timezone);
    }
  }, [currentOrganization?.timezone]);

  const handleSave = async () => {
    await updateBusinessInfo(formData);
    // Save timezone to the organization document
    if (currentOrganization && selectedTimezone !== currentOrganization.timezone) {
      await updateOrganization(currentOrganization.id, { timezone: selectedTimezone } as any);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    // Reset form data to original values
    if (businessInfo) {
      setFormData({
        name: businessInfo.name || '',
        address: businessInfo.address || '',
        phone: businessInfo.phone || '',
        email: businessInfo.email || '',
        website: businessInfo.website || '',
      });
    }
    setIsEditing(false);
  };

  const handleInputChange = (field: keyof BusinessInfoForm, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-sm text-gray-500">Loading business information...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full overflow-hidden">
      <CardHeader>
        <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div className="flex items-center space-x-2 min-w-0">
            <Settings className="h-5 w-5 text-purple-600 flex-shrink-0" />
            <CardTitle className="truncate">Business Information</CardTitle>
          </div>
          {!isEditing && (
            <Button 
              onClick={() => setIsEditing(true)} 
              size="sm" 
              variant="ghost"
              className="self-start sm:self-center"
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
        <CardDescription>
          Manage your business details and contact information
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-hidden">
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="business-name">Business Name</Label>
            <Input
              id="business-name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              readOnly={!isEditing}
              className={!isEditing ? "bg-gray-50 dark:bg-gray-800" : ""}
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="business-address">Address</Label>
            <Textarea
              id="business-address"
              value={formData.address}
              onChange={(e) => handleInputChange('address', e.target.value)}
              readOnly={!isEditing}
              className={!isEditing ? "bg-gray-50 dark:bg-gray-800" : ""}
              rows={2}
            />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="business-phone">Phone</Label>
              <Input
                id="business-phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                readOnly={!isEditing}
                className={!isEditing ? "bg-gray-50 dark:bg-gray-800" : ""}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="business-email">Email</Label>
              <Input
                id="business-email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                readOnly={!isEditing}
                className={!isEditing ? "bg-gray-50 dark:bg-gray-800" : ""}
              />
            </div>
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="business-website">Website</Label>
            <Input
              id="business-website"
              value={formData.website}
              onChange={(e) => handleInputChange('website', e.target.value)}
              readOnly={!isEditing}
              className={!isEditing ? "bg-gray-50 dark:bg-gray-800" : ""}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="business-timezone" className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" /> Timezone
            </Label>
            {isEditing ? (
              <Select value={selectedTimezone} onValueChange={setSelectedTimezone}>
                <SelectTrigger id="business-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={COMMON_TIMEZONES.find(tz => tz.value === selectedTimezone)?.label || selectedTimezone}
                readOnly
                className="bg-gray-50 dark:bg-gray-800"
              />
            )}
            <p className="text-xs text-muted-foreground">
              Used for appointment scheduling, notifications, and expiry calculations.
            </p>
          </div>

          {isEditing && (
            <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2 pt-4">
              <Button onClick={handleSave} className="w-full sm:flex-1">
                Save Changes
              </Button>
              <Button onClick={handleCancel} variant="outline" className="w-full sm:flex-1">
                Cancel
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
