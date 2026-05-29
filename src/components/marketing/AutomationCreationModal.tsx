import React, { useState } from 'react';
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

const automationTemplates: AutomationTemplate[] = [
  {
    id: 'appointment_confirmation',
    name: 'Appointment Confirmation',
    description: 'Email the client the moment a new appointment is booked',
    trigger: 'appointment_scheduled',
    icon: <Calendar className="h-5 w-5" />,
    delay: 'Immediate',
    messageType: 'email',
    subject: 'Your appointment is confirmed — [DATE] at [TIME]',
    content: 'Hi [NAME],\n\nYour [TREATMENT] appointment is confirmed for [DATE] at [TIME] with [STAFF].\n\nWe look forward to seeing you!\n\n— [ORG]'
  },
  {
    id: 'welcome',
    name: 'Welcome Series',
    description: 'Welcome new clients with a series of messages',
    trigger: 'client_created',
    icon: <UserPlus className="h-5 w-5" />,
    delay: '1 hour',
    messageType: 'email',
    subject: 'Welcome to Our Spa! Here\'s What to Expect',
    content: 'Welcome! We\'re excited to have you as a client. Here\'s everything you need to know about our services...'
  },
  {
    id: 'birthday',
    name: 'Birthday Automation',
    description: 'Automatically send birthday wishes and offers',
    trigger: 'client_birthday',
    icon: <Gift className="h-5 w-5" />,
    delay: '0 days',
    messageType: 'both',
    subject: '🎉 Happy Birthday! Special Gift Inside',
    content: 'Happy Birthday! Enjoy 20% off your next appointment as our birthday gift to you!'
  },
  {
    id: 'followup',
    name: 'Post-Appointment Follow-up',
    description: 'Follow up after appointments for feedback',
    trigger: 'appointment_completed',
    icon: <RefreshCw className="h-5 w-5" />,
    delay: '1 day',
    messageType: 'email',
    subject: 'How was your recent appointment?',
    content: 'We hope you enjoyed your recent visit! Please let us know how we did and book your next appointment.'
  },
  {
    id: 'reminder',
    name: 'Appointment Reminders',
    description: 'Remind clients about upcoming appointments',
    trigger: 'appointment_scheduled',
    icon: <Clock className="h-5 w-5" />,
    delay: '24 hours before',
    messageType: 'sms',
    subject: 'Appointment Reminder',
    content: 'Reminder: You have an appointment tomorrow at [TIME]. Reply CONFIRM to confirm or RESCHEDULE to change.'
  },
  {
    id: 'reactivation',
    name: 'Win-Back Campaign',
    description: 'Re-engage inactive clients automatically',
    trigger: 'client_inactive',
    icon: <Zap className="h-5 w-5" />,
    delay: '90 days',
    messageType: 'email',
    subject: 'We Miss You! Come Back for 15% Off',
    content: 'It\'s been a while since your last visit. We miss you! Come back and enjoy 15% off your next service.'
  },
  // ----- Public scheduler-link bookings ----------------------------------------
  // These three fire on bookings coming through shared /book/:token URLs and
  // embedded iframes. They reuse the same Resend integration + branded HTML
  // template wrapper as Appointment Confirmation, so the visitor experience
  // matches the rest of your email design.
  {
    id: 'booking_request_received',
    name: 'Booking Request Received (to visitor)',
    description: 'Acknowledge a public booking request the moment it\'s submitted',
    trigger: 'public_booking_request',
    icon: <LinkIcon className="h-5 w-5" />,
    delay: 'Immediate',
    messageType: 'email',
    subject: 'We got your booking request — [DATE] at [TIME]',
    content: 'Hi [NAME],\n\nThanks for booking with [ORG]. We\'ve received your request for [TREATMENT] on [DATE] at [TIME] and will confirm by email shortly.\n\nIf anything\'s wrong, just reply to this email.\n\n— [ORG]'
  },
  {
    id: 'booking_request_admin_alert',
    name: 'New Booking Request (to staff)',
    description: 'Notify your admins the moment a public booking request comes in',
    trigger: 'public_booking_request_admin',
    icon: <Bell className="h-5 w-5" />,
    delay: 'Immediate',
    messageType: 'email',
    subject: 'New booking request — [VISITOR_NAME] · [TREATMENT] · [DATE] [TIME]',
    content: 'A new public booking request just arrived.\n\nVisitor: [VISITOR_NAME]\nEmail: [VISITOR_EMAIL]\nPhone: [VISITOR_PHONE]\nTreatment: [TREATMENT]\nRequested: [DATE] at [TIME]\nNotes: [VISITOR_NOTES]\n\nApprove or decline in the Booking Requests panel.'
  },
  {
    id: 'booking_request_declined',
    name: 'Booking Declined (to visitor)',
    description: 'Send a polite decline message when staff rejects a public booking',
    trigger: 'booking_request_rejected',
    icon: <XCircle className="h-5 w-5" />,
    delay: 'Immediate',
    messageType: 'email',
    subject: 'About your booking request for [DATE] at [TIME]',
    content: 'Hi [NAME],\n\nUnfortunately we\'re unable to confirm your [TREATMENT] booking on [DATE] at [TIME].\n\n[REASON]\n\nPlease pick another time on our booking page — we\'d love to see you.\n\n— [ORG]'
  }
];

export const AutomationCreationModal: React.FC<AutomationCreationModalProps> = ({
  open,
  onOpenChange,
  onAutomationCreated,
  editAutomation = null,
}) => {
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
        title: 'Missing required fields',
        description: 'Name and Trigger Event are required.',
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
      title: editAutomation ? 'Automation updated' : 'Automation saved',
      description: `"${draft.name}" is now ${draft.is_active ? 'active' : 'paused'}.`,
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
    { value: 'client_created', label: 'New Client Registration' },
    { value: 'appointment_scheduled', label: 'Appointment Scheduled' },
    { value: 'appointment_completed', label: 'Appointment Completed' },
    { value: 'client_birthday', label: 'Client Birthday' },
    { value: 'client_inactive', label: 'Client Inactive (90+ days)' },
    { value: 'package_expiring', label: 'Package Expiring Soon' },
    { value: 'package_expired', label: 'Package Expired' },
    { value: 'public_booking_request', label: 'Public Booking Request (to visitor)' },
    { value: 'public_booking_request_admin', label: 'Public Booking Request (to staff)' },
    { value: 'booking_request_rejected', label: 'Booking Request Rejected' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Marketing Automation' : 'Create Marketing Automation'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the subject, content, or trigger for this automation. Toggle the Active switch on the list to pause without deleting.'
              : 'Set up automated workflows to engage with your clients at the right moments.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Template Selection — only shown when creating, not editing */}
          {!selectedTemplate && !isEditing && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Choose an Automation Template</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {automationTemplates.map((template) => (
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
                          {template.messageType === 'both' ? 'Email + SMS' : template.messageType.toUpperCase()}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          Delay: {template.delay}
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
                    description: 'Custom automation',
                    trigger: '',
                    icon: <Zap className="h-5 w-5" />,
                    delay: '',
                    messageType: 'email',
                    subject: '',
                    content: '',
                  })
                }
              >
                Create Custom Automation
              </Button>
            </div>
          )}

          {/* Automation Form */}
          {selectedTemplate && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Automation Details</h3>
                {!isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTemplate(null)}
                  >
                    Change Template
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Automation Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter automation name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="trigger">Trigger Event</Label>
                  <Select
                    value={formData.trigger}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, trigger: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select trigger" />
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
                  <Label htmlFor="delay">Delay</Label>
                  <Input
                    id="delay"
                    value={formData.delay}
                    onChange={(e) => setFormData(prev => ({ ...prev, delay: e.target.value }))}
                    placeholder="e.g., 1 hour, 1 day, 24 hours before"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messageType">Message Type</Label>
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
                          <Mail className="h-4 w-4 mr-1" />
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Both
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(formData.messageType === 'email' || formData.messageType === 'both') && (
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

              <div className="space-y-2">
                <Label htmlFor="content">Message Content</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Enter your message content"
                  rows={4}
                />
                <p className="text-sm text-muted-foreground">
                  You can use variables like [NAME], [DATE], [TIME] in your content.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {selectedTemplate && (
            <Button onClick={handleCreateAutomation} disabled={isLoading || !formData.name.trim()}>
              {isLoading
                ? (isEditing ? 'Saving...' : 'Creating...')
                : (isEditing ? 'Save Changes' : 'Create Automation')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};