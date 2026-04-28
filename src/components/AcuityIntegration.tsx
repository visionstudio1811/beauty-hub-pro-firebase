import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, RefreshCw, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/contexts/OrganizationContext';

interface AcuityConfig {
  id?: string;
  acuity_user_id: string;
  api_key_encrypted: string;
  webhook_secret: string;
  sync_enabled: boolean;
  sync_direction: string;
  sync_frequency_minutes: number;
  conflict_resolution: string;
  last_full_sync?: string;
  organization_id?: string;
  created_at?: string;
  updated_at?: string;
}

interface SyncStats {
  clients: number;
  appointments: number;
  last_sync?: string;
}

export const AcuityIntegration: React.FC = () => {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const [config, setConfig] = useState<AcuityConfig>({
    acuity_user_id: '',
    api_key_encrypted: '',
    webhook_secret: '',
    sync_enabled: false,
    sync_direction: 'bidirectional',
    sync_frequency_minutes: 60,
    conflict_resolution: 'acuity_wins'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [mappingJson, setMappingJson] = useState('{\n  "treatments": {},\n  "staff_calendars": {}\n}');
  const [syncStats, setSyncStats] = useState<SyncStats>({ clients: 0, appointments: 0 });

  useEffect(() => {
    loadConfig();
    loadSyncStats();
  }, [currentOrganization]);

  const loadConfig = async () => {
    if (!currentOrganization?.id) return;

    try {
      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'acuitySyncConfig'),
          where('organization_id', '==', currentOrganization.id)
        )
      );

      if (!snap.empty) {
        const d = snap.docs[0];
        const data = d.data();
        setConfig({
          id: d.id,
          acuity_user_id: data.acuity_user_id ?? '',
          api_key_encrypted: data.api_key_encrypted ?? '',
          webhook_secret: data.webhook_secret ?? '',
          sync_enabled: data.sync_enabled ?? false,
          sync_direction: data.sync_direction ?? 'bidirectional',
          sync_frequency_minutes: data.sync_frequency_minutes ?? 60,
          conflict_resolution: data.conflict_resolution ?? 'acuity_wins',
          last_full_sync: data.last_full_sync ?? undefined,
          organization_id: data.organization_id,
          created_at: data.created_at ?? undefined,
          updated_at: data.updated_at ?? undefined,
        });
        setMappingJson(JSON.stringify(data.client_portal_acuity_mappings ?? { treatments: {}, staff_calendars: {} }, null, 2));
      }
    } catch (error) {
      console.error('Error loading Acuity config:', error);
      toast({
        title: 'Error',
        description: 'Failed to load Acuity configuration',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSyncStats = async () => {
    if (!currentOrganization?.id) return;

    try {
      const orgId = currentOrganization.id;

      const clientsSnap = await getDocs(
        query(
          collection(db, 'organizations', orgId, 'clients'),
          where('acuity_sync_enabled', '==', true)
        )
      );

      const appointmentsSnap = await getDocs(
        query(
          collection(db, 'organizations', orgId, 'appointments'),
          where('acuity_sync_enabled', '==', true)
        )
      );

      const configSnap = await getDocs(
        query(
          collection(db, 'organizations', orgId, 'acuitySyncConfig'),
          where('organization_id', '==', orgId)
        )
      );
      const lastSync = configSnap.empty ? undefined : configSnap.docs[0].data().last_full_sync;

      setSyncStats({
        clients: clientsSnap.size,
        appointments: appointmentsSnap.size,
        last_sync: lastSync,
      });
    } catch (error) {
      console.error('Error loading sync stats:', error);
    }
  };

  const saveConfig = async () => {
    if (!currentOrganization?.id) return;

    setSaving(true);
    try {
      const orgId = currentOrganization.id;
      const now = new Date().toISOString();
      let clientPortalAcuityMappings: Record<string, unknown>;
      try {
        clientPortalAcuityMappings = JSON.parse(mappingJson || '{}') as Record<string, unknown>;
      } catch {
        toast({
          title: 'Invalid mapping JSON',
          description: 'Check the client portal Acuity mapping before saving.',
          variant: 'destructive',
        });
        return;
      }
      const configData = {
        acuity_user_id: config.acuity_user_id,
        api_key_encrypted: config.api_key_encrypted,
        webhook_secret: config.webhook_secret,
        sync_enabled: config.sync_enabled,
        sync_direction: config.sync_direction,
        sync_frequency_minutes: config.sync_frequency_minutes,
        conflict_resolution: config.conflict_resolution,
        client_portal_acuity_mappings: clientPortalAcuityMappings,
        organization_id: orgId,
        updated_at: now,
      };

      if (config.id) {
        // Update existing config
        await updateDoc(doc(db, 'organizations', orgId, 'acuitySyncConfig', config.id), configData);
      } else {
        // Create new config
        const newDoc = await addDoc(collection(db, 'organizations', orgId, 'acuitySyncConfig'), {
          ...configData,
          created_at: now,
          created_at_ts: serverTimestamp(),
        });
        setConfig(prev => ({ ...prev, id: newDoc.id }));
      }

      toast({
        title: 'Success',
        description: 'Acuity configuration saved successfully'
      });

      loadSyncStats();
    } catch (error) {
      console.error('Error saving Acuity config:', error);
      toast({
        title: 'Error',
        description: 'Failed to save Acuity configuration',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const performSync = async (syncType: 'full_sync' | 'sync_clients' | 'sync_appointments') => {
    if (!currentOrganization?.id) return;

    setSyncing(true);
    try {
      const orgId = currentOrganization.id;
      const acuitySync = httpsCallable(functions, 'acuitySync');

      // Paged client sync to avoid function timeouts
      const runClientSyncPaged = async () => {
        let cursor = 0;
        const batchSize = 100;
        let total = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const result = await acuitySync({ action: 'sync_clients', organization_id: orgId, cursor, batch_size: batchSize });
          const data = result.data as any;
          if (!data?.success) throw new Error(data?.error || 'Client sync failed');

          total += data.data?.count || 0;
          const next = data.data?.next_cursor;
          if (next == null) break;
          cursor = next;
        }
        return total;
      };

      let message = '';
      if (syncType === 'sync_clients') {
        const total = await runClientSyncPaged();
        message = `Synced ${total} clients`;
      } else if (syncType === 'full_sync') {
        let cursor = 0;
        const batchSize = 100;
        let totalClients = 0;
        let totalAppointments = 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const result = await acuitySync({ action: 'full_sync', organization_id: orgId, cursor, batch_size: batchSize });
          const data = result.data as any;
          if (!data?.success) throw new Error(data?.error || 'Full sync failed');

          totalClients += data.data?.clients || 0;
          totalAppointments += data.data?.appointments || 0;

          if (!data.data?.has_more) break;
          cursor = data.data.next_cursor;
        }

        message = `Full sync completed: ${totalClients} clients, ${totalAppointments} appointments`;
      } else {
        const result = await acuitySync({ action: 'sync_appointments', organization_id: orgId });
        const data = result.data as any;
        if (!data?.success) throw new Error(data?.error || 'Appointments sync failed');
        message = data.message;
      }

      toast({ title: 'Sync Complete', description: message });
      loadSyncStats();
    } catch (error: any) {
      console.error('Error performing sync:', error);
      toast({
        title: 'Sync Failed',
        description: error.message || 'Failed to sync with Acuity',
        variant: 'destructive'
      });
    } finally {
      setSyncing(false);
    }
  };

  const webhookUrl = `https://${import.meta.env.VITE_FIREBASE_REGION ?? 'us-central1'}-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net/acuityWebhook`;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Acuity Scheduling Integration</h2>
        <p className="text-muted-foreground">
          Connect your Beauty Hub Pro system with Acuity Scheduling for seamless appointment and client management.
        </p>
      </div>

      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>
            Set up your Acuity Scheduling API credentials and sync preferences.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="acuity_user_id">Acuity User ID</Label>
              <Input
                id="acuity_user_id"
                value={config.acuity_user_id}
                onChange={(e) => setConfig(prev => ({ ...prev, acuity_user_id: e.target.value }))}
                placeholder="Enter your Acuity User ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api_key">API Key</Label>
              <Input
                id="api_key"
                type="password"
                value={config.api_key_encrypted}
                onChange={(e) => setConfig(prev => ({ ...prev, api_key_encrypted: e.target.value }))}
                placeholder="Enter your Acuity API Key"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook_secret">Webhook Secret (Optional)</Label>
            <Input
              id="webhook_secret"
              value={config.webhook_secret}
              onChange={(e) => setConfig(prev => ({ ...prev, webhook_secret: e.target.value }))}
              placeholder="Enter webhook secret for security"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="sync_enabled"
              checked={config.sync_enabled}
              onCheckedChange={(checked) => setConfig(prev => ({ ...prev, sync_enabled: checked }))}
            />
            <Label htmlFor="sync_enabled">Enable Acuity Sync</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client_portal_acuity_mappings">Client Portal Booking Mapping</Label>
            <Textarea
              id="client_portal_acuity_mappings"
              value={mappingJson}
              onChange={(e) => setMappingJson(e.target.value)}
              className="min-h-40 font-mono text-xs"
              placeholder='{"treatments":{"crmTreatmentId":{"appointmentTypeID":123}},"staff_calendars":{"crmStaffId":456}}'
            />
            <p className="text-xs text-muted-foreground">
              Map CRM treatment IDs to Acuity appointment type IDs and CRM staff IDs to Acuity calendar IDs for approved client requests.
            </p>
          </div>

          <Button onClick={saveConfig} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Configuration
          </Button>
        </CardContent>
      </Card>

      {/* Webhook Setup Card */}
      <Card>
        <CardHeader>
          <CardTitle>Webhook Configuration</CardTitle>
          <CardDescription>
            Set up webhooks in your Acuity account to receive real-time updates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Add this webhook URL to your Acuity Scheduling account:
              <div className="mt-2 p-2 bg-muted rounded font-mono text-sm">
                {webhookUrl}
              </div>
              <div className="mt-2">
                <Button variant="outline" size="sm" asChild>
                  <a
                    href="https://secure.acuityscheduling.com/app.php?key=webhooks&action=settings"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Acuity Webhooks Settings <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Sync Status and Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Sync Status</CardTitle>
          <CardDescription>
            Monitor and control your Acuity synchronization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{syncStats.clients}</div>
              <div className="text-sm text-muted-foreground">Synced Clients</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{syncStats.appointments}</div>
              <div className="text-sm text-muted-foreground">Synced Appointments</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-medium">
                {config.sync_enabled ? (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="secondary">Disabled</Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground">Status</div>
            </div>
          </div>

          {syncStats.last_sync && (
            <div className="text-sm text-muted-foreground">
              Last sync: {new Date(syncStats.last_sync).toLocaleString()}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => performSync('full_sync')}
              disabled={!config.sync_enabled || syncing}
              variant="default"
            >
              {syncing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <RefreshCw className="mr-2 h-4 w-4" />
              Full Sync
            </Button>
            <Button
              onClick={() => performSync('sync_clients')}
              disabled={!config.sync_enabled || syncing}
              variant="outline"
            >
              Sync Clients
            </Button>
            <Button
              onClick={() => performSync('sync_appointments')}
              disabled={!config.sync_enabled || syncing}
              variant="outline"
            >
              Sync Appointments
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
