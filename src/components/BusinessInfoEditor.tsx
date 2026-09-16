
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Pencil, Globe, Languages, Loader2, FileText } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { useSupabaseBusinessInfo } from '@/hooks/useSupabaseBusinessInfo';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { isAppLanguage, LANGUAGE_LABELS, SUPPORTED_LANGUAGES, type AppLanguage } from '@/i18n';

// `key` maps to settings:businessInfo.timezones.<key> for the display label.
const COMMON_TIMEZONES = [
  { value: 'America/New_York', key: 'easternTime' },
  { value: 'America/Chicago', key: 'centralTime' },
  { value: 'America/Denver', key: 'mountainTime' },
  { value: 'America/Los_Angeles', key: 'pacificTime' },
  { value: 'America/Anchorage', key: 'alaskaTime' },
  { value: 'Pacific/Honolulu', key: 'hawaiiTime' },
  { value: 'America/Phoenix', key: 'arizona' },
  { value: 'America/Toronto', key: 'easternCanada' },
  { value: 'America/Vancouver', key: 'pacificCanada' },
  { value: 'Europe/London', key: 'london' },
  { value: 'Europe/Paris', key: 'centralEurope' },
  { value: 'Europe/Berlin', key: 'berlin' },
  { value: 'Europe/Rome', key: 'rome' },
  { value: 'Europe/Madrid', key: 'madrid' },
  { value: 'Europe/Athens', key: 'easternEurope' },
  { value: 'Asia/Jerusalem', key: 'israel' },
  { value: 'Asia/Dubai', key: 'dubai' },
  { value: 'Asia/Kolkata', key: 'india' },
  { value: 'Asia/Singapore', key: 'singapore' },
  { value: 'Asia/Tokyo', key: 'japan' },
  { value: 'Australia/Sydney', key: 'sydney' },
  { value: 'Australia/Melbourne', key: 'melbourne' },
  { value: 'Pacific/Auckland', key: 'newZealand' },
];

/**
 * How long the "Load default forms & automations" button stays disabled after
 * the org language is changed, while the `reseedOrgOnLanguageChange` trigger
 * does the same job automatically.
 */
const AUTO_RESEED_COOLDOWN_MS = 20_000;

interface BusinessInfoForm {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
}

/** Shape of the `seedOrgDefaultTemplates` callable result we surface in the toast. */
interface SeedDefaultsResult {
  summary?: {
    created?: number;
    replaced?: number;
    skippedCustomized?: number;
    skippedOther?: number;
  };
}

export const BusinessInfoEditor: React.FC = () => {
  const { t } = useTranslation('settings');
  const { t: tReseed } = useTranslation('reseed-forms');
  const { businessInfo, loading, updateBusinessInfo } = useSupabaseBusinessInfo();
  const { currentOrganization, updateOrganization } = useOrganization();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [formData, setFormData] = useState<BusinessInfoForm>({
    name: '',
    address: '',
    phone: '',
    email: '',
    website: '',
  });
  const [selectedTimezone, setSelectedTimezone] = useState('America/New_York');
  const [isEditing, setIsEditing] = useState(false);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  // Set right after the org language is saved. The `reseedOrgOnLanguageChange`
  // Cloud Function trigger reloads the defaults in the new language on its own,
  // so the manual button is held back for a moment instead of racing it.
  const [autoReseedUntil, setAutoReseedUntil] = useState<number | null>(null);

  const isAdmin = profile?.role === 'admin';
  const orgLanguage: AppLanguage = currentOrganization?.language ?? 'en';
  const autoReseedPending = autoReseedUntil !== null;

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

  useEffect(() => {
    if (autoReseedUntil === null) return;
    const timer = window.setTimeout(
      () => setAutoReseedUntil(null),
      Math.max(0, autoReseedUntil - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [autoReseedUntil]);

  const handleSave = async () => {
    await updateBusinessInfo(formData);
    // Save timezone to the organization document
    if (currentOrganization && selectedTimezone !== currentOrganization.timezone) {
      await updateOrganization(currentOrganization.id, { timezone: selectedTimezone });
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

  const handleOrgLanguageChange = async (value: string) => {
    if (!currentOrganization || !isAppLanguage(value) || value === orgLanguage) return;
    setSavingLanguage(true);
    try {
      // updateOrganization already toasts on success and on failure (then rethrows),
      // so no local toast here — otherwise admins see two stacked toasts.
      await updateOrganization(currentOrganization.id, { language: value });
      // The language-change trigger is now reseeding the defaults server-side.
      setAutoReseedUntil(Date.now() + AUTO_RESEED_COOLDOWN_MS);
    } catch (error) {
      console.error('Error updating organization language:', error);
    } finally {
      setSavingLanguage(false);
    }
  };

  // Human-readable name of the org language, in the viewer's own UI language.
  const orgLanguageName = t(`common:language.${orgLanguage}`);

  const handleLoadDefaults = async () => {
    if (!currentOrganization || !isAdmin || loadingDefaults) return;
    setLoadingDefaults(true);
    try {
      const seedDefaults = httpsCallable<
        { organizationId: string; lang: AppLanguage; replacePristine: boolean },
        SeedDefaultsResult
      >(functions, 'seedOrgDefaultTemplates');
      const { data } = await seedDefaults({
        organizationId: currentOrganization.id,
        lang: orgLanguage,
        replacePristine: true,
      });
      const created = data?.summary?.created ?? 0;
      const replaced = data?.summary?.replaced ?? 0;
      const customized = data?.summary?.skippedCustomized ?? 0;
      if (created === 0 && replaced === 0) {
        toast({
          title: tReseed('businessInfoEditor.loadDefaults.nothingToDoTitle'),
          description: tReseed('businessInfoEditor.loadDefaults.nothingToDoDescription', {
            language: orgLanguageName,
          }),
        });
      } else {
        toast({
          title: tReseed('businessInfoEditor.loadDefaults.successTitle'),
          description: tReseed('businessInfoEditor.loadDefaults.successDescription', {
            created,
            replaced,
            customized,
            language: orgLanguageName,
          }),
        });
      }
    } catch (error) {
      console.error('Error loading default forms & automations:', error);
      toast({
        title: tReseed('businessInfoEditor.loadDefaults.errorTitle'),
        description: tReseed('businessInfoEditor.loadDefaults.errorDescription'),
        variant: 'destructive',
      });
    } finally {
      setLoadingDefaults(false);
    }
  };

  const timezoneLabel = (value: string) => {
    const tz = COMMON_TIMEZONES.find(z => z.value === value);
    return tz ? t(`businessInfo.timezones.${tz.key}`) : value;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-sm text-gray-500">{t('businessInfo.loading')}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full overflow-hidden">
      <CardHeader>
        <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div className="flex items-center space-x-2 rtl:space-x-reverse min-w-0">
            <Settings className="h-5 w-5 text-purple-600 flex-shrink-0" />
            <CardTitle className="truncate">{t('businessInfo.title')}</CardTitle>
          </div>
          {!isEditing && (
            <Button
              onClick={() => setIsEditing(true)}
              size="sm"
              variant="ghost"
              className="self-start sm:self-center"
            >
              <Pencil className="h-4 w-4 me-2" />
              {t('common:actions.edit')}
            </Button>
          )}
        </div>
        <CardDescription>
          {t('businessInfo.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-hidden">
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="business-name">{t('businessInfo.fields.name')}</Label>
            <Input
              id="business-name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              readOnly={!isEditing}
              className={!isEditing ? "bg-gray-50 dark:bg-gray-800" : ""}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="business-address">{t('businessInfo.fields.address')}</Label>
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
              <Label htmlFor="business-phone">{t('businessInfo.fields.phone')}</Label>
              <Input
                id="business-phone"
                type="tel"
                dir="ltr"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                readOnly={!isEditing}
                className={!isEditing ? "bg-gray-50 dark:bg-gray-800" : ""}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="business-email">{t('businessInfo.fields.email')}</Label>
              <Input
                id="business-email"
                type="email"
                dir="ltr"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                readOnly={!isEditing}
                className={!isEditing ? "bg-gray-50 dark:bg-gray-800" : ""}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="business-website">{t('businessInfo.fields.website')}</Label>
            <Input
              id="business-website"
              dir="ltr"
              value={formData.website}
              onChange={(e) => handleInputChange('website', e.target.value)}
              readOnly={!isEditing}
              className={!isEditing ? "bg-gray-50 dark:bg-gray-800" : ""}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="business-timezone" className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" /> {t('businessInfo.fields.timezone')}
            </Label>
            {isEditing ? (
              <Select value={selectedTimezone} onValueChange={setSelectedTimezone}>
                <SelectTrigger id="business-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {t(`businessInfo.timezones.${tz.key}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={timezoneLabel(selectedTimezone)}
                readOnly
                className="bg-gray-50 dark:bg-gray-800"
              />
            )}
            <p className="text-xs text-muted-foreground">
              {t('businessInfo.timezoneHelp')}
            </p>
          </div>

          {isEditing && (
            <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2 rtl:space-x-reverse pt-4">
              <Button onClick={handleSave} className="w-full sm:flex-1">
                {t('businessInfo.saveChanges')}
              </Button>
              <Button onClick={handleCancel} variant="outline" className="w-full sm:flex-1">
                {t('common:actions.cancel')}
              </Button>
            </div>
          )}

          {/* Language: the signed-in user's own preference + (admins only) the org default */}
          <div className="border-t pt-4 space-y-4">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Languages className="h-4 w-4 text-purple-600" />
              {t('businessInfo.language.sectionTitle')}
            </div>

            <div className="grid gap-2">
              <Label>{t('common:labels.language')}</Label>
              <div>
                <LanguageSwitcher variant="full" className="border" />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('businessInfo.language.yourLanguageHelp')}
              </p>
            </div>

            {isAdmin && (
              <div className="grid gap-2">
                <Label htmlFor="org-default-language">{t('common:language.orgDefault')}</Label>
                <Select
                  value={orgLanguage}
                  onValueChange={handleOrgLanguageChange}
                  disabled={savingLanguage || !currentOrganization}
                >
                  <SelectTrigger id="org-default-language" className="sm:max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <SelectItem key={lang} value={lang} lang={lang}>
                        {LANGUAGE_LABELS[lang]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('common:language.orgDefaultHelp')}
                </p>
                <div className="pt-2 space-y-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleLoadDefaults}
                    disabled={loadingDefaults || savingLanguage || autoReseedPending || !currentOrganization}
                    className="self-start"
                  >
                    {loadingDefaults ? (
                      <Loader2 className="h-4 w-4 me-2 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4 me-2" />
                    )}
                    {loadingDefaults
                      ? tReseed('businessInfoEditor.loadDefaults.loading')
                      : tReseed('businessInfoEditor.loadDefaults.button', { language: orgLanguageName })}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {autoReseedPending
                      ? tReseed('businessInfoEditor.loadDefaults.autoReseedNotice', { language: orgLanguageName })
                      : tReseed('businessInfoEditor.loadDefaults.help')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
