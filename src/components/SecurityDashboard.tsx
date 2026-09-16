
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, AlertTriangle, Users, Activity, Eye, RefreshCw } from 'lucide-react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useToast } from '@/hooks/use-toast';
import { useSecurityValidation } from '@/hooks/useSecurityValidation';
import { useLanguage } from '@/i18n/LanguageProvider';

interface SecurityEvent {
  id: string;
  action: string;
  created_at: string;
  new_values?: any;
  user_id?: string;
}

interface SessionData {
  id: string;
  user_id: string;
  is_active: boolean;
  created_at: string;
  last_activity: string;
  expires_at: string;
  ip_address: string;
  user_agent: string;
}

export const SecurityDashboard: React.FC = () => {
  const { t } = useTranslation('security');
  const { locale } = useLanguage();
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [activeSessions, setActiveSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('events');
  const { toast } = useToast();
  const { hasPermission, logSecurityEvent } = useSecurityValidation();
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();

  useEffect(() => {
    checkPermissionAndLoad();
  }, []);

  const checkPermissionAndLoad = async () => {
    const canView = await hasPermission('view', 'security');
    if (canView) {
      await Promise.all([
        fetchSecurityEvents(),
        fetchActiveSessions()
      ]);
    } else {
      toast({
        title: t('dashboard.toasts.accessDenied.title'),
        description: t('dashboard.toasts.accessDenied.description'),
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const fetchSecurityEvents = async () => {
    if (!currentOrganization?.id) return;
    try {
      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'auditLogs'),
          where('action', '>=', 'SECURITY_'),
          where('action', '<=', 'SECURITY_\uf8ff'),
          orderBy('action'),
          orderBy('created_at', 'desc'),
          limit(100)
        )
      );
      setSecurityEvents(snap.docs.map(d => ({
        id: d.id,
        action: d.data().action ?? '',
        created_at: d.data().created_at ?? new Date().toISOString(),
        new_values: d.data().details ?? undefined,
        user_id: d.data().user_id ?? undefined,
      })));

      await logSecurityEvent('SECURITY_DASHBOARD_VIEWED', { eventsCount: snap.size });
    } catch (error) {
      console.error('Error fetching security events:', error);
      toast({
        title: t('common:status.error'),
        description: t('dashboard.toasts.loadEventsFailed'),
        variant: "destructive"
      });
    }
  };

  const fetchActiveSessions = async () => {
    if (!user) return;
    try {
      const snap = await getDocs(
        query(
          collection(db, 'users', user.uid, 'sessions'),
          where('is_active', '==', true),
          orderBy('created_at', 'desc')
        )
      );

      setActiveSessions(
        snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            user_id: data.user_id ?? user.uid,
            is_active: true,
            created_at: data.created_at ?? '',
            last_activity: data.last_activity ?? '',
            expires_at: data.expires_at ?? '',
            ip_address: String(data.ip_address ?? 'unknown'),
            user_agent: data.user_agent ?? '',
          };
        })
      );
    } catch (error) {
      console.error('Error fetching active sessions:', error);
      toast({
        title: t('common:status.error'),
        description: t('dashboard.toasts.loadSessionsFailed'),
        variant: "destructive"
      });
    }
  };

  const cleanupExpiredSessions = async () => {
    // Session cleanup is handled server-side; just refresh the list
    toast({ title: t('dashboard.toasts.refreshed.title'), description: t('dashboard.toasts.refreshed.description') });
    await fetchActiveSessions();
  };

  const getEventSeverity = (action: string) => {
    if (action.includes('SUSPICIOUS') || action.includes('FAILED') || action.includes('DENIED')) {
      return 'high';
    }
    if (action.includes('ATTEMPT') || action.includes('MULTIPLE') || action.includes('ROLE_CHANGE')) {
      return 'medium';
    }
    return 'low';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    }
  };

  const formatEventDetails = (event: SecurityEvent) => {
    if (!event.new_values) return '';

    const details = [];
    if (event.new_values.attempts) details.push(t('dashboard.details.attempts', { n: event.new_values.attempts }));
    if (event.new_values.ip_hash) details.push(t('dashboard.details.ipHash', { hash: event.new_values.ip_hash.substring(0, 8) }));
    if (event.new_values.old_role && event.new_values.new_role) {
      details.push(t('dashboard.details.roleChange', { from: event.new_values.old_role, to: event.new_values.new_role }));
    }
    if (event.new_values.distinct_ips) details.push(t('dashboard.details.ips', { n: event.new_values.distinct_ips }));

    return details.join(', ');
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-sm text-gray-500">{t('dashboard.loading')}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                {t('dashboard.title')}
              </CardTitle>
              <CardDescription>
                {t('dashboard.description')}
              </CardDescription>
            </div>
            <Button onClick={checkPermissionAndLoad} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 me-2" />
              {t('common:actions.refresh')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="events">{t('dashboard.tabs.events')}</TabsTrigger>
              <TabsTrigger value="sessions">{t('dashboard.tabs.sessions')}</TabsTrigger>
            </TabsList>

            <TabsContent value="events" className="space-y-4">
              {securityEvents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('dashboard.noEvents')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {securityEvents.map((event) => {
                    const severity = getEventSeverity(event.action);
                    return (
                      <div
                        key={event.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                      >
                        <div className="flex items-center space-x-3 rtl:space-x-reverse">
                          {severity === 'high' && <AlertTriangle className="h-4 w-4 text-red-500" />}
                          {severity === 'medium' && <Activity className="h-4 w-4 text-yellow-500" />}
                          {severity === 'low' && <Shield className="h-4 w-4 text-green-500"  />}

                          <div>
                            <div className="font-medium"><bdi>{event.action.replace('SECURITY_', '')}</bdi></div>
                            {formatEventDetails(event) && (
                              <div className="text-sm text-muted-foreground">
                                {formatEventDetails(event)}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground">
                              {new Date(event.created_at).toLocaleString(locale)}
                            </div>
                          </div>
                        </div>

                        <Badge className={getSeverityColor(severity)}>
                          {t(`severity.${severity}`)}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="sessions" className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                  {t('dashboard.activeSessionsCount', { count: activeSessions.length })}
                </div>
                <Button onClick={cleanupExpiredSessions} variant="outline" size="sm">
                  <Shield className="h-4 w-4 me-2" />
                  {t('dashboard.cleanupExpired')}
                </Button>
              </div>

              {activeSessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('dashboard.noSessions')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeSessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <div className="font-medium">{t('dashboard.sessionLabel', { id: session.id.substring(0, 8) })}</div>
                        <div className="text-sm text-muted-foreground">
                          {t('dashboard.lastActive', { time: new Date(session.last_activity).toLocaleString(locale) })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t('dashboard.expires', { time: new Date(session.expires_at).toLocaleString(locale) })}
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-green-50 text-green-700">
                        {t('common:labels.active')}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
