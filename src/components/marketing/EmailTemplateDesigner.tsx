import React, { useState, useEffect } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Palette, Eye, Save, RotateCcw, Code, Mail } from 'lucide-react';

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

const TEMPLATE_TYPES = {
  general: { 
    name: 'General Template', 
    variables: ["subject", "message", "organization_name", "client_name", "logo_url", "organization_phone", "organization_address", "sender_name", "date"]
  },
  birthday: { 
    name: 'Birthday Template', 
    variables: ["client_name", "birthday_date", "special_offer", "discount_code", "organization_name", "logo_url", "organization_phone", "sender_name", "date"]
  },
  inactive: { 
    name: 'Inactive Client Template', 
    variables: ["client_name", "last_visit_date", "months_inactive", "comeback_offer", "organization_name", "logo_url", "organization_phone", "sender_name", "date"]
  },
  package_renewal: { 
    name: 'Package Renewal Template', 
    variables: ["client_name", "package_name", "expiry_date", "sessions_remaining", "renewal_discount", "organization_name", "logo_url", "organization_phone", "sender_name", "date"]
  },
  appointment_reminder: { 
    name: 'Appointment Reminder Template', 
    variables: ["client_name", "appointment_date", "appointment_time", "service_name", "staff_name", "location", "organization_name", "logo_url", "organization_phone", "sender_name", "date"]
  }
};

const getDefaultTemplateHtml = (type: keyof typeof TEMPLATE_TYPES): string => {
  const baseHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: {{background_color}}">
  <div style="background-color: {{card_background}}; padding: 20px; border-radius: 8px; margin: 20px;">
    <div style="text-align: center; margin-bottom: 20px;">
      {{#if logo_url}}<img src="{{logo_url}}" alt="{{organization_name}}" style="max-height: 60px; margin-bottom: 10px;">{{/if}}
      <h2 style="color: {{primary_color}}; margin: 0;">`;

  const templates = {
    general: baseHtml + `{{subject}}</h2>
    </div>
    <div style="background-color: {{content_background}}; padding: 20px; border-radius: 6px; border-left: 4px solid {{primary_color}};">
      <div style="color: {{text_color}}; line-height: 1.6;">{{message}}</div>
    </div>`,
    
    birthday: baseHtml + `🎉 Happy Birthday {{client_name}}! 🎉</h2>
    </div>
    <div style="background-color: {{content_background}}; padding: 20px; border-radius: 6px; border-left: 4px solid {{primary_color}};">
      <div style="color: {{text_color}}; line-height: 1.6;">
        <p>We hope you have a wonderful birthday on {{birthday_date}}!</p>
        <p>As a special birthday gift, we'd like to offer you {{special_offer}}.</p>
        <p style="text-align: center; margin: 20px 0;">
          <strong style="background: {{primary_color}}; color: white; padding: 10px 20px; border-radius: 5px;">
            Use code: {{discount_code}}
          </strong>
        </p>
      </div>
    </div>`,
    
    inactive: baseHtml + `We Miss You, {{client_name}}!</h2>
    </div>
    <div style="background-color: {{content_background}}; padding: 20px; border-radius: 6px; border-left: 4px solid {{primary_color}};">
      <div style="color: {{text_color}}; line-height: 1.6;">
        <p>It's been {{months_inactive}} months since your last visit on {{last_visit_date}}.</p>
        <p>We'd love to see you again! Come back and enjoy {{comeback_offer}}.</p>
        <p>Book your appointment today and let us take care of you!</p>
      </div>
    </div>`,
    
    package_renewal: baseHtml + `Time to Renew Your {{package_name}}!</h2>
    </div>
    <div style="background-color: {{content_background}}; padding: 20px; border-radius: 6px; border-left: 4px solid {{primary_color}};">
      <div style="color: {{text_color}}; line-height: 1.6;">
        <p>Hi {{client_name}},</p>
        <p>Your {{package_name}} expires on {{expiry_date}} with {{sessions_remaining}} sessions remaining.</p>
        <p>Renew now and save with {{renewal_discount}}!</p>
        <p>Don't miss out on continuing your wellness journey with us.</p>
      </div>
    </div>`,
    
    appointment_reminder: baseHtml + `Appointment Reminder</h2>
    </div>
    <div style="background-color: {{content_background}}; padding: 20px; border-radius: 6px; border-left: 4px solid {{primary_color}};">
      <div style="color: {{text_color}}; line-height: 1.6;">
        <p>Hi {{client_name}},</p>
        <p>This is a reminder of your upcoming appointment:</p>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
          <p><strong>Service:</strong> {{service_name}}</p>
          <p><strong>Date:</strong> {{appointment_date}}</p>
          <p><strong>Time:</strong> {{appointment_time}}</p>
          <p><strong>Practitioner:</strong> {{staff_name}}</p>
          <p><strong>Location:</strong> {{location}}</p>
        </div>
        <p>We look forward to seeing you!</p>
      </div>
    </div>`
  };

  return templates[type] + `
    <div style="margin-top: 20px; text-align: center;">
      <p style="color: {{secondary_text}}; font-size: 14px; margin: 0;">{{signature}}</p>
      <p style="color: {{secondary_text}}; font-size: 12px; margin: 5px 0 0 0;">{{organization_name}}{{#if organization_phone}} • {{organization_phone}}{{/if}}</p>
    </div>
  </div>
</body>
</html>`;
};

const DEFAULT_TEMPLATE: EmailTemplate = {
  name: "General Template",
  html: getDefaultTemplateHtml('general'),
  variables: TEMPLATE_TYPES.general.variables,
  settings: {
    primary_color: "#007bff",
    background_color: "#f8f9fa", 
    card_background: "#ffffff",
    content_background: "#ffffff",
    text_color: "#333333",
    secondary_text: "#666666",
    signature: "Best regards"
  }
};

export const EmailTemplateDesigner: React.FC<EmailTemplateDesignerProps> = ({ onUpdate }) => {
  const [selectedTemplateType, setSelectedTemplateType] = useState<keyof typeof TEMPLATE_TYPES>('general');
  const [templates, setTemplates] = useState<Record<string, EmailTemplate>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewVariables, setPreviewVariables] = useState<Record<string, string>>({
    subject: "Welcome to our service!",
    message: "Thank you for joining us. We're excited to have you on board!",
    organization_name: "Your Business",
    client_name: "John Doe",
    organization_phone: "(555) 123-4567",
    date: new Date().toLocaleDateString(),
    birthday_date: "March 15th",
    special_offer: "20% off your next treatment",
    discount_code: "BIRTHDAY20",
    last_visit_date: "6 months ago",
    months_inactive: "6",
    comeback_offer: "15% off your next visit",
    package_name: "Ultimate Spa Package",
    expiry_date: "March 30th",
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
    html: getDefaultTemplateHtml(selectedTemplateType),
    variables: TEMPLATE_TYPES[selectedTemplateType].variables
  };

  useEffect(() => {
    fetchTemplates();
  }, [currentOrganization?.id]);

  const fetchTemplates = async () => {
    if (!currentOrganization?.id) return;

    setLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'marketingIntegrations'),
          where('provider', '==', 'resend')
        )
      );
      if (!snap.empty) {
        const data = snap.docs[0].data();
        if (data.email_templates && typeof data.email_templates === 'object' && !Array.isArray(data.email_templates)) {
          setTemplates(data.email_templates as any);
        }
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
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

      // Find the resend integration doc and update it
      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'marketingIntegrations'),
          where('provider', '==', 'resend')
        )
      );
      if (!snap.empty) {
        await updateDoc(
          doc(db, 'organizations', currentOrganization.id, 'marketingIntegrations', snap.docs[0].id),
          { email_templates: JSON.parse(JSON.stringify(updatedTemplates)) }
        );
      }

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
    const variables = { ...currentTemplate.settings, ...previewVariables };
    
    // Replace variables
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(regex, value || '');
    }
    
    // Handle conditionals
    html = html.replace(/{{#if\s+(\w+)}}(.*?){{\/if}}/g, (match, varName, content) => {
      return variables[varName as keyof typeof variables] ? content : '';
    });
    
    // Clean up remaining template syntax
    html = html.replace(/{{[^}]*}}/g, '');

    // Sanitize to prevent XSS — strip scripts and event handlers while preserving structure/styles
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
                  Customize the preview data to see how your template will look
                </p>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentTemplate.variables.slice(0, 6).map((variable) => (
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