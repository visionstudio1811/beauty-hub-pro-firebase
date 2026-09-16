import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/i18n/LanguageProvider';
import i18n, { DEFAULT_LANGUAGE, type AppLanguage } from '@/i18n';
import DOMPurify from 'dompurify';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Palette, Eye, Save, RotateCcw, Code, Mail, Image as ImageIcon, Upload, X, Loader2, Zap } from 'lucide-react';
import { getDefaultTemplateHtml, getElegantDefaultSettings, type TemplateType } from './emailTemplates';

interface EmailTemplate {
  name: string;
  html: string;
  variables: string[];
  settings: {
    primary_color: string;
    background_color: string;
    card_background: string;
    content_background: string;
    text_color: string;
    secondary_text: string;
    signature: string;
  };
}

interface EmailTemplateDesignerProps {
  onUpdate?: () => void;
}

const COMMON_VARS = [
  "header_image_url",
  "logo_url",
  "organization_name",
  "organization_phone",
  "organization_address",
  "organization_email",
  "sender_name",
  "client_name",
  "date",
  "cta_url",
];

const TEMPLATE_TYPES = {
  welcome: {
    name: 'Welcome / Thank You Template',
    variables: [...COMMON_VARS],
  },
  general: {
    name: 'General Template',
    variables: ["subject", "message", ...COMMON_VARS],
  },
  birthday: {
    name: 'Birthday Template',
    variables: ["birthday_date", "special_offer", "discount_code", ...COMMON_VARS],
  },
  inactive: {
    name: 'Inactive Client Template',
    variables: ["last_visit_date", "months_inactive", "comeback_offer", ...COMMON_VARS],
  },
  package_renewal: {
    name: 'Package Renewal Template',
    variables: ["package_name", "expiry_date", "sessions_remaining", "renewal_discount", ...COMMON_VARS],
  },
  appointment_reminder: {
    name: 'Appointment Reminder Template',
    variables: ["appointment_date", "appointment_time", "service_name", "staff_name", "location", ...COMMON_VARS],
  },
  booking_request_received: {
    name: 'Booking Request Received (Visitor)',
    variables: ["treatment", "date", "time", "staff", ...COMMON_VARS],
  },
  booking_request_admin_alert: {
    name: 'Booking Request Alert (Admin)',
    variables: ["visitor_name", "visitor_email", "visitor_phone", "visitor_notes", "treatment", "date", "time", ...COMMON_VARS],
  },
  booking_request_declined: {
    name: 'Booking Declined (Visitor)',
    variables: ["treatment", "date", "time", "reason", ...COMMON_VARS],
  },
} as const;

const AUTO_FILLED_VARS = new Set([
  'header_image_url',
  'logo_url',
  'organization_name',
  'organization_phone',
  'organization_address',
  'organization_email',
]);

type AutomationKey = 'welcome' | 'birthday' | 'inactive' | 'package_renewal' | 'appointment_reminder';

interface AutomationConfig {
  is_active: boolean;
  vip_only?: boolean;
  days_offset?: number;
  days_threshold?: number;
  days_before_expiry?: number;
  hours_before?: number;
}

const DEFAULT_AUTOMATIONS: Record<AutomationKey, AutomationConfig> = {
  welcome:              { is_active: false, vip_only: false },
  birthday:             { is_active: false, days_offset: 0 },
  inactive:             { is_active: false, days_threshold: 90 },
  package_renewal:      { is_active: true,  days_before_expiry: 7 },
  appointment_reminder: { is_active: false, hours_before: 24 },
};

// Display copy for each automation lives in the `marketing` namespace under
// emailDesigner.automations.meta.<key>.{title,description,trigger}.
const AUTOMATION_KEYS: AutomationKey[] = ['welcome', 'birthday', 'inactive', 'package_renewal', 'appointment_reminder'];

// Stored template names are client-facing, so they are generated in the org
// language (not the UI language) via a fixed-language translator.
const templateTypeNameFor = (lang: AppLanguage, key: keyof typeof TEMPLATE_TYPES): string =>
  i18n.getFixedT(lang, 'marketing')(`emailDesigner.templateTypes.${key}`, { defaultValue: TEMPLATE_TYPES[key].name });

// The org language is only known inside the component, so the defaults are
// built on demand rather than as module-level constants.
const makeDefaultSettings = (lang: AppLanguage): EmailTemplate['settings'] => ({
  ...getElegantDefaultSettings(lang),
});

