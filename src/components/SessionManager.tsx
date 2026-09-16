
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Monitor, Smartphone, Tablet, AlertTriangle, Trash2, Shield } from 'lucide-react';
import { useSessionSecurity } from '@/hooks/useSessionSecurity';
import { safeFormatters } from '@/lib/safeDateFormatter';

export const SessionManager: React.FC = () => {
  const { t } = useTranslation('security');
  const {
    sessions,
    loading,
    currentSessionId,
    terminateSession,
    terminateAllOtherSessions,
    getSessionRisk
  } = useSessionSecurity();

  const getDeviceIcon = (userAgent: string) => {
    if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
      return <Smartphone className="h-4 w-4" />;
    }
    if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
      return <Tablet className="h-4 w-4" />;
    }
    return <Monitor className="h-4 w-4" />;
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'high':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    }
  };

  const formatIp = (ip: string) => {
    if (!ip || ip === 'unknown' || ip === 'client-ip-placeholder') {
      return t('sessionManager.unknownIp');
    }
    return ip;
  };

  const formatLastActivity = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return t('sessionManager.relative.justNow');
    if (diffMins < 60) return t('sessionManager.relative.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('sessionManager.relative.hoursAgo', { count: diffHours });
    return t('sessionManager.relative.daysAgo', { count: diffDays });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-sm text-gray-500">{t('sessionManager.loading')}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              {t('sessionManager.title')}
            </CardTitle>
            <CardDescription>
              {t('sessionManager.description')}
            </CardDescription>
          </div>
          {sessions.filter(s => s.is_active && s.id !== currentSessionId).length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Trash2 className="h-4 w-4 me-2" />
                  {t('sessionManager.terminateAllOthers')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('sessionManager.terminateAllDialog.title')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('sessionManager.terminateAllDialog.description')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={terminateAllOtherSessions}>
                    {t('sessionManager.terminateAll')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Monitor className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('sessionManager.noSessions')}</p>
            </div>
          ) : (
            sessions.map((session) => {
              const risk = getSessionRisk(session);
              const isCurrent = session.id === currentSessionId;

              return (
                <div
                  key={session.id}
                  className={`flex items-center justify-between p-4 border rounded-lg ${
                    isCurrent ? 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800' : ''
                  }`}
                >
                  <div className="flex items-center space-x-3 rtl:space-x-reverse">
                    {getDeviceIcon(session.user_agent)}

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {session.user_agent.includes('Chrome') ? 'Chrome' :
                           session.user_agent.includes('Firefox') ? 'Firefox' :
                           session.user_agent.includes('Safari') ? 'Safari' : t('sessionManager.browser')}
                        </span>
                        {isCurrent && (
                          <Badge variant="outline" className="text-xs">
                            {t('sessionManager.current')}
                          </Badge>
                        )}
                      </div>

                      <div className="text-sm text-muted-foreground">
                        {t('sessionManager.lastActive', { time: formatLastActivity(session.last_activity) })}
                      </div>

                      <div className="text-xs text-muted-foreground">
                        {t('sessionManager.ipCreated', {
                          ip: formatIp(session.ip_address),
                          date: safeFormatters.shortDate(session.created_at) || '—',
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <Badge className={getRiskColor(risk)}>
                      {t(`risk.${risk}`)}
                    </Badge>

                    {session.is_active ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700">
                        {t('common:labels.active')}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50 text-gray-700">
                        {t('common:labels.inactive')}
                      </Badge>
                    )}

                    {session.is_active && !isCurrent && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" aria-label={t('sessionManager.terminateSessionAria')}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('sessionManager.terminateDialog.title')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('sessionManager.terminateDialog.description')}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => terminateSession(session.id)}>
                              {t('sessionManager.terminate')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}

                    {risk === 'high' && (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
};
