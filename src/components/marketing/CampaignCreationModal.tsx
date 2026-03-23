import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarIcon, Users, Mail, MessageSquare, Gift, UserCheck, RotateCcw } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from '@/hooks/use-toast';

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
    scheduledTime: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();

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

    setIsLoading(true);
    try {
      const now = new Date().toISOString();
      const campaignData = {
        organization_id: currentOrganization.id,
        name: formData.name,
        type: formData.type,
        subject: formData.subject,
        content: formData.content,
        target_audience: formData.targetAudience,
        status: formData.scheduleType === 'now' ? 'active' : 'scheduled',
        scheduled_at: formData.scheduleType === 'scheduled'
          ? new Date(`${formData.scheduledDate}T${formData.scheduledTime}`).toISOString()
          : null,
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
        scheduledTime: ''
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
            <Button onClick={handleCreateCampaign} disabled={isLoading || !formData.name.trim()}>
              {isLoading ? "Creating..." : "Create Campaign"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};