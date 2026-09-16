import React, { useState, useEffect, useMemo } from 'react';
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
import { CalendarIcon, Users, Mail, MessageSquare, Gift, UserCheck, RotateCcw } from 'lucide-react';
import { collection, addDoc, doc, getDoc, getDocs, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useTimezone } from '@/hooks/useTimezone';
import { toast } from '@/hooks/use-toast';
import { SmsProvider } from '@/types/sms';
import { getDateFnsLocale } from '@/i18n/dateLocale';

interface CampaignCreationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: string;
  onCampaignCreated: () => void;
}

interface CampaignTemplate {
  id: string;
  name: string;
  description: string;
  type: 'email' | 'sms' | 'both';
  icon: React.ReactNode;
  subject: string;
  content: string;
  targetAudience: string;
}

// Template copy lives in the `marketing` namespace (campaignModal.templates.*)
// so prefilled subject/content follow the active language. Tokens inside the
// text are left untouched by translation.
const buildTemplates = (t: TFunction): CampaignTemplate[] => [
  {
    id: 'birthday',
    name: t('campaignModal.templates.birthday.name'),
    description: t('campaignModal.templates.birthday.description'),
    type: 'both',
    icon: <Gift className="h-5 w-5" />,
    subject: t('campaignModal.templates.birthday.subject'),
    content: t('campaignModal.templates.birthday.content'),
    targetAudience: t('campaignModal.templates.birthday.targetAudience')
  },
  {
    id: 'reactivation',
    name: t('campaignModal.templates.reactivation.name'),
    description: t('campaignModal.templates.reactivation.description'),
    type: 'email',
    icon: <UserCheck className="h-5 w-5" />,
    subject: t('campaignModal.templates.reactivation.subject'),
    content: t('campaignModal.templates.reactivation.content'),
    targetAudience: t('campaignModal.templates.reactivation.targetAudience')
  },
  {
    id: 'renewal',
    name: t('campaignModal.templates.renewal.name'),
    description: t('campaignModal.templates.renewal.description'),
    type: 'sms',
    icon: <RotateCcw className="h-5 w-5" />,
    subject: t('campaignModal.templates.renewal.subject'),
    content: t('campaignModal.templates.renewal.content'),
    targetAudience: t('campaignModal.templates.renewal.targetAudience')
  }
];

