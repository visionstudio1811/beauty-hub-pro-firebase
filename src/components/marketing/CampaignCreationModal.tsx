import React, { useState, useEffect } from 'react';
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

const templates: CampaignTemplate[] = [
  {
    id: 'birthday',
    name: 'Birthday Special',
    description: 'Send personalized birthday offers to clients',
    type: 'both',
    icon: <Gift className="h-5 w-5" />,
    subject: '🎉 Happy Birthday! Special Gift Inside',
    content: 'Happy Birthday! As a special gift, enjoy 20% off your next appointment. Book now and celebrate with us!',
    targetAudience: 'Clients with birthdays this month'
  },
  {
    id: 'reactivation',
    name: 'Inactive Clients',
    description: 'Re-engage clients who haven\'t visited recently',
    type: 'email',
    icon: <UserCheck className="h-5 w-5" />,
    subject: 'We Miss You! Come Back for 15% Off',
    content: 'It\'s been a while since your last visit. We miss you! Come back and enjoy 15% off your next service.',
    targetAudience: 'Clients inactive for 3+ months'
  },
  {
    id: 'renewal',
    name: 'Package Renewal',
    description: 'Remind clients to renew their packages',
    type: 'sms',
    icon: <RotateCcw className="h-5 w-5" />,
    subject: 'Package Renewal Reminder',
    content: 'Your package is about to expire! Renew now to continue enjoying our services at the best rates.',
    targetAudience: 'Clients with expiring packages'
  }
];

export const CampaignCreationModal: React.FC<CampaignCreationModalProps> = ({
  open,
  onOpenChange,
  template,
  onCampaignCreated
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<CampaignTemplate | null>(
    template ? templates.find(t => t.id === template) || null : null
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
    if (!formData.name.trim()) return 'Please enter a campaign name.';
    const needsEmail = formData.type === 'email' || formData.type === 'both';
    if (needsEmail && !formData.subject.trim()) return 'Please enter an email subject.';
    if (!formData.content.trim()) return 'Please enter message content.';
    if (formData.scheduleType === 'scheduled') {
      if (!formData.scheduledDate) return 'Please choose a date for the scheduled campaign.';
      if (!formData.scheduledTime) return 'Please choose a time for the scheduled campaign.';
      if (!scheduledInstant) return 'The scheduled date/time is invalid.';
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
        title: "Error",
        description: "Organization not found",
        variant: "destructive"
      });
      return;
    }

    // Block submission on validation errors instead of letting a bad scheduled
    // date/time reach `.toISOString()` and throw an Invalid-Date RangeError.
    const error = getValidationError();
    if (error) {
      toast({ title: 'Please fix the form', description: error, variant: 'destructive' });
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
        title: "Campaign created successfully",
        description: `Your ${formData.type} campaign "${formData.name}" has been created.`
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
        title: "Error creating campaign",
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
          <DialogTitle>Create Marketing Campaign</DialogTitle>
          <DialogDescription>
            Choose a template or create a custom campaign to engage with your clients.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Template Selection */}
          {!selectedTemplate && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Choose a Template</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {templates.map((template) => (
                  <Card
                    key={template.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedTemplate(template)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center space-x-2">
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
                          {template.type === 'both' ? 'Email + SMS' : template.type.toUpperCase()}
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
                Start from Scratch
              </Button>
            </div>
          )}

          {/* Campaign Form */}
          {selectedTemplate && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Campaign Details</h3>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setSelectedTemplate(null)}
                >
                  Change Template
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Campaign Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter campaign name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Campaign Type</Label>
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
                          <Mail className="h-4 w-4 mr-2" />
                          Email
                        </div>
                      </SelectItem>
                      <SelectItem value="sms">
                        <div className="flex items-center">
                          <MessageSquare className="h-4 w-4 mr-2" />
                          SMS
                        </div>
                      </SelectItem>
                      <SelectItem value="both">
                        <div className="flex items-center">
                          <Users className="h-4 w-4 mr-2" />
                          Email + SMS
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(formData.type === 'email' || formData.type === 'both') && (
                <div className="space-y-2">
                  <Label htmlFor="subject">Email Subject</Label>
                  <Input
                    id="subject"
                    value={formData.subject}
                    onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="Enter email subject"
                  />
                </div>
              )}

              {(formData.type === 'sms' || formData.type === 'both') && (
                <div className="space-y-2">
                  <Label htmlFor="smsProvider">SMS Provider</Label>
                  <Select
                    value={formData.smsProvider || undefined}
                    onValueChange={(value: SmsProvider) =>
                      setFormData(prev => ({ ...prev, smsProvider: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Auto (use enabled integration)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="infobip" disabled={!providerOptions.infobip}>
                        Infobip {!providerOptions.infobip && '(not configured)'}
                      </SelectItem>
                      <SelectItem value="twilio" disabled={!providerOptions.twilio}>
                        Twilio {!providerOptions.twilio && '(not configured)'}
                      </SelectItem>
                      <SelectItem value="quo" disabled={!providerOptions.quo}>
                        Quo {!providerOptions.quo && '(not configured)'}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {!providerOptions.twilio && !providerOptions.infobip && !providerOptions.quo && (
                    <p className="text-xs text-destructive">
                      No SMS provider is enabled. Configure one in Marketing → Integrations.
                    </p>
                  )}
                  {smsTemplates.length > 0 && (
                    <div className="space-y-1">
                      <Label htmlFor="smsTemplate">Load SMS template</Label>
                      <Select
                        onValueChange={(id) => {
                          const tpl = smsTemplates.find((t) => t.id === id);
                          if (tpl) setFormData((prev) => ({ ...prev, content: tpl.body }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a saved template (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {smsTemplates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name || 'Untitled'}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    A "Reply STOP to unsubscribe" footer is added automatically to comply with carrier rules.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="content">Message Content</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Enter your message"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="audience">Target Audience</Label>
                <Select
                  value={formData.targetAudience}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, targetAudience: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clients</SelectItem>
                    <SelectItem value="active">Active Clients</SelectItem>
                    <SelectItem value="inactive">Inactive Clients (3+ months)</SelectItem>
                    <SelectItem value="birthday">Birthday This Month</SelectItem>
                    <SelectItem value="expiring">Expiring Packages</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <Label>Schedule</Label>
                <div className="flex space-x-4">
                  <Button
                    type="button"
                    variant={formData.scheduleType === 'now' ? 'default' : 'outline'}
                    onClick={() => setFormData(prev => ({ ...prev, scheduleType: 'now' }))}
                  >
                    Send Now
                  </Button>
                  <Button
                    type="button"
                    variant={formData.scheduleType === 'scheduled' ? 'default' : 'outline'}
                    onClick={() => setFormData(prev => ({ ...prev, scheduleType: 'scheduled' }))}
                  >
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    Schedule
                  </Button>
                </div>

                {formData.scheduleType === 'scheduled' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="date">Date</Label>
                        <Input
                          id="date"
                          type="date"
                          value={formData.scheduledDate}
                          onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="time">Time</Label>
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
                        Choose both a date and a time to schedule this campaign.
                      </p>
                    )}
                    {scheduledInstant && (
                      <p className="text-xs text-muted-foreground">
                        Will send{' '}
                        {formatInTimeZone(scheduledInstant, timezone, "EEE, MMM d, yyyy 'at' h:mm a")}{' '}
                        ({timezone}).
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
            Cancel
          </Button>
          {selectedTemplate && (
            <div className="flex flex-col items-end gap-1">
              <Button onClick={handleCreateCampaign} disabled={isLoading || !!validationError}>
                {isLoading ? "Creating..." : "Create Campaign"}
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