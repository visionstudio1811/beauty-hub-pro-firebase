import React, { useState, useEffect, useRef } from 'react';
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
import { getDefaultTemplateHtml, ELEGANT_DEFAULT_SETTINGS, type TemplateType } from './emailTemplates';

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

const AUTOMATION_META: Record<AutomationKey, { title: string; description: string; trigger: string }> = {
  welcome: {
    title: 'Welcome / Thank You',
    description: 'Sent automatically when a client purchases a package.',
    trigger: 'On package purchase',
  },
  birthday: {
    title: 'Birthday Greeting',
    description: 'Sent on each client\'s birthday at 9am local time.',
    trigger: 'Daily at 9am — matches client birthday',
  },
  inactive: {
    title: 'Win-Back / Inactive Client',
    description: 'Sent when a client hasn\'t visited for the configured number of days.',
    trigger: 'Daily at 9am — based on last completed visit',
  },
  package_renewal: {
    title: 'Package Renewal Reminder',
    description: 'Sent before a client\'s active package expires.',
    trigger: 'Daily — before expiry date',
  },
  appointment_reminder: {
    title: 'Appointment Reminder',
    description: 'Sent ahead of an upcoming appointment.',
    trigger: 'Hourly — before appointment time',
  },
};

const DEFAULT_SETTINGS: EmailTemplate['settings'] = {
  ...ELEGANT_DEFAULT_SETTINGS,
};

const DEFAULT_TEMPLATE: EmailTemplate = {
  name: "General Template",
  html: getDefaultTemplateHtml('general'),
  variables: [...TEMPLATE_TYPES.general.variables],
  settings: DEFAULT_SETTINGS,
};