export const CampaignCreationModal: React.FC<CampaignCreationModalProps> = ({
  open,
  onOpenChange,
  template,
  onCampaignCreated
}) => {
  const { t } = useTranslation('marketing');
  const templates = useMemo(() => buildTemplates(t), [t]);
  const [selectedTemplate, setSelectedTemplate] = useState<CampaignTemplate | null>(
    template ? templates.find(tpl => tpl.id === template) || null : null
  );
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    content: '',
    type: 'email' as 'email' | 'sms' | 'both',
    targetAudience: 'all',
    scheduleType: 'now' as 'now' | 'scheduled',
    scheduledDate: '',
    scheduledTime: '',
    smsProvider: '' as '' | SmsProvider,
  });
  const [providerOptions, setProviderOptions] = useState<{ twilio: boolean; infobip: boolean; quo: boolean }>({ twilio: false, infobip: false, quo: false });
  const [smsTemplates, setSmsTemplates] = useState<{ id: string; name: string; body: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const timezone = useTimezone();

  // Resolve the entered wall-clock date/time as an instant in the org's
  // configured timezone. Returns the UTC Date, or null if the inputs are
  // missing or unparseable. This is the single source of truth for both the
  // validation guard and the "resolved send time" preview — `fromZonedTime`
  // interprets "YYYY-MM-DDTHH:mm" as local-to-`timezone` and yields the correct
  // UTC instant, replacing the previous timezone-naive `new Date(string)` parse.
  const resolveScheduledInstant = (): Date | null => {
    if (formData.scheduleType !== 'scheduled') return null;
    if (!formData.scheduledDate || !formData.scheduledTime) return null;
    try {
      const utc = fromZonedTime(`${formData.scheduledDate}T${formData.scheduledTime}`, timezone);
      return isNaN(utc.getTime()) ? null : utc;
    } catch {
      return null;
    }
  };

  const scheduledInstant = resolveScheduledInstant();

  // Field-level validation. Returns null when the form is safe to submit, or a
  // user-facing message describing the first problem. Guards against the
  // Invalid-Date RangeError that a bad scheduled date/time would throw at
  // `.toISOString()` time.
  const getValidationError = (): string | null => {
    if (!formData.name.trim()) return t('campaignModal.validation.nameRequired');
    const needsEmail = formData.type === 'email' || formData.type === 'both';
    if (needsEmail && !formData.subject.trim()) return t('campaignModal.validation.subjectRequired');
    if (!formData.content.trim()) return t('campaignModal.validation.contentRequired');
    if (formData.scheduleType === 'scheduled') {
      if (!formData.scheduledDate) return t('campaignModal.validation.dateRequired');
      if (!formData.scheduledTime) return t('campaignModal.validation.timeRequired');
      if (!scheduledInstant) return t('campaignModal.validation.invalidDateTime');
    }
    return null;
  };

  const validationError = getValidationError();

  useEffect(() => {
    if (!open || !currentOrganization?.id) return;
    const loadProviders = async () => {
      const [twilioSnap, infobipSnap, quoSnap] = await Promise.all([
        getDoc(doc(db, 'organizations', currentOrganization.id, 'marketingIntegrations', 'twilio')),
        getDoc(doc(db, 'organizations', currentOrganization.id, 'marketingIntegrations', 'infobip')),
        getDoc(doc(db, 'organizations', currentOrganization.id, 'marketingIntegrations', 'quo')),
      ]);
      const twilioEnabled = twilioSnap.exists() && twilioSnap.data()?.is_enabled === true;
      const infobipEnabled = infobipSnap.exists() && infobipSnap.data()?.is_enabled === true;
      const quoEnabled = quoSnap.exists() && quoSnap.data()?.is_enabled === true;
      setProviderOptions({ twilio: twilioEnabled, infobip: infobipEnabled, quo: quoEnabled });
      setFormData((prev) => {
        if (prev.smsProvider) return prev;
        if (infobipEnabled) return { ...prev, smsProvider: 'infobip' };
        if (twilioEnabled) return { ...prev, smsProvider: 'twilio' };
        if (quoEnabled) return { ...prev, smsProvider: 'quo' };
        return prev;
      });
    };
    loadProviders();

    const loadSmsTemplates = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'organizations', currentOrganization.id, 'smsTemplates'), orderBy('updated_at', 'desc')),
        );
        setSmsTemplates(snap.docs.map((d) => ({ id: d.id, name: d.data().name ?? '', body: d.data().body ?? '' })));
      } catch (err) {
        console.error('Error loading SMS templates:', err);
      }
    };
    loadSmsTemplates();
  }, [open, currentOrganization?.id]);

  React.useEffect(() => {
    if (selectedTemplate) {
      setFormData(prev => ({
        ...prev,
        name: selectedTemplate.name,
        subject: selectedTemplate.subject,
        content: selectedTemplate.content,
        type: selectedTemplate.type
      }));
    }
  }, [selectedTemplate]);

  const handleCreateCampaign = async () => {
    if (!currentOrganization?.id) {
      toast({
        title: t('common:status.error'),
        description: t('campaignModal.toasts.orgNotFound'),
        variant: "destructive"
      });
      return;
    }

    // Block submission on validation errors instead of letting a bad scheduled
    // date/time reach `.toISOString()` and throw an Invalid-Date RangeError.
    const error = getValidationError();
    if (error) {
      toast({ title: t('campaignModal.toasts.fixForm'), description: error, variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const now = new Date().toISOString();
      const needsSms = formData.type === 'sms' || formData.type === 'both';
      const campaignData = {
        organization_id: currentOrganization.id,
        name: formData.name,
        type: formData.type,
        subject: formData.subject,
        content: formData.content,
        target_audience: formData.targetAudience,
        status: formData.scheduleType === 'now' ? 'draft' : 'scheduled',
        // `scheduledInstant` is the UTC instant of the entered wall-clock time
        // interpreted in the org timezone (see resolveScheduledInstant). We
        // also persist the timezone the sender chose so downstream senders can
        // display/interpret the intended local time unambiguously.
        scheduled_at: formData.scheduleType === 'scheduled' && scheduledInstant
          ? scheduledInstant.toISOString()
          : null,
        scheduled_timezone: formData.scheduleType === 'scheduled' ? timezone : null,
        created_by: user?.uid ?? null,
        sent_count: 0,
        opened_count: 0,
        clicked_count: 0,
        delivered_count: 0,
        failed_count: 0,
        total_recipients: 0,
        created_at: now,
        updated_at: now,
        created_at_ts: serverTimestamp(),
        ...(needsSms && formData.smsProvider ? { sms_provider: formData.smsProvider } : {}),
      };

      await addDoc(
        collection(db, 'organizations', currentOrganization.id, 'marketingCampaigns'),
        campaignData
      );

      toast({
        title: t('campaignModal.toasts.created'),
        description: t('campaignModal.toasts.createdDescription', {
          type: t(`campaignType.${formData.type}`, { defaultValue: formData.type }),
          name: formData.name,
        })
      });

      onCampaignCreated();
      onOpenChange(false);
      
      // Reset form
      setFormData({
        name: '',
        subject: '',
        content: '',
        type: 'email',
        targetAudience: 'all',
        scheduleType: 'now',
        scheduledDate: '',
        scheduledTime: '',
        smsProvider: '',
      });
      setSelectedTemplate(null);
    } catch (error: any) {
      toast({
        title: t('campaignModal.toasts.createError'),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('campaignModal.title')}</DialogTitle>
          <DialogDescription>
            {t('campaignModal.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Template Selection */}
          {!selectedTemplate && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">{t('campaignModal.chooseTemplate')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {templates.map((template) => (
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
                          {t(`messageType.${template.type}`, { defaultValue: template.type.toUpperCase() })}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {template.targetAudience}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => setSelectedTemplate({} as CampaignTemplate)}
              >
                {t('campaignModal.startFromScratch')}
              </Button>
            </div>
          )}

          {/* Campaign Form */}
          {selectedTemplate && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">{t('campaignModal.campaignDetails')}</h3>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setSelectedTemplate(null)}
                >
                  {t('campaignModal.changeTemplate')}
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('campaignModal.fields.name')}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder={t('campaignModal.fields.namePlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">{t('campaignModal.fields.type')}</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: 'email' | 'sms' | 'both') => 
                      setFormData(prev => ({ ...prev, type: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">
                        <div className="flex items-center">
                          <Mail className="h-4 w-4 me-2" />
                          {t('campaignModal.fields.typeEmail')}
                        </div>
                      </SelectItem>
                      <SelectItem value="sms">
                        <div className="flex items-center">
                          <MessageSquare className="h-4 w-4 me-2" />
                          {t('campaignModal.fields.typeSms')}
                        </div>
                      </SelectItem>
                      <SelectItem value="both">
                        <div className="flex items-center">
                          <Users className="h-4 w-4 me-2" />
                          {t('campaignModal.fields.typeBoth')}
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(formData.type === 'email' || formData.type === 'both') && (
                <div className="space-y-2">
                  <Label htmlFor="subject">{t('campaignModal.fields.subject')}</Label>
                  <Input
                    id="subject"
                    value={formData.subject}
                    onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder={t('campaignModal.fields.subjectPlaceholder')}
                  />
                </div>
              )}

              {(formData.type === 'sms' || formData.type === 'both') && (
                <div className="space-y-2">
                  <Label htmlFor="smsProvider">{t('campaignModal.fields.smsProvider')}</Label>
                  <Select
                    value={formData.smsProvider || undefined}
                    onValueChange={(value: SmsProvider) =>
                      setFormData(prev => ({ ...prev, smsProvider: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('campaignModal.fields.smsProviderAuto')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="infobip" disabled={!providerOptions.infobip}>
                        Infobip {!providerOptions.infobip && t('campaignModal.fields.notConfigured')}
                      </SelectItem>
                      <SelectItem value="twilio" disabled={!providerOptions.twilio}>
                        Twilio {!providerOptions.twilio && t('campaignModal.fields.notConfigured')}
                      </SelectItem>
                      <SelectItem value="quo" disabled={!providerOptions.quo}>
                        Quo {!providerOptions.quo && t('campaignModal.fields.notConfigured')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {!providerOptions.twilio && !providerOptions.infobip && !providerOptions.quo && (
                    <p className="text-xs text-destructive">
                      {t('campaignModal.fields.noProviderEnabled')}
                    </p>
                  )}
                  {smsTemplates.length > 0 && (
                    <div className="space-y-1">
                      <Label htmlFor="smsTemplate">{t('campaignModal.fields.loadSmsTemplate')}</Label>
                      <Select
                        onValueChange={(id) => {
                          const tpl = smsTemplates.find((item) => item.id === id);
                          if (tpl) setFormData((prev) => ({ ...prev, content: tpl.body }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('campaignModal.fields.loadSmsTemplatePlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {smsTemplates.map((item) => (
                            <SelectItem key={item.id} value={item.id}>{item.name || t('campaignModal.fields.untitled')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t('campaignModal.fields.stopFooterNote')}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="content">{t('campaignModal.fields.content')}</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  placeholder={t('campaignModal.fields.contentPlaceholder')}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="audience">{t('campaignModal.fields.audience')}</Label>
                <Select
                  value={formData.targetAudience}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, targetAudience: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('campaignModal.fields.audienceAll')}</SelectItem>
                    <SelectItem value="active">{t('campaignModal.fields.audienceActive')}</SelectItem>
                    <SelectItem value="inactive">{t('campaignModal.fields.audienceInactive')}</SelectItem>
                    <SelectItem value="birthday">{t('campaignModal.fields.audienceBirthday')}</SelectItem>
                    <SelectItem value="expiring">{t('campaignModal.fields.audienceExpiring')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <Label>{t('campaignModal.fields.schedule')}</Label>
                <div className="flex space-x-4 rtl:space-x-reverse">
                  <Button
                    type="button"
                    variant={formData.scheduleType === 'now' ? 'default' : 'outline'}
                    onClick={() => setFormData(prev => ({ ...prev, scheduleType: 'now' }))}
                  >
                    {t('campaignModal.fields.sendNow')}
                  </Button>
                  <Button
                    type="button"
                    variant={formData.scheduleType === 'scheduled' ? 'default' : 'outline'}
                    onClick={() => setFormData(prev => ({ ...prev, scheduleType: 'scheduled' }))}
                  >
                    <CalendarIcon className="h-4 w-4 me-2" />
                    {t('campaignModal.fields.scheduleButton')}
                  </Button>
                </div>

                {formData.scheduleType === 'scheduled' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="date">{t('campaignModal.fields.date')}</Label>
                        <Input
                          id="date"
                          type="date"
                          value={formData.scheduledDate}
                          onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="time">{t('campaignModal.fields.time')}</Label>
                        <Input
                          id="time"
                          type="time"
                          value={formData.scheduledTime}
                          onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))}
                        />
                      </div>
                    </div>
                    {(!formData.scheduledDate || !formData.scheduledTime) && (
                      <p className="text-xs text-destructive">
                        {t('campaignModal.fields.chooseDateAndTime')}
                      </p>
                    )}
                    {scheduledInstant && (
                      <p className="text-xs text-muted-foreground">
                        {t('campaignModal.fields.willSend', {
                          when: formatInTimeZone(scheduledInstant, timezone, t('campaignModal.fields.willSendFormat'), { locale: getDateFnsLocale() }),
                          timezone,
                        })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          {selectedTemplate && (
            <div className="flex flex-col items-end gap-1">
              <Button onClick={handleCreateCampaign} disabled={isLoading || !!validationError}>
                {isLoading ? t('campaignModal.creating') : t('campaignModal.createCampaign')}
              </Button>
              {validationError && (
                <p className="text-xs text-destructive">{validationError}</p>
              )}
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};