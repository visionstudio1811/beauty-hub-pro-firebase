import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Zap,
  Calendar,
  UserPlus,
  Clock,
  Gift,
  RefreshCw,
  Mail,
  MessageSquare,
  Link as LinkIcon,
  Bell,
  XCircle,
} from 'lucide-react';
import { useAutomations, MarketingAutomation } from '@/hooks/useAutomations';
import { toast } from '@/hooks/use-toast';

interface AutomationCreationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAutomationCreated: () => void;
  /** When provided, the modal opens straight to the edit form pre-filled with this automation. */
  editAutomation?: MarketingAutomation | null;
}

interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  trigger: string;
  icon: React.ReactNode;
  delay: string;
  messageType: 'email' | 'sms' | 'both';
  subject: string;
  content: string;
}

// Template copy lives in the `marketing` namespace (automationModal.templates.*)
// so prefilled subject/content/delay follow the active language. Tokens such as
// [NAME], [DATE] inside the text are left untouched by translation.
const TEMPLATE_DEFS: { id: string; trigger: string; icon: React.ReactNode; messageType: 'email' | 'sms' | 'both' }[] = [
  { id: 'appointment_confirmation', trigger: 'appointment_scheduled', icon: <Calendar className="h-5 w-5" />, messageType: 'email' },
  { id: 'welcome', trigger: 'client_created', icon: <UserPlus className="h-5 w-5" />, messageType: 'email' },
  { id: 'birthday', trigger: 'client_birthday', icon: <Gift className="h-5 w-5" />, messageType: 'both' },
  { id: 'followup', trigger: 'appointment_completed', icon: <RefreshCw className="h-5 w-5" />, messageType: 'email' },
  { id: 'reminder', trigger: 'appointment_scheduled', icon: <Clock className="h-5 w-5" />, messageType: 'sms' },
  { id: 'reactivation', trigger: 'client_inactive', icon: <Zap className="h-5 w-5" />, messageType: 'email' },
  // ----- Public scheduler-link bookings ----------------------------------------
  // These three fire on bookings coming through shared /book/:token URLs and
  // embedded iframes. They reuse the same Resend integration + branded HTML
  // template wrapper as Appointment Confirmation, so the visitor experience
  // matches the rest of your email design.
  { id: 'booking_request_received', trigger: 'public_booking_request', icon: <LinkIcon className="h-5 w-5" />, messageType: 'email' },
  { id: 'booking_request_admin_alert', trigger: 'public_booking_request_admin', icon: <Bell className="h-5 w-5" />, messageType: 'email' },
  { id: 'booking_request_declined', trigger: 'booking_request_rejected', icon: <XCircle className="h-5 w-5" />, messageType: 'email' },
];

const buildAutomationTemplates = (t: TFunction): AutomationTemplate[] =>
  TEMPLATE_DEFS.map((def) => ({
    id: def.id,
    name: t(`automationModal.templates.${def.id}.name`),
    description: t(`automationModal.templates.${def.id}.description`),
    trigger: def.trigger,
    icon: def.icon,
    delay: t(`automationModal.templates.${def.id}.delay`),
    messageType: def.messageType,
    subject: t(`automationModal.templates.${def.id}.subject`),
    content: t(`automationModal.templates.${def.id}.content`),
  }));

export const AutomationCreationModal: React.FC<AutomationCreationModalProps> = ({
  open,
  onOpenChange,
  onAutomationCreated,
  editAutomation = null,
}) => {
  const { t } = useTranslation('marketing');
  const automationTemplates = useMemo(() => buildAutomationTemplates(t), [t]);
  const isEditing = Boolean(editAutomation);
  const [selectedTemplate, setSelectedTemplate] = useState<AutomationTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    trigger: '',
    delay: '',
    messageType: 'email' as 'email' | 'sms' | 'both',
    subject: '',
    content: '',
    isActive: true
  });
  const [isLoading, setIsLoading] = useState(false);
  const { createAutomation, updateAutomation } = useAutomations();

  React.useEffect(() => {
    if (selectedTemplate) {
      setFormData({
        name: selectedTemplate.name ?? '',
        trigger: selectedTemplate.trigger ?? '',
        delay: selectedTemplate.delay ?? '',
        messageType: selectedTemplate.messageType ?? 'email',
        subject: selectedTemplate.subject ?? '',
        content: selectedTemplate.content ?? '',
        isActive: true
      });
    }
  }, [selectedTemplate]);

  // When opening in edit mode, skip template selection and pre-fill the form
  // from the existing automation. The sentinel selectedTemplate keeps the form
  // visible (the JSX renders the form whenever selectedTemplate is truthy).
  React.useEffect(() => {
    if (!open) return;
    if (editAutomation) {
      setFormData({
        name: editAutomation.name,
        trigger: editAutomation.trigger,
        delay: editAutomation.delay,
        messageType: editAutomation.message_type,
        subject: editAutomation.subject,
        content: editAutomation.content,
        isActive: editAutomation.is_active,
      });
      setSelectedTemplate({
        id: '__edit__',
        name: editAutomation.name,
        description: '',
        trigger: editAutomation.trigger,
        icon: <Zap className="h-5 w-5" />,
        delay: editAutomation.delay,
        messageType: editAutomation.message_type,
        subject: editAutomation.subject,
        content: editAutomation.content,
      });
    } else {
      setSelectedTemplate(null);
      setFormData({
        name: '',
        trigger: '',
        delay: '',
        messageType: 'email',
        subject: '',
        content: '',
        isActive: true,
      });
    }
  }, [open, editAutomation]);

  const handleCreateAutomation = async () => {
    if (!formData.name.trim() || !formData.trigger) {
      toast({
        title: t('automationModal.toasts.missingFields'),
        description: t('automationModal.toasts.missingFieldsDescription'),
        variant: 'destructive',
      });
      return;
    }

    const draft = {
      name: formData.name.trim(),
      trigger: formData.trigger,
      delay: formData.delay,
      message_type: formData.messageType,
      subject: formData.subject,
      content: formData.content,
      is_active: formData.isActive,
    };

    setIsLoading(true);
    const ok = editAutomation
      ? await updateAutomation(editAutomation.id, draft)
      : Boolean(await createAutomation(draft));
    setIsLoading(false);

    if (!ok) return; // hook already toasted the error

    toast({
      title: editAutomation ? t('automationModal.toasts.updated') : t('automationModal.toasts.saved'),
      description: draft.is_active
        ? t('automationModal.toasts.nowActive', { name: draft.name })
        : t('automationModal.toasts.nowPaused', { name: draft.name }),
    });

    onAutomationCreated();
    onOpenChange(false);

    setFormData({
      name: '',
      trigger: '',
      delay: '',
      messageType: 'email',
      subject: '',
      content: '',
      isActive: true,
    });
    setSelectedTemplate(null);
  };

  const triggerOptions = [
    { value: 'client_created', label: t('automationModal.triggerOptions.client_created') },
    { value: 'appointment_scheduled', label: t('automationModal.triggerOptions.appointment_scheduled') },
    { value: 'appointment_completed', label: t('automationModal.triggerOptions.appointment_completed') },
    { value: 'client_birthday', label: t('automationModal.triggerOptions.client_birthday') },
    { value: 'client_inactive', label: t('automationModal.triggerOptions.client_inactive') },
    { value: 'package_expiring', label: t('automationModal.triggerOptions.package_expiring') },
    { value: 'package_expired', label: t('automationModal.triggerOptions.package_expired') },
    { value: 'public_booking_request', label: t('automationModal.triggerOptions.public_booking_request') },
    { value: 'public_booking_request_admin', label: t('automationModal.triggerOptions.public_booking_request_admin') },
    { value: 'booking_request_rejected', label: t('automationModal.triggerOptions.booking_request_rejected') },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('automationModal.titleEdit') : t('automationModal.titleCreate')}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? t('automationModal.descriptionEdit')
              : t('automationModal.descriptionCreate')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Template Selection — only shown when creating, not editing */}
          {!selectedTemplate && !isEditing && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">{t('automationModal.chooseTemplate')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {automationTemplates.map((template) => (
                  <Card
                    key={template.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedTemplate(template)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        {template.icon}
                        <CardTitle className="text-base">{template.name}</CardTitle>
                      </div>
                      <CardDescription className="text-sm">
                        {template.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary">
                          {t(`messageType.${template.messageType}`, { defaultValue: template.messageType.toUpperCase() })}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {t('automationModal.delay', { delay: template.delay })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  setSelectedTemplate({
                    id: '__custom__',
                    name: '',
                    description: t('automationModal.customDescription'),
                    trigger: '',
                    icon: <Zap className="h-5 w-5" />,
                    delay: '',
                    messageType: 'email',
                    subject: '',
                    content: '',
                  })
                }
              >
                {t('automationModal.createCustom')}
              </Button>
            </div>
          )}

          {/* Automation Form */}
          {selectedTemplate && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">{t('automationModal.automationDetails')}</h3>
                {!isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTemplate(null)}
                  >
                    {t('automationModal.changeTemplate')}
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('automationModal.fields.name')}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder={t('automationModal.fields.namePlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="trigger">{t('automationModal.fields.trigger')}</Label>
                  <Select
                    value={formData.trigger}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, trigger: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('automationModal.fields.triggerPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {triggerOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="delay">{t('automationModal.fields.delay')}</Label>
                  <Input
                    id="delay"
                    value={formData.delay}
                    onChange={(e) => setFormData(prev => ({ ...prev, delay: e.target.value }))}
                    placeholder={t('automationModal.fields.delayPlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messageType">{t('automationModal.fields.messageType')}</Label>
                  <Select
                    value={formData.messageType}
                    onValueChange={(value: 'email' | 'sms' | 'both') => 
                      setFormData(prev => ({ ...prev, messageType: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">
                        <div className="flex items-center">
                          <Mail className="h-4 w-4 me-2" />
                          {t('automationModal.fields.typeEmail')}
                        </div>
                      </SelectItem>
                      <SelectItem value="sms">
                        <div className="flex items-center">
                          <MessageSquare className="h-4 w-4 me-2" />
                          {t('automationModal.fields.typeSms')}
                        </div>
                      </SelectItem>
                      <SelectItem value="both">
                        <div className="flex items-center">
                          <Mail className="h-4 w-4 me-1" />
                          <MessageSquare className="h-4 w-4 me-2" />
                          {t('automationModal.fields.typeBoth')}
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(formData.messageType === 'email' || formData.messageType === 'both') && (
                <div className="space-y-2">
                  <Label htmlFor="subject">{t('automationModal.fields.subject')}</Label>
                  <Input
                    id="subject"
                    value={formData.subject}
                    onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder={t('automationModal.fields.subjectPlaceholder')}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="content">{t('automationModal.fields.content')}</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  placeholder={t('automationModal.fields.contentPlaceholder')}
                  rows={4}
                />
                <p className="text-sm text-muted-foreground">
                  {t('automationModal.fields.variablesHint')}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          {selectedTemplate && (
            <Button onClick={handleCreateAutomation} disabled={isLoading || !formData.name.trim()}>
              {isLoading
                ? (isEditing ? t('automationModal.saving') : t('automationModal.creating'))
                : (isEditing ? t('automationModal.saveChanges') : t('automationModal.createAutomation'))}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};