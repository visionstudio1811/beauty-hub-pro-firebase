import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from '@/hooks/use-toast';
import { Loader2, HardDrive, TestTube, ExternalLink, Database, Link2, Unlink } from 'lucide-react';

interface GoogleDriveIntegrationProps {
  integration?: any;
  onUpdate: () => void;
}

export const GoogleDriveIntegration: React.FC<GoogleDriveIntegrationProps> = ({ integration, onUpdate }) => {
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<{ waivers: number; invoices: number } | null>(null);
  const { currentOrganization } = useOrganization();

  const isConnected = integration?.is_enabled && integration?.status === 'connected';
  const userEmail = integration?.configuration?.user_email as string | undefined;
  const folderName = integration?.configuration?.folder_name as string | undefined;

  // Handle redirect back from OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('drive_connected');
    if (connected === '1') {
      const email = params.get('email') || '';
      toast({
        title: 'Google Drive connected',
        description: email ? `Connected as ${email}.` : 'Backups will start on the next signed form or invoice.',
      });
      params.delete('drive_connected');
      params.delete('email');
      const next = window.location.pathname + (params.toString() ? `?${params.toString()}` : '') + window.location.hash;
      window.history.replaceState({}, '', next);
      onUpdate();
    } else if (connected === '0') {
      const err = params.get('error') || 'Unknown error';
      toast({ title: 'Connection failed', description: err, variant: 'destructive' });
      params.delete('drive_connected');
      params.delete('error');
      const next = window.location.pathname + (params.toString() ? `?${params.toString()}` : '') + window.location.hash;
      window.history.replaceState({}, '', next);
    }
  }, [onUpdate]);

  const handleConnect = async () => {
    if (!currentOrganization?.id) return;
    setConnecting(true);
    try {
      const fn = httpsCallable(functions, 'getDriveAuthUrl');
      const result = await fn({
        organizationId: currentOrganization.id,
        returnTo: window.location.origin + window.location.pathname + window.location.hash,
      });
      const { authUrl } = result.data as { authUrl: string };
      window.location.href = authUrl;
    } catch (error: any) {
      toast({ title: 'Failed to start connection', description: error.message, variant: 'destructive' });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!currentOrganization?.id) return;
    if (!confirm('Disconnect Google Drive? Future signed forms and invoices will not be backed up until you reconnect.')) return;
    setDisconnecting(true);
    try {
      const fn = httpsCallable(functions, 'disconnectDriveBackup');
      await fn({ organizationId: currentOrganization.id });
      toast({ title: 'Google Drive disconnected' });
      onUpdate();
    } catch (error: any) {
      toast({ title: 'Disconnect failed', description: error.message, variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const fn = httpsCallable(functions, 'testDriveBackup');
      const result = await fn({ organizationId: currentOrganization?.id });
      const data = result.data as { success?: boolean; folderName?: string };
      if (data.success) {
        toast({
          title: 'Drive connection verified',
          description: data.folderName ? `Connected to "${data.folderName}".` : 'Folder access confirmed.',
        });
        onUpdate();
      } else {
        throw new Error('Test returned failure');
      }
    } catch (error: any) {
      toast({ title: 'Test failed', description: error.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const handleBackfill = async () => {
    if (!isConnected) {
      toast({ title: 'Connect Drive first', variant: 'destructive' });
      return;
    }
    setBackfilling(true);
    setBackfillProgress({ waivers: 0, invoices: 0 });
    try {
      const fn = httpsCallable(functions, 'backfillDriveBackups');
      let totalWaivers = 0;
      let totalInvoices = 0;
      let allErrors: string[] = [];

      for (let i = 0; i < 20; i++) {
        const result = await fn({ organizationId: currentOrganization?.id });
        const data = result.data as {
          processed: { waivers: number; invoices: number };
          done: boolean;
          errors: string[];
        };
        totalWaivers += data.processed.waivers;
        totalInvoices += data.processed.invoices;
        if (data.errors?.length) allErrors = allErrors.concat(data.errors);
        setBackfillProgress({ waivers: totalWaivers, invoices: totalInvoices });
        if (data.done) break;
        if (data.processed.waivers === 0 && data.processed.invoices === 0) break;
      }

      const summary = `Backed up ${totalWaivers} form${totalWaivers === 1 ? '' : 's'} and ${totalInvoices} invoice${totalInvoices === 1 ? '' : 's'}`;
      if (allErrors.length > 0) {
        toast({
          title: summary + ` (${allErrors.length} skipped)`,
          description: allErrors.slice(0, 3).join(' · '),
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Backfill complete', description: summary + '.' });
      }
    } catch (error: any) {
      toast({ title: 'Backfill failed', description: error.message, variant: 'destructive' });
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <HardDrive className="h-5 w-5 mr-2" />
            Google Drive Backup
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('https://drive.google.com', '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Drive
            </Button>
            {integration?.status && (
              <Badge variant={integration.status === 'connected' ? 'default' : 'secondary'}>
                {integration.status}
              </Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          Automatically back up signed intake forms, agreements, waivers, and invoices to your own Google Drive.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isConnected && (
          <div className="rounded-md border bg-muted/30 p-4 space-y-3">
            <div>
              <p className="font-medium">Connect your Google Drive</p>
              <p className="text-sm text-muted-foreground mt-1">
                Sign in with the Google account that should own the backup folder. We'll create a
                folder named <strong>"Beauty Hub Pro Backups"</strong> in your My Drive and write
                signed forms and invoices there. We can only see and modify files we create — your
                other Drive content stays private.
              </p>
            </div>
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4 mr-2" />
              )}
              Connect Google Drive
            </Button>
          </div>
        )}

        {isConnected && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Connected account</Label>
                <p className="text-sm break-all mt-1">{userEmail || '—'}</p>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Drive folder</Label>
                <p className="text-sm break-all mt-1">{folderName || 'Beauty Hub Pro Backups'}</p>
              </div>
            </div>
          </div>
        )}

        {integration?.error_message && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{integration.error_message}</p>
          </div>
        )}

        {isConnected && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleTest} disabled={testing}>
              {testing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4 mr-2" />
              )}
              Test Connection
            </Button>
            <Button variant="outline" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Unlink className="h-4 w-4 mr-2" />
              )}
              Disconnect
            </Button>
          </div>
        )}

        {isConnected && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Back up existing records</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Upload signed forms and invoices that pre-date this integration. Re-runnable; already-backed-up records are skipped.
              </p>
            </div>
            {backfillProgress && (
              <p className="text-sm">
                Backed up <strong>{backfillProgress.waivers}</strong> form{backfillProgress.waivers === 1 ? '' : 's'} and{' '}
                <strong>{backfillProgress.invoices}</strong> invoice{backfillProgress.invoices === 1 ? '' : 's'}
                {backfilling ? '…' : '.'}
              </p>
            )}
            <Button variant="outline" onClick={handleBackfill} disabled={backfilling}>
              {backfilling ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Database className="h-4 w-4 mr-2" />
              )}
              {backfilling ? 'Backing up…' : 'Back Up Existing Records'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
