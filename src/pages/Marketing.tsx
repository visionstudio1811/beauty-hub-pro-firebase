import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MarketingIntegrations } from '@/components/marketing/MarketingIntegrations';
import { CampaignCreationModal } from '@/components/marketing/CampaignCreationModal';
import { AutomationCreationModal } from '@/components/marketing/AutomationCreationModal';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from '@/hooks/use-toast';
import { 
  Calendar, 
  Users, 
  TrendingUp, 
  Mail, 
  MessageSquare, 
  Plus,
  BarChart3,
  Target,
  Send,
  Settings,
  Loader2
} from 'lucide-react';

// Type definitions for marketing data
interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
  sent_count: number;
  opened_count: number;
  clicked_count: number;
  scheduled_at: string | null;
  organization_id: string;
  created_by: string | null;
  subject: string | null;
  total_recipients: number;
  delivered_count: number;
  failed_count: number;
  template_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Automation {
  id: string;
  name: string;
  trigger_type: string;
  trigger_conditions: any;
  action_type: string;
  action_config: any;
  status: 'active' | 'paused';
  last_triggered_at: string | null;
  organization_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface MarketingStats {
  totalSent: number;
  openRate: number;
  clickRate: number;
  totalReviews: number;
}

const Marketing = () => {
  const [searchParams] = useSearchParams();
  const activeSection = searchParams.get('section') || 'overview';

  // State management for marketing data
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [stats, setStats] = useState<MarketingStats>({
    totalSent: 0,
    openRate: 0,
    clickRate: 0,
    totalReviews: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [automationModalOpen, setAutomationModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const { currentOrganization } = useOrganization();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'paused': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Fetch campaigns and automations
  const fetchCampaigns = async () => {
    // Placeholder for now - tables will be available after migration
    setCampaigns([]);
  };

  const fetchAutomations = async () => {
    // Placeholder for now - tables will be available after migration
    setAutomations([]);
  };

  const fetchStats = async () => {
    if (!currentOrganization?.id) return;

    try {
      // Calculate stats from campaigns
      const totalSent = campaigns.reduce((sum, campaign) => sum + (campaign.sent_count || 0), 0);
      const avgOpenRate = campaigns.length > 0 
        ? campaigns.reduce((sum, campaign) => sum + ((campaign.opened_count / Math.max(campaign.sent_count, 1)) * 100 || 0), 0) / campaigns.length 
        : 0;
      const avgClickRate = campaigns.length > 0 
        ? campaigns.reduce((sum, campaign) => sum + ((campaign.clicked_count / Math.max(campaign.sent_count, 1)) * 100 || 0), 0) / campaigns.length 
        : 0;

      setStats({
        totalSent,
        openRate: Math.round(avgOpenRate * 100) / 100,
        clickRate: Math.round(avgClickRate * 100) / 100,
        totalReviews: 0 // This would need a separate query
      });
    } catch (error: any) {
      console.error('Error calculating stats:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchCampaigns(), fetchAutomations()]);
      setIsLoading(false);
    };

    if (currentOrganization?.id) {
      loadData();
    }
  }, [currentOrganization?.id]);

  useEffect(() => {
    fetchStats();
  }, [campaigns]);

  const handleCreateCampaign = (template?: string) => {
    setSelectedTemplate(template || '');
    setCampaignModalOpen(true);
  };

  const handleCreateAutomation = () => {
    setAutomationModalOpen(true);
  };

  const onCampaignCreated = () => {
    fetchCampaigns();
  };

  const onAutomationCreated = () => {
    fetchAutomations();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Marketing</h1>
        <Button onClick={() => handleCreateCampaign()}>
          <Plus className="h-4 w-4 mr-2" />
          New Campaign
        </Button>
      </div>

      <div className="w-full">
        {activeSection === 'overview' && <div className="space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading marketing data...</span>
            </div>
          ) : (
            <>
              {/* Marketing Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Sent</CardTitle>
                <Send className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalSent}</div>
                <p className="text-xs text-muted-foreground">
                  Campaigns delivered
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open Rate</CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.openRate}%</div>
                <p className="text-xs text-muted-foreground">
                  Average open rate
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Click Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.clickRate}%</div>
                <p className="text-xs text-muted-foreground">
                  Average click rate
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Reviews</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalReviews}</div>
                <p className="text-xs text-muted-foreground">
                  Reviews collected
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Campaign Templates */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Campaign Templates</CardTitle>
              <CardDescription>Get started with pre-built campaign templates</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button 
                  variant="outline" 
                  className="h-auto p-4 text-left justify-start"
                  onClick={() => handleCreateCampaign('birthday')}
                >
                  <div>
                    <p className="font-medium">Birthday Special</p>
                    <p className="text-sm text-muted-foreground">Send personalized birthday offers</p>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  className="h-auto p-4 text-left justify-start"
                  onClick={() => handleCreateCampaign('reactivation')}
                >
                  <div>
                    <p className="font-medium">Inactive Clients</p>
                    <p className="text-sm text-muted-foreground">Re-engage clients who haven't visited</p>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  className="h-auto p-4 text-left justify-start"
                  onClick={() => handleCreateCampaign('renewal')}
                >
                  <div>
                    <p className="font-medium">Package Renewal</p>
                    <p className="text-sm text-muted-foreground">Remind clients to renew packages</p>
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>
            </>
          )}
        </div>}

        {activeSection === 'campaigns' && <div className="space-y-6">
          {/* Recent Campaigns */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Campaigns</CardTitle>
              <CardDescription>Your latest marketing campaigns and their performance</CardDescription>
            </CardHeader>
            <CardContent>
              {campaigns.length === 0 ? (
                <div className="text-center py-8">
                  <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No campaigns yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Create your first marketing campaign to engage with your clients.
                  </p>
                  <Button onClick={() => handleCreateCampaign()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Campaign
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {campaigns.map((campaign) => (
                    <div key={campaign.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h4 className="font-medium">{campaign.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {campaign.type} • {campaign.sent_count} sent • {Math.round((campaign.opened_count / Math.max(campaign.sent_count, 1)) * 100)}% open rate
                        </p>
                      </div>
                      <Badge className={getStatusColor(campaign.status)}>
                        {campaign.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Automations */}
          <Card>
            <CardHeader>
              <CardTitle>Active Automations</CardTitle>
              <CardDescription>Automated marketing workflows currently running</CardDescription>
            </CardHeader>
            <CardContent>
              {automations.length === 0 ? (
                <div className="text-center py-8">
                  <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No automations set up</h3>
                  <p className="text-muted-foreground mb-4">
                    Set up automated workflows to nurture your client relationships.
                  </p>
                  <Button variant="outline" onClick={handleCreateAutomation}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Automation
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {automations.map((automation) => (
                    <div key={automation.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h4 className="font-medium">{automation.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          Trigger: {automation.trigger_type} • Last triggered: {automation.last_triggered_at || 'Never'}
                        </p>
                      </div>
                      <Badge variant="secondary">Active</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>}

        {activeSection === 'integrations' && <MarketingIntegrations />}
      </div>

      {/* Modals */}
      <CampaignCreationModal
        open={campaignModalOpen}
        onOpenChange={setCampaignModalOpen}
        template={selectedTemplate}
        onCampaignCreated={onCampaignCreated}
      />

      <AutomationCreationModal
        open={automationModalOpen}
        onOpenChange={setAutomationModalOpen}
        onAutomationCreated={onAutomationCreated}
      />
    </div>
  );
};

export default Marketing;