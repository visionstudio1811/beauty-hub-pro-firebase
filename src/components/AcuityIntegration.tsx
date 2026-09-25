import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertCircle, CheckCircle, ChevronDown, Copy, ExternalLink, Loader2, PlugZap } from 'lucide-react';
import { collection, getDocs, getCountFromServer, updateDoc, doc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { acuityApi } from '@/lib/acuityApi';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/i18n/LanguageProvider';
import { AcuityClientsImport } from '@/components/acuity/AcuityClientsImport';
import { AcuityAppointmentsImport } from '@/components/acuity/AcuityAppointmentsImport';
import { errorMessage } from '@/components/acuity/importShared';

type ImportMode = 'off' | 'existing_clients' | 'all';
const IMPORT_MODES: ImportMode[] = ['off', 'existing_clients', 'all'];

// The API key itself never reaches the browser: it lives in a server-only
// secret subdoc and the config doc only carries has_api_key / api_key_last4.
interface AcuityConfigState {
  id?: string;
  acuity_user_id: string;
  has_api_key: boolean;
  api_key_last4: string | null;
  sync_enabled: boolean;
  webhook_import_mode: ImportMode;
  account_name: string | null;
  account_email: string | null;
  last_import_at: string | null;
}

const EMPTY_CONFIG: AcuityConfigState = {
  acuity_user_id: '',
  has_api_key: false,
  api_key_last4: null,
  sync_enabled: false,
  webhook_import_mode: 'existing_clients',
  account_name: null,
  account_email: null,
  last_import_at: null,
};

const DEFAULT_MAPPING_JSON = '{\n  "treatments": {},\n  "staff_calendars": {}\n}';

export const AcuityIntegration: React.FC = () => {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const timeZone = currentOrganization?.timezone || 'America/New_York';
  const { toast } = useToast();
  const { t } = useTranslation('integrations');
  const { locale } = useLanguage();

  const [config, setConfig] = useState<AcuityConfigState>(EMPTY_CONFIG);
  const [userIdInput, setUserIdInput] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [mappingJson, setMappingJson] = useState(DEFAULT_MAPPING_JSON);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [stats, setStats] = useState({ clients: 0, appointments: 0 });
  const [tab, setTab] = useState('clients');
  const [appointmentsOpened, setAppointmentsOpened] = useState(false);
  const legacyKeyMigrated = useRef(false);

  /**
   * `connectionOnly` refreshes just the id + credential/account fields (after
   * a save or test), leaving unsaved edits in the automatic-sync card alone.
   * The id matters: the server creates the config doc on first connect.
   * Resolves to true when a legacy plaintext key is still on the doc.
   */
  const loadConfig = useCallback(
    async (connectionOnly = false): Promise<boolean> => {
      if (!orgId) {
        setLoading(false);
        return false;
      }
      try {
        const snap = await getDocs(
          query(collection(db, 'organizations', orgId, 'acuitySyncConfig'), where('organization_id', '==', orgId)),
        );
        setLoadFailed(false);
        if (snap.empty) return false;
        const d = snap.docs[0];
        const data = d.data();
        const connection = {
          id: d.id,
          acuity_user_id: data.acuity_user_id ?? '',
          // A legacy plaintext key still counts as saved; the server moves it on first use.
          has_api_key: data.has_api_key === true || Boolean(data.api_key_encrypted),
          api_key_last4: data.api_key_last4 ?? null,
          account_name: data.account_name ?? null,
          account_email: data.account_email ?? null,
          last_import_at: data.last_import_at ?? null,
        };
        if (connectionOnly) {
          setConfig((prev) => ({ ...prev, ...connection }));
        } else {
          setConfig({
            ...connection,
            sync_enabled: data.sync_enabled === true,
            webhook_import_mode: IMPORT_MODES.includes(data.webhook_import_mode) ? data.webhook_import_mode : 'existing_clients',
          });
          setUserIdInput(data.acuity_user_id ?? '');
          setMappingJson(JSON.stringify(data.client_portal_acuity_mappings ?? { treatments: {}, staff_calendars: {} }, null, 2));
        }
        return Boolean(data.api_key_encrypted);
      } catch (error) {
        console.error('Error loading Acuity config:', error);
        // Without the doc we can't tell whether one exists, so saving is blocked
        // rather than risking a second config doc.
        if (!connectionOnly) setLoadFailed(true);
        toast({ title: t('common:status.error'), description: t('acuity.loadFailed'), variant: 'destructive' });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [orgId, t, toast],
  );

  const loadStats = useCallback(async () => {
    if (!orgId) return;
    try {
      const [clients, appointments] = await Promise.all([
        getCountFromServer(
          query(collection(db, 'organizations', orgId, 'clients'), where('acuity_sync_enabled', '==', true)),
        ),
        getCountFromServer(
          query(collection(db, 'organizations', orgId, 'appointments'), where('acuity_sync_enabled', '==', true)),
        ),
      ]);
      setStats({ clients: clients.data().count, appointments: appointments.data().count });
    } catch (error) {
      console.error('Error loading sync stats:', error);
    }
  }, [orgId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const hasLegacyKey = await loadConfig();
      loadStats();
      // A key saved by the old settings screen is still readable in the config
      // doc. Any authenticated server call moves it to write-only storage, so
      // test the connection right away instead of waiting for first use.
      if (!active || !hasLegacyKey || !orgId || legacyKeyMigrated.current) return;
      legacyKeyMigrated.current = true;
      try {
        await acuityApi.testConnection(orgId);
        if (active) setConnectionError(null);
      } catch (error) {
        if (active) setConnectionError(errorMessage(error, t('acuity.errors.generic')));
      }
      if (active) loadConfig(true);
    })();
    return () => {
      active = false;
    };
    // Reload only when the org changes: a language switch creates a new `t`
    // and must not wipe unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const refreshAfterImport = useCallback(() => {
    loadStats();
    setConfig((prev) => ({ ...prev, last_import_at: new Date().toISOString() }));
  }, [loadStats]);

  const saveCredentials = async () => {
    if (!orgId) return;
    const userId = userIdInput.trim();
    if (!userId) {
      toast({ title: t('acuity.connection.userIdRequired'), variant: 'destructive' });
      return;
    }
    if (!apiKeyInput.trim() && !config.has_api_key) {
      toast({ title: t('acuity.connection.apiKeyRequired'), variant: 'destructive' });
      return;
    }
    setConnecting(true);
    try {
      const result = await acuityApi.saveCredentials(orgId, userId, apiKeyInput.trim() || undefined);
      setApiKeyInput('');
      setConnectionError(null);
      toast({ title: t('acuity.connection.connectedToast'), description: result.account.name ?? undefined });
    } catch (error) {
      const message = errorMessage(error, t('acuity.errors.generic'));
      setConnectionError(message);
      toast({ title: t('acuity.connection.failed'), description: message, variant: 'destructive' });
    } finally {
      // Re-read either way so the UI always holds the id of the one config doc.
      await loadConfig(true);
      setConnecting(false);
    }
  };

  const testConnection = async () => {
    if (!orgId) return;
    setTesting(true);
    try {
      const result = await acuityApi.testConnection(orgId);
      setConnectionError(null);
      toast({ title: t('acuity.connection.connectedToast'), description: result.account.name ?? undefined });
    } catch (error) {
      const message = errorMessage(error, t('acuity.errors.generic'));
      setConnectionError(message);
      toast({ title: t('acuity.connection.failed'), description: message, variant: 'destructive' });
    } finally {
      await loadConfig(true);
      setTesting(false);
    }
  };

  const saveAutomation = async () => {
    // The config doc is created by the server when the account is connected;
    // this screen only ever updates it, so it can't create a second one.
    if (!orgId || !config.id) return;
    let clientPortalAcuityMappings: Record<string, unknown>;
    try {
      clientPortalAcuityMappings = JSON.parse(mappingJson || '{}') as Record<string, unknown>;
    } catch {
      toast({
        title: t('acuity.invalidMappingJson'),
        description: t('acuity.invalidMappingJsonDescription'),
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'organizations', orgId, 'acuitySyncConfig', config.id), {
        sync_enabled: config.sync_enabled,
        webhook_import_mode: config.webhook_import_mode,
        client_portal_acuity_mappings: clientPortalAcuityMappings,
        updated_at: new Date().toISOString(),
      });
      toast({ title: t('common:status.success'), description: t('acuity.savedDescription') });
    } catch (error) {
      console.error('Error saving Acuity config:', error);
      toast({ title: t('common:status.error'), description: t('acuity.saveFailed'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const region = import.meta.env.VITE_FIREBASE_REGION ?? 'us-central1';
  const webhookUrl = `https://${region}-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net/acuityWebhook?org=${orgId ?? ''}`;

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast({ title: t('acuity.automation.copied') });
    } catch {
      // Clipboard can be blocked (permissions / insecure context); the URL stays selectable.
    }
  };

  const canImport = Boolean(orgId && config.acuity_user_id && config.has_api_key);
  const connectionBusy = connecting || testing;

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
        <h2 className="text-2xl font-bold">{t('acuity.title')}</h2>
        <p className="text-muted-foreground">{t('acuity.subtitle')}</p>
      </div>

      {/* Connection */}
      <Card>
        <CardHeader>
          <CardTitle>{t('acuity.connection.title')}</CardTitle>
          <CardDescription>{t('acuity.connection.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connectionError ? (
            <div className="flex items-start gap-2 text-sm text-destructive" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t('acuity.connection.lastTestFailed', { message: connectionError })}</span>
            </div>
          ) : config.account_name ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-green-700">
              <CheckCircle className="h-4 w-4" />
              <span>{t('acuity.connection.connectedTo', { name: config.account_name })}</span>
              {config.account_email && (
                <span className="ltr-inline text-muted-foreground" dir="ltr">
                  ({config.account_email})
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {canImport ? t('acuity.connection.savedNotTested') : t('acuity.connection.notConnected')}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="acuity_user_id">{t('acuity.connection.userIdLabel')}</Label>
              <Input
                id="acuity_user_id"
                inputMode="numeric"
                dir="ltr"
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                placeholder={t('acuity.connection.userIdPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acuity_api_key">{t('shared.apiKey')}</Label>
              <Input
                id="acuity_api_key"
                type="password"
                autoComplete="off"
                dir="ltr"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={
                  config.has_api_key
                    ? config.api_key_last4
                      ? t('shared.savedKeyPlaceholder', { last4: config.api_key_last4 })
                      : t('shared.savedPlaceholder')
                    : t('acuity.connection.apiKeyPlaceholder')
                }
              />
              {config.has_api_key && <p className="text-xs text-muted-foreground">{t('shared.leaveBlankToKeepKey')}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={saveCredentials} disabled={connectionBusy || loadFailed}>
              {connecting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <PlugZap className="me-2 h-4 w-4" />}
              {t('acuity.connection.saveAndTest')}
            </Button>
            {canImport && (
              <Button variant="outline" onClick={testConnection} disabled={connectionBusy}>
                {testing && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t('acuity.connection.test')}
              </Button>
            )}
            <Button variant="link" asChild>
              <a
                href="https://secure.acuityscheduling.com/app.php?key=api&action=settings"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('acuity.connection.openApiSettings')} <ExternalLink className="ms-1 h-3 w-3" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Selective import */}
      <Card>
        <CardHeader>
          <CardTitle>{t('acuity.import.title')}</CardTitle>
          <CardDescription>{t('acuity.import.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {canImport && orgId ? (
            <Tabs
              // A different Acuity account (or key) must not keep the previous account's rows.
              key={`${config.acuity_user_id}:${config.api_key_last4 ?? ''}`}
              value={tab}
              onValueChange={(value) => {
                setTab(value);
                if (value === 'appointments') setAppointmentsOpened(true);
              }}
            >
              <TabsList>
                <TabsTrigger value="clients">{t('acuity.import.tabs.clients')}</TabsTrigger>
                <TabsTrigger value="appointments">{t('acuity.import.tabs.appointments')}</TabsTrigger>
              </TabsList>
              {/* forceMount keeps each tab's loaded list and selection when switching tabs. */}
              <TabsContent value="clients" forceMount className="data-[state=inactive]:hidden">
                <AcuityClientsImport organizationId={orgId} onImported={refreshAfterImport} />
              </TabsContent>
              <TabsContent value="appointments" forceMount className="data-[state=inactive]:hidden">
                {appointmentsOpened && (
                  <AcuityAppointmentsImport
                    organizationId={orgId}
                    configId={config.id ?? null}
                    timeZone={timeZone}
                    onImported={refreshAfterImport}
                  />
                )}
              </TabsContent>
            </Tabs>
          ) : (
            <Alert>
              <AlertDescription>{t('acuity.import.connectFirst')}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Automatic sync (webhooks) */}
      <Card>
        <CardHeader>
          <CardTitle>{t('acuity.automation.title')}</CardTitle>
          <CardDescription>{t('acuity.automation.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!config.id && (
            <Alert>
              <AlertDescription>{t('acuity.automation.connectFirst')}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Switch
                id="sync_enabled"
                checked={config.sync_enabled}
                onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, sync_enabled: checked }))}
              />
              <Label htmlFor="sync_enabled">{t('acuity.automation.enable')}</Label>
            </div>
            <p className="text-xs text-muted-foreground">{t('acuity.automation.enableHelp')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="acuity_import_mode">{t('acuity.automation.newBookingsLabel')}</Label>
            <Select
              value={config.webhook_import_mode}
              onValueChange={(value) => setConfig((prev) => ({ ...prev, webhook_import_mode: value as ImportMode }))}
            >
              <SelectTrigger id="acuity_import_mode" className="md:max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMPORT_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {t(`acuity.automation.modes.${mode}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('acuity.automation.webhookUrl')}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1 break-all rounded bg-muted p-2 font-mono text-sm" dir="ltr">
                {webhookUrl}
              </div>
              <Button type="button" variant="outline" onClick={copyWebhookUrl}>
                <Copy className="me-2 h-4 w-4" />
                {t('acuity.automation.copy')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('acuity.automation.webhookHelp')}</p>
            <Button variant="outline" size="sm" asChild>
              <a
                href="https://secure.acuityscheduling.com/app.php?key=webhooks&action=settings"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('acuity.automation.openWebhookSettings')} <ExternalLink className="ms-1 h-3 w-3" />
              </a>
            </Button>
          </div>

          <Collapsible className="rounded-md border">
            <CollapsibleTrigger className="group flex w-full items-center justify-between p-3 text-start text-sm font-medium">
              {t('acuity.automation.advanced')}
              <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 border-t p-3">
              <Textarea
                id="client_portal_acuity_mappings"
                aria-label={t('acuity.automation.advanced')}
                value={mappingJson}
                onChange={(e) => setMappingJson(e.target.value)}
                className="min-h-40 font-mono text-xs"
                dir="ltr"
                placeholder={t('acuity.automation.mappingPlaceholder')}
              />
              <p className="text-xs text-muted-foreground">{t('acuity.automation.mappingHelp')}</p>
            </CollapsibleContent>
          </Collapsible>

          <Button onClick={saveAutomation} disabled={saving || connectionBusy || loadFailed || !config.id}>
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t('shared.saveConfiguration')}
          </Button>
        </CardContent>
      </Card>

      {/* Status */}
      <Card>
        <CardHeader>
          <CardTitle>{t('acuity.sync.title')}</CardTitle>
          <CardDescription>{t('acuity.sync.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{stats.clients}</div>
              <div className="text-sm text-muted-foreground">{t('acuity.sync.syncedClients')}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{stats.appointments}</div>
              <div className="text-sm text-muted-foreground">{t('acuity.sync.syncedAppointments')}</div>
            </div>
          </div>
          {config.last_import_at && (
            <div className="text-sm text-muted-foreground">
              {t('acuity.sync.lastImport', { date: new Date(config.last_import_at).toLocaleString(locale) })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