const makeDefaultTemplate = (lang: AppLanguage): EmailTemplate => ({
  name: templateTypeNameFor(lang, 'general'),
  html: getDefaultTemplateHtml('general', lang),
  variables: [...TEMPLATE_TYPES.general.variables],
  settings: makeDefaultSettings(lang),
});

export const EmailTemplateDesigner: React.FC<EmailTemplateDesignerProps> = ({ onUpdate }) => {
  const { t } = useTranslation('marketing');
  const { locale } = useLanguage();
  // Display name for a template type in the UI language (the stored `name`
  // field is generated in the org language via templateTypeNameFor).
  const templateTypeLabel = (key: keyof typeof TEMPLATE_TYPES) =>
    t(`emailDesigner.templateTypes.${key}`, { defaultValue: TEMPLATE_TYPES[key].name });
  const [selectedTemplateType, setSelectedTemplateType] = useState<keyof typeof TEMPLATE_TYPES>('welcome');
  const [templates, setTemplates] = useState<Record<string, EmailTemplate>>({});
  const [headerImageUrl, setHeaderImageUrl] = useState<string | null>(null);
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);
  const [orgEmail, setOrgEmail] = useState<string>('');
  const [orgName, setOrgName] = useState<string>('');
  const [orgPhone, setOrgPhone] = useState<string>('');
  const [orgAddress, setOrgAddress] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [automations, setAutomations] = useState<Record<AutomationKey, AutomationConfig>>(DEFAULT_AUTOMATIONS);
  const [savingAutomations, setSavingAutomations] = useState(false);
  const headerFileInputRef = useRef<HTMLInputElement>(null);
  // Sample values shown in the preview. Built from the active language so the
  // placeholders (and the sample date's locale) follow a language switch.
  const buildSampleVariables = useCallback((): Record<string, string> => ({
    subject: t('emailDesigner.sampleValues.subject'),
    message: t('emailDesigner.sampleValues.message'),
    organization_name: t('emailDesigner.sampleValues.organization_name'),
    client_name: t('emailDesigner.sampleValues.client_name'),
    organization_phone: t('emailDesigner.sampleValues.organization_phone'),
    organization_address: t('emailDesigner.sampleValues.organization_address'),
    organization_email: t('emailDesigner.sampleValues.organization_email'),
    sender_name: t('emailDesigner.sampleValues.sender_name'),
    date: new Date().toLocaleDateString(locale),
    cta_url: "",
    birthday_date: t('emailDesigner.sampleValues.birthday_date'),
    special_offer: t('emailDesigner.sampleValues.special_offer'),
    discount_code: t('emailDesigner.sampleValues.discount_code'),
    last_visit_date: t('emailDesigner.sampleValues.last_visit_date'),
    months_inactive: t('emailDesigner.sampleValues.months_inactive'),
    comeback_offer: t('emailDesigner.sampleValues.comeback_offer'),
    package_name: t('emailDesigner.sampleValues.package_name'),
    expiry_date: t('emailDesigner.sampleValues.expiry_date'),
    sessions_remaining: t('emailDesigner.sampleValues.sessions_remaining'),
    renewal_discount: t('emailDesigner.sampleValues.renewal_discount'),
    appointment_date: t('emailDesigner.sampleValues.appointment_date'),
    appointment_time: t('emailDesigner.sampleValues.appointment_time'),
    service_name: t('emailDesigner.sampleValues.service_name'),
    staff_name: t('emailDesigner.sampleValues.staff_name'),
    location: t('emailDesigner.sampleValues.location')
  }), [t, locale]);
  const [previewVariables, setPreviewVariables] = useState<Record<string, string>>(buildSampleVariables);
  // Defaults the current state was seeded from; lets a language switch replace
  // only the sample values the user has not edited.
  const sampleDefaultsRef = useRef<Record<string, string> | null>(null);
  useEffect(() => {
    const next = buildSampleVariables();
    const prev = sampleDefaultsRef.current;
    sampleDefaultsRef.current = next;
    if (!prev) return; // first mount: state was initialised from these same defaults
    setPreviewVariables((current) => {
      let changed = false;
      const merged = { ...current };
      for (const key of Object.keys(next)) {
        if (current[key] === prev[key] && next[key] !== current[key]) {
          merged[key] = next[key];
          changed = true;
        }
      }
      return changed ? merged : current;
    });
  }, [buildSampleVariables]);

  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  // New/reset templates are generated in the org's language (emails go to clients).
  const orgLang: AppLanguage = currentOrganization?.language ?? DEFAULT_LANGUAGE;

  const currentTemplate = templates[selectedTemplateType] || {
    ...makeDefaultTemplate(orgLang),
    name: templateTypeNameFor(orgLang, selectedTemplateType),
    html: getDefaultTemplateHtml(selectedTemplateType as TemplateType, orgLang),
    settings: getElegantDefaultSettings(orgLang),
    variables: [...TEMPLATE_TYPES[selectedTemplateType].variables],
  };

  useEffect(() => {
    fetchTemplates();
  }, [currentOrganization?.id]);

  const fetchTemplates = async () => {
    if (!currentOrganization?.id) return;

    setLoading(true);
    try {
      const [integrationSnap, orgSnap] = await Promise.all([
        getDoc(doc(db, 'organizations', currentOrganization.id, 'marketingIntegrations', 'resend')),
        getDoc(doc(db, 'organizations', currentOrganization.id)),
      ]);
      if (integrationSnap.exists()) {
        const data = integrationSnap.data();
        if (data.email_templates && typeof data.email_templates === 'object' && !Array.isArray(data.email_templates)) {
          setTemplates(data.email_templates as any);
        }
        if (typeof data.email_header_image_url === 'string') {
          setHeaderImageUrl(data.email_header_image_url);
        }
        if (data.email_automations && typeof data.email_automations === 'object') {
          setAutomations({
            ...DEFAULT_AUTOMATIONS,
            ...(data.email_automations as Partial<Record<AutomationKey, AutomationConfig>>),
          } as Record<AutomationKey, AutomationConfig>);
        }
      }
      const orgData = orgSnap.data();
      if (orgData?.logo_url) setOrgLogoUrl(orgData.logo_url as string);
      if (orgData?.email) setOrgEmail(orgData.email as string);
      if (orgData?.name) setOrgName(orgData.name as string);
      if (orgData?.phone) setOrgPhone(orgData.phone as string);
      if (orgData?.address) setOrgAddress(orgData.address as string);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleHeaderUpload = async (file: File) => {
    if (!currentOrganization?.id) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: t('emailDesigner.toasts.invalidFile'), description: t('emailDesigner.toasts.invalidFileDescription'), variant: 'destructive' });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: t('emailDesigner.toasts.fileTooLarge'), description: t('emailDesigner.toasts.fileTooLargeDescription'), variant: 'destructive' });
      return;
    }
    setUploadingHeader(true);
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const call = httpsCallable<
        { organizationId: string; fileBase64: string; contentType: string },
        { url: string; path: string }
      >(functions, 'uploadEmailHeaderImage');
      const res = await call({
        organizationId: currentOrganization.id,
        fileBase64,
        contentType: file.type,
      });
      setHeaderImageUrl(res.data.url);
      toast({ title: t('emailDesigner.toasts.headerSaved'), description: t('emailDesigner.toasts.headerSavedDescription') });
      onUpdate?.();
    } catch (error: any) {
      toast({ title: t('emailDesigner.toasts.uploadFailed'), description: error.message, variant: 'destructive' });
    } finally {
      setUploadingHeader(false);
    }
  };

  const handleRemoveHeader = async () => {
    if (!currentOrganization?.id) return;
    try {
      await setDoc(
        doc(db, 'organizations', currentOrganization.id, 'marketingIntegrations', 'resend'),
        { email_header_image_url: null, updated_at: new Date().toISOString() },
        { merge: true }
      );
      setHeaderImageUrl(null);
      toast({ title: t('emailDesigner.toasts.headerRemoved') });
    } catch (error: any) {
      toast({ title: t('emailDesigner.toasts.removeFailed'), description: error.message, variant: 'destructive' });
    }
  };

  const saveTemplate = async () => {
    if (!currentOrganization?.id) return;

    setSaving(true);
    try {
      const updatedTemplates = {
        ...templates,
        [selectedTemplateType]: currentTemplate
      };

      // Use the fixed `resend` doc id (matches ResendIntegration.tsx). setDoc
      // with merge handles the case where the doc doesn't exist yet — important
      // for orgs that have never visited the Resend tab.
      await setDoc(
        doc(db, 'organizations', currentOrganization.id, 'marketingIntegrations', 'resend'),
        {
          organization_id: currentOrganization.id,
          provider: 'resend',
          email_templates: JSON.parse(JSON.stringify(updatedTemplates)),
          updated_at: new Date().toISOString(),
        },
        { merge: true }
      );

      setTemplates(updatedTemplates);

      toast({
        title: t('emailDesigner.toasts.templateSaved'),
        description: t('emailDesigner.toasts.templateSavedDescription', { name: templateTypeLabel(selectedTemplateType) }),
      });

      onUpdate?.();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t('emailDesigner.toasts.templateSaveError'),
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const updateAutomation = (key: AutomationKey, patch: Partial<AutomationConfig>) => {
    setAutomations(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const saveAutomations = async () => {
    if (!currentOrganization?.id) return;
    setSavingAutomations(true);
    try {
      await setDoc(
        doc(db, 'organizations', currentOrganization.id, 'marketingIntegrations', 'resend'),
        {
          organization_id: currentOrganization.id,
          provider: 'resend',
          email_automations: automations,
          updated_at: new Date().toISOString(),
        },
        { merge: true }
      );
      toast({ title: t('emailDesigner.toasts.automationsSaved'), description: t('emailDesigner.toasts.automationsSavedDescription') });
      onUpdate?.();
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('emailDesigner.toasts.automationsSaveError'), description: error.message });
    } finally {
      setSavingAutomations(false);
    }
  };

  const resetTemplate = () => {
    const defaultTemplate = {
      ...makeDefaultTemplate(orgLang),
      name: templateTypeNameFor(orgLang, selectedTemplateType),
      html: getDefaultTemplateHtml(selectedTemplateType, orgLang),
      variables: [...TEMPLATE_TYPES[selectedTemplateType].variables]
    };
    
    setTemplates(prev => ({
      ...prev,
      [selectedTemplateType]: defaultTemplate
    }));
  };

  const renderPreview = () => {
    let html = currentTemplate.html;
    // Auto-fill from real org data so the preview matches what clients will receive.
    // Falls back to the placeholder previewVariables only when the org field is empty.
    const variables: Record<string, string> = {
      ...currentTemplate.settings,
      ...previewVariables,
      header_image_url: headerImageUrl || '',
      logo_url: orgLogoUrl || '',
      organization_name: orgName || previewVariables.organization_name || '',
      organization_phone: orgPhone || previewVariables.organization_phone || '',
      organization_address: orgAddress || previewVariables.organization_address || '',
      organization_email: orgEmail || previewVariables.organization_email || '',
    };

    // Resolve conditional blocks first (supports {{#if x}}A{{else}}B{{/if}} and
    // {{#if x}}A{{/if}}). Use a `[\s\S]` matcher to span multiple lines.
    const ifElseRegex = /{{#if\s+(\w+)}}([\s\S]*?){{else}}([\s\S]*?){{\/if}}/g;
    html = html.replace(ifElseRegex, (_m, varName, ifContent, elseContent) =>
      variables[varName] ? ifContent : elseContent
    );
    const ifRegex = /{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g;
    html = html.replace(ifRegex, (_m, varName, content) =>
      variables[varName] ? content : ''
    );

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(regex, value || '');
    }

    html = html.replace(/{{[^}]*}}/g, '');

    return DOMPurify.sanitize(html, {
      ADD_TAGS: ['style'],
      ADD_ATTR: ['style'],
    });
  };

  const updateTemplate = (field: keyof EmailTemplate, value: any) => {
    setTemplates(prev => ({
      ...prev,
      [selectedTemplateType]: {
        ...currentTemplate,
        [field]: value
      }
    }));
  };

  const updateSettings = (key: keyof EmailTemplate['settings'], value: string) => {
    updateTemplate('settings', {
      ...currentTemplate.settings,
      [key]: value
    });
  };

  if (loading) {
    return <div className="p-6">{t('emailDesigner.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t('emailDesigner.title')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('emailDesigner.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetTemplate}>
            <RotateCcw className="h-4 w-4 me-2" />
            {t('common:actions.reset')}
          </Button>
          <Button onClick={saveTemplate} disabled={saving}>
            <Save className="h-4 w-4 me-2" />
            {saving ? t('common:actions.saving') : t('emailDesigner.saveTemplate')}
          </Button>
        </div>
      </div>

      {/* Automations */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                {t('emailDesigner.automations.title')}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {t('emailDesigner.automations.description')}
              </p>
            </div>
            <Button onClick={saveAutomations} disabled={savingAutomations} size="sm">
              <Save className="h-4 w-4 me-2" />
              {savingAutomations ? t('common:actions.saving') : t('emailDesigner.automations.save')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {AUTOMATION_KEYS.map((key) => {
            const cfg = automations[key];
            return (
              <div key={key} className="rounded-lg border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t(`emailDesigner.automations.meta.${key}.title`)}</span>
                    {cfg.is_active && <Badge variant="default">{t('emailDesigner.automations.active')}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{t(`emailDesigner.automations.meta.${key}.description`)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('emailDesigner.automations.trigger', { trigger: t(`emailDesigner.automations.meta.${key}.trigger`) })}</p>
                </div>
                <div className="flex items-center gap-3">
                  {key === 'welcome' && cfg.is_active && (
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={!!cfg.vip_only}
                        onChange={(e) => updateAutomation(key, { vip_only: e.target.checked })}
                        className="h-4 w-4"
                      />
                      {t('emailDesigner.automations.vipOnly')}
                    </label>
                  )}
                  {key === 'birthday' && cfg.is_active && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">{t('emailDesigner.automations.daysOffset')}</Label>
                      <Input
                        type="number"
                        value={cfg.days_offset ?? 0}
                        onChange={(e) => updateAutomation(key, { days_offset: parseInt(e.target.value, 10) || 0 })}
                        className="w-20 h-8"
                        min={-30}
                        max={30}
                      />
                    </div>
                  )}
                  {key === 'inactive' && cfg.is_active && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">{t('emailDesigner.automations.daysInactive')}</Label>
                      <Input
                        type="number"
                        value={cfg.days_threshold ?? 90}
                        onChange={(e) => updateAutomation(key, { days_threshold: parseInt(e.target.value, 10) || 0 })}
                        className="w-20 h-8"
                        min={1}
                        max={365}
                      />
                    </div>
                  )}
                  {key === 'package_renewal' && cfg.is_active && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">{t('emailDesigner.automations.daysBeforeExpiry')}</Label>
                      <Input
                        type="number"
                        value={cfg.days_before_expiry ?? 7}
                        onChange={(e) => updateAutomation(key, { days_before_expiry: parseInt(e.target.value, 10) || 0 })}
                        className="w-20 h-8"
                        min={1}
                        max={90}
                      />
                    </div>
                  )}
                  {key === 'appointment_reminder' && cfg.is_active && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">{t('emailDesigner.automations.hoursBefore')}</Label>
                      <Input
                        type="number"
                        value={cfg.hours_before ?? 24}
                        onChange={(e) => updateAutomation(key, { hours_before: parseInt(e.target.value, 10) || 0 })}
                        className="w-20 h-8"
                        min={1}
                        max={168}
                      />
                    </div>
                  )}
                  <Switch
                    checked={cfg.is_active}
                    onCheckedChange={(checked) => updateAutomation(key, { is_active: checked })}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Template Type Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {t('emailDesigner.templateType.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedTemplateType} onValueChange={(value: keyof typeof TEMPLATE_TYPES) => setSelectedTemplateType(value)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('emailDesigner.templateType.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TEMPLATE_TYPES) as (keyof typeof TEMPLATE_TYPES)[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {templateTypeLabel(key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Tabs defaultValue="visual" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="visual">
            <Palette className="h-4 w-4 me-2" />
            {t('emailDesigner.tabs.visual')}
          </TabsTrigger>
          <TabsTrigger value="code">
            <Code className="h-4 w-4 me-2" />
            {t('emailDesigner.tabs.code')}
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="h-4 w-4 me-2" />
            {t('emailDesigner.tabs.preview')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visual" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                {t('emailDesigner.header.title')}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('emailDesigner.header.description')}
              </p>
            </CardHeader>
            <CardContent>
              <input
                ref={headerFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleHeaderUpload(f);
                  e.target.value = '';
                }}
              />
              {headerImageUrl ? (
                <div className="space-y-3">
                  <div className="rounded-lg overflow-hidden border bg-muted/30">
                    <img src={headerImageUrl} alt={t('emailDesigner.header.alt')} className="w-full max-h-48 object-cover" />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => headerFileInputRef.current?.click()}
                      disabled={uploadingHeader}
                      className="flex-1"
                    >
                      {uploadingHeader ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Upload className="h-4 w-4 me-2" />}
                      {t('emailDesigner.header.replace')}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleRemoveHeader}
                      disabled={uploadingHeader}
                      className="flex-1 text-destructive hover:text-destructive"
                    >
                      <X className="h-4 w-4 me-2" />
                      {t('common:actions.remove')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                  onClick={() => headerFileInputRef.current?.click()}
                >
                  {uploadingHeader ? (
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
                  ) : (
                    <ImageIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  )}
                  <p className="text-sm font-medium">{uploadingHeader ? t('emailDesigner.header.uploading') : t('emailDesigner.header.clickToUpload')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('emailDesigner.header.fileHint')}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('emailDesigner.colors.title')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="primary_color">{t('emailDesigner.colors.primary')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="primary_color"
                      type="color"
                      value={currentTemplate.settings.primary_color}
                      onChange={(e) => updateSettings('primary_color', e.target.value)}
                      className="w-16 h-10"
                    />
                    <Input
                      value={currentTemplate.settings.primary_color}
                      onChange={(e) => updateSettings('primary_color', e.target.value)}
                      placeholder="#007bff"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="background_color">{t('emailDesigner.colors.background')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="background_color"
                      type="color"
                      value={currentTemplate.settings.background_color}
                      onChange={(e) => updateSettings('background_color', e.target.value)}
                      className="w-16 h-10"
                    />
                    <Input
                      value={currentTemplate.settings.background_color}
                      onChange={(e) => updateSettings('background_color', e.target.value)}
                      placeholder="#f8f9fa"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="text_color">{t('emailDesigner.colors.text')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="text_color"
                      type="color"
                      value={currentTemplate.settings.text_color}
                      onChange={(e) => updateSettings('text_color', e.target.value)}
                      className="w-16 h-10"
                    />
                    <Input
                      value={currentTemplate.settings.text_color}
                      onChange={(e) => updateSettings('text_color', e.target.value)}
                      placeholder="#333333"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('emailDesigner.signature.title')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="signature">{t('emailDesigner.signature.label')}</Label>
                  <Input
                    id="signature"
                    value={currentTemplate.settings.signature}
                    onChange={(e) => updateSettings('signature', e.target.value)}
                    placeholder={t('emailDesigner.signature.placeholder')}
                  />
                </div>

                <Separator />

                <div>
                  <Label>{t('emailDesigner.signature.availableVariables', { name: templateTypeLabel(selectedTemplateType) })}</Label>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {currentTemplate.variables.map((variable) => (
                      <Badge key={variable} variant="secondary" className="text-xs">
                        {'{{' + variable + '}}'}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="code">
          <Card>
            <CardHeader>
              <CardTitle>{t('emailDesigner.code.title')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('emailDesigner.code.description', { example: '{{variable_name}}' })}
              </p>
            </CardHeader>
            <CardContent>
              <Textarea
                value={currentTemplate.html}
                onChange={(e) => updateTemplate('html', e.target.value)}
                className="min-h-[400px] font-mono text-sm"
                placeholder={t('emailDesigner.code.placeholder')}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('emailDesigner.preview.variablesTitle')}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t('emailDesigner.preview.variablesDescription')}
                </p>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentTemplate.variables
                  .filter((v) => !AUTO_FILLED_VARS.has(v))
                  .slice(0, 6)
                  .map((variable) => {
                    const variableLabel = t(`emailDesigner.variableLabels.${variable}`, {
                      defaultValue: variable.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                    });
                    return (
                      <div key={variable}>
                        <Label htmlFor={`preview_${variable}`}>{variableLabel}</Label>
                        <Input
                          id={`preview_${variable}`}
                          value={previewVariables[variable] || ''}
                          onChange={(e) => setPreviewVariables(prev => ({ ...prev, [variable]: e.target.value }))}
                          placeholder={t('emailDesigner.preview.enterVariable', { variable: variableLabel })}
                        />
                      </div>
                    );
                  })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('emailDesigner.preview.title', { name: templateTypeLabel(selectedTemplateType) })}</CardTitle>
              </CardHeader>
              <CardContent>
                <div 
                  className="border rounded-lg p-4 bg-white min-h-[400px]"
                  dangerouslySetInnerHTML={{ __html: renderPreview() }}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};