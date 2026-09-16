import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from '@/hooks/use-toast';
import { Trans, useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('integrations');

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
        title: t('googleDrive.connectedToast'),
        description: email ? t('googleDrive.connectedAs', { email }) : t('googleDrive.backupsWillStart'),
      });
      params.delete('drive_connected');
      params.delete('email');
      const next = window.location.pathname + (params.toString() ? `?${params.toString()}` : '') + window.location.hash;
      window.history.replaceState({}, '', next);
      onUpdate();
    } else if (connected === '0') {
      const err = params.get('error') || t('googleDrive.unknownError');
      toast({ title: t('googleDrive.connectionFailed'), description: err, variant: 'destructive' });
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
      toast({ title: t('googleDrive.failedToStartConnection'), description: error.message, variant: 'destructive' });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!currentOrganization?.id) return;
    if (!confirm(t('googleDrive.confirmDisconnect'))) return;
    setDisconnecting(true);
    try {
      const fn = httpsCallable(functions, 'disconnectDriveBackup');
      await fn({ organizationId: currentOrganization.id });
      toast({ title: t('googleDrive.disconnectedToast') });
      onUpdate();
    } catch (error: any) {
      toast({ title: t('googleDrive.disconnectFailed'), description: error.message, variant: 'destructive' });
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
          title: t('googleDrive.connectionVerified'),
          description: data.folderName ? t('googleDrive.connectedToFolder', { folder: data.folderName }) : t('googleDrive.folderAccessConfirmed'),
        });
        onUpdate();
      } else {
        throw new Error(t('googleDrive.testReturnedFailure'));
      }
    } catch (error: any) {
      toast({ title: t('shared.testFailed'), description: error.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const handleBackfill = async () => {
    if (!isConnected) {
      toast({ title: t('googleDrive.connectDriveFirst'), variant: 'destructive' });
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

      const summary = t('googleDrive.backedUpSummary', {
        forms: t('googleDrive.forms', { count: totalWaivers }),
        invoices: t('googleDrive.invoices', { count: totalInvoices }),
      });
      if (allErrors.length > 0) {
        toast({
          title: summary + t('googleDrive.skippedSuffix', { count: allErrors.length }),
          description: allErrors.slice(0, 3).join(' · '),
          variant: 'destructive',
        });
      } else {
        toast({ title: t('googleDrive.backfillComplete'), description: summary + '.' });
      }
    } catch (error: any) {
      toast({ title: t('googleDrive.backfillFailed'), description: error.message, variant: 'destructive' });
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <HardDrive className="h-5 w-5 me-2" />
            {t('googleDrive.title')}
          </div>
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('https://drive.google.com', '_blank')}
            >
              <ExternalLink className="h-4 w-4 me-2" />
              {t('googleDrive.openDrive')}
            </Button>
            {integration?.status && (
              <Badge variant={integration.status === 'connected' ? 'default' : 'secondary'}>
                {t(`shared.status.${integration.status}`, { defaultValue: integration.status })}
              </Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          {t('googleDrive.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isConnected && (
          <div className="rounded-md border bg-muted/30 p-4 space-y-3">
            <div>
              <p className="font-medium">{t('googleDrive.connectHeading')}</p>
              <p className="text-sm text-muted-foreground mt-1">
                <Trans
                  t={t}
                  i18nKey="googleDrive.connectExplanation"
                  values={{ folder: t('googleDrive.defaultFolderName') }}
                  components={{ b: <strong /> }}
                />
              </p>
            </div>
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4 me-2" />
              )}
              {t('googleDrive.connectButton')}
            </Button>
          </div>
        )}

        {isConnected && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t('googleDrive.connectedAccount')}</Label>
                <p className="text-sm break-all mt-1">{userEmail ? <span className="ltr-inline" dir="ltr">{userEmail}</span> : '—'}</p>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t('googleDrive.driveFolder')}</Label>
                <p className="text-sm break-all mt-1">{folderName || t('googleDrive.defaultFolderName')}</p>
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
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4 me-2" />
              )}
              {t('shared.testConnection')}
            </Button>
            <Button variant="outline" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              ) : (
                <Unlink className="h-4 w-4 me-2" />
              )}
              {t('googleDrive.disconnect')}
            </Button>
          </div>
        )}

        {isConnected && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t('googleDrive.backfillHeading')}</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {t('googleDrive.backfillExplanation')}
              </p>
            </div>
            {backfillProgress && (
              <p className="text-sm">
                <Trans
                  t={t}
                  i18nKey="googleDrive.backfillProgress"
                  values={{
                    forms: t('googleDrive.forms', { count: backfillProgress.waivers }),
                    invoices: t('googleDrive.invoices', { count: backfillProgress.invoices }),
                    suffix: backfilling ? '…' : '.',
                  }}
                  components={{ b: <strong /> }}
                />
              </p>
            )}
            <Button variant="outline" onClick={handleBackfill} disabled={backfilling}>
              {backfilling ? (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              ) : (
                <Database className="h-4 w-4 me-2" />
              )}
              {backfilling ? t('googleDrive.backingUp') : t('googleDrive.backfillButton')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