export const EmailTemplateDesigner: React.FC<EmailTemplateDesignerProps> = ({ onUpdate }) => {
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
  const [previewVariables, setPreviewVariables] = useState<Record<string, string>>({
    subject: "A note from us",
    message: "Thank you for being a part of our community. We're so happy to have you with us.",
    organization_name: "Your Business",
    client_name: "Jane",
    organization_phone: "(555) 123-4567",
    organization_address: "123 Main St, City, State",
    organization_email: "hello@yourbusiness.com",
    sender_name: "The Team",
    date: new Date().toLocaleDateString(),
    cta_url: "",
    birthday_date: "March 15",
    special_offer: "20% off your next treatment",
    discount_code: "BIRTHDAY20",
    last_visit_date: "6 months ago",
    months_inactive: "6",
    comeback_offer: "15% off your next visit",
    package_name: "Ultimate Spa Package",
    expiry_date: "March 30",
    sessions_remaining: "3",
    renewal_discount: "10% off renewal",
    appointment_date: "Tomorrow",
    appointment_time: "2:00 PM",
    service_name: "Deep Cleansing Facial",
    staff_name: "Sarah",
    location: "Room 3"
  });

  const { currentOrganization } = useOrganization();
  const { toast } = useToast();

  const currentTemplate = templates[selectedTemplateType] || {
    ...DEFAULT_TEMPLATE,
    name: TEMPLATE_TYPES[selectedTemplateType].name,
    html: getDefaultTemplateHtml(selectedTemplateType as TemplateType),
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
      toast({ title: 'Invalid file', description: 'Please choose an image (PNG, JPG, WEBP).', variant: 'destructive' });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Header image must be under 8MB.', variant: 'destructive' });
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
      toast({ title: 'Header image saved', description: 'The new image will appear on all your email templates.' });
      onUpdate?.();
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
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
      toast({ title: 'Header image removed' });
    } catch (error: any) {
      toast({ title: 'Failed to remove image', description: error.message, variant: 'destructive' });
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
        title: "Template saved",
        description: `${TEMPLATE_TYPES[selectedTemplateType].name} has been updated successfully.`,
      });

      onUpdate?.();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error saving template",
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
      toast({ title: 'Automations saved', description: 'Your automation settings have been updated.' });
      onUpdate?.();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error saving automations', description: error.message });
    } finally {
      setSavingAutomations(false);
    }
  };

  const resetTemplate = () => {
    const defaultTemplate = {
      ...DEFAULT_TEMPLATE,
      name: TEMPLATE_TYPES[selectedTemplateType].name,
      html: getDefaultTemplateHtml(selectedTemplateType),
      variables: TEMPLATE_TYPES[selectedTemplateType].variables
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
    return <div className="p-6">Loading templates...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Email Template Designer</h3>
          <p className="text-sm text-muted-foreground">
            Customize your email templates with your brand colors and styling
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetTemplate}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button onClick={saveTemplate} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Template'}
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
                Email Automations
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Activate any of these to send your designed templates automatically. Saved separately from the template content.
              </p>
            </div>
            <Button onClick={saveAutomations} disabled={savingAutomations} size="sm">
              <Save className="h-4 w-4 mr-2" />
              {savingAutomations ? 'Saving...' : 'Save Automations'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {(Object.keys(AUTOMATION_META) as AutomationKey[]).map((key) => {
            const meta = AUTOMATION_META[key];
            const cfg = automations[key];
            return (
              <div key={key} className="rounded-lg border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{meta.title}</span>
                    {cfg.is_active && <Badge variant="default">Active</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{meta.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Trigger: {meta.trigger}</p>
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
                      VIP only
                    </label>
                  )}
                  {key === 'birthday' && cfg.is_active && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">Days offset</Label>
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
                      <Label className="text-xs whitespace-nowrap">Days inactive</Label>
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
                      <Label className="text-xs whitespace-nowrap">Days before expiry</Label>
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
                      <Label className="text-xs whitespace-nowrap">Hours before</Label>
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
            Template Type
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedTemplateType} onValueChange={(value: keyof typeof TEMPLATE_TYPES) => setSelectedTemplateType(value)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select template type" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TEMPLATE_TYPES).map(([key, type]) => (
                <SelectItem key={key} value={key}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Tabs defaultValue="visual" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="visual">
            <Palette className="h-4 w-4 mr-2" />
            Visual Editor
          </TabsTrigger>
          <TabsTrigger value="code">
            <Code className="h-4 w-4 mr-2" />
            HTML Editor
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visual" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Header Image
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Shown at the top of every email. Recommended: 1200×400px, JPG or PNG, under 8MB.
                Used across all template types — change once, update everywhere.
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
                    <img src={headerImageUrl} alt="Email header" className="w-full max-h-48 object-cover" />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => headerFileInputRef.current?.click()}
                      disabled={uploadingHeader}
                      className="flex-1"
                    >
                      {uploadingHeader ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                      Replace Image
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleRemoveHeader}
                      disabled={uploadingHeader}
                      className="flex-1 text-destructive hover:text-destructive"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Remove
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
                  <p className="text-sm font-medium">{uploadingHeader ? 'Uploading…' : 'Click to upload header image'}</p>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WEBP up to 8MB</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Brand Colors</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="primary_color">Primary Color</Label>
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
                  <Label htmlFor="background_color">Background Color</Label>
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
                  <Label htmlFor="text_color">Text Color</Label>
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
                <CardTitle>Signature & Content</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="signature">Email Signature</Label>
                  <Input
                    id="signature"
                    value={currentTemplate.settings.signature}
                    onChange={(e) => updateSettings('signature', e.target.value)}
                    placeholder="Best regards"
                  />
                </div>

                <Separator />

                <div>
                  <Label>Available Variables for {TEMPLATE_TYPES[selectedTemplateType].name}</Label>
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
              <CardTitle>HTML Template Editor</CardTitle>
              <p className="text-sm text-muted-foreground">
                Edit the raw HTML template. Use variables like {'{{variable_name}}'} for dynamic content.
              </p>
            </CardHeader>
            <CardContent>
              <Textarea
                value={currentTemplate.html}
                onChange={(e) => updateTemplate('html', e.target.value)}
                className="min-h-[400px] font-mono text-sm"
                placeholder="Enter your HTML template here..."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Preview Variables</CardTitle>
                <p className="text-sm text-muted-foreground">
                  These are sample values for the preview only. Business name, phone, address,
                  email, logo, and header image are pulled from your real settings.
                </p>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentTemplate.variables
                  .filter((v) => !AUTO_FILLED_VARS.has(v))
                  .slice(0, 6)
                  .map((variable) => (
                    <div key={variable}>
                      <Label htmlFor={`preview_${variable}`}>{variable.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</Label>
                      <Input
                        id={`preview_${variable}`}
                        value={previewVariables[variable] || ''}
                        onChange={(e) => setPreviewVariables(prev => ({ ...prev, [variable]: e.target.value }))}
                        placeholder={`Enter ${variable}`}
                      />
                    </div>
                  ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Email Preview - {TEMPLATE_TYPES[selectedTemplateType].name}</CardTitle>
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