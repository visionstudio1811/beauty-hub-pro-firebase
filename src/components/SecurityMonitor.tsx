
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, AlertTriangle, Eye, RefreshCw } from 'lucide-react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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

export const SecurityMonitor: React.FC = () => {
  const { t } = useTranslation('security');
  const { locale } = useLanguage();
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { logSecurityEvent, hasPermission } = useSecurityValidation();
  const { currentOrganization } = useOrganization();

  useEffect(() => {
    checkPermissionAndLoad();
  }, []);

  const checkPermissionAndLoad = async () => {
    const canView = await hasPermission('view', 'security');
    if (canView) {
      fetchSecurityEvents();
    } else {
      toast({
        title: t('monitor.toasts.accessDenied.title'),
        description: t('monitor.toasts.accessDenied.description'),
        variant: "destructive"
      });
      setLoading(false);
    }
  };

  const fetchSecurityEvents = async () => {
    if (!currentOrganization?.id) return;
    try {
      setLoading(true);

      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'auditLogs'),
          where('action', '>=', 'SECURITY_'),
          where('action', '<=', 'SECURITY_\uf8ff'),
          orderBy('action'),
          orderBy('created_at', 'desc'),
          limit(50)
        )
      );

      setEvents(snap.docs.map(d => ({
        id: d.id,
        action: d.data().action ?? '',
        created_at: d.data().created_at ?? new Date().toISOString(),
        new_values: d.data().details ?? undefined,
        user_id: d.data().user_id ?? undefined,
      })));

      await logSecurityEvent('SECURITY_MONITOR_VIEWED', { eventsCount: snap.size });
    } catch (error) {
      console.error('Error fetching security events:', error);
      toast({
        title: t('common:status.error'),
        description: t('monitor.toasts.loadEventsFailed'),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getEventSeverity = (action: string) => {
    if (action.includes('FAILED') || action.includes('ERROR') || action.includes('DENIED')) {
      return 'high';
    }
    if (action.includes('ATTEMPT') || action.includes('CHECK')) {
      return 'medium';
    }
    return 'low';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-green-100 text-green-800';
    }
  };

  const formatEventDetails = (event: SecurityEvent) => {
    if (!event.new_values) return '';

    const details = [];
    if (event.new_values.userRole) details.push(t('monitor.details.role', { role: event.new_values.userRole }));
    if (event.new_values.permission) details.push(t('monitor.details.permission', { permission: event.new_values.permission }));
    if (event.new_values.resource) details.push(t('monitor.details.resource', { resource: event.new_values.resource }));
    if (event.new_values.granted !== undefined) {
      details.push(t('monitor.details.granted', {
        granted: event.new_values.granted ? t('common:actions.yes') : t('common:actions.no'),
      }));
    }

    return details.join(', ');
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t('monitor.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="text-muted-foreground">{t('monitor.loading')}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            {t('monitor.title')}
          </CardTitle>
          <Button onClick={fetchSecurityEvents} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 me-2" />
            {t('common:actions.refresh')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t('monitor.noEvents')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => {
              const severity = getEventSeverity(event.action);
              return (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex items-center space-x-3 rtl:space-x-reverse">
                    {severity === 'high' && <AlertTriangle className="h-4 w-4 text-red-500" />}
                    {severity === 'medium' && <Eye className="h-4 w-4 text-yellow-500" />}
                    {severity === 'low' && <Shield className="h-4 w-4 text-green-500" />}

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
      </CardContent>
    </Card>
  );
};
