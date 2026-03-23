
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/contexts/OrganizationContext';

interface SecurityMetrics {
  failedLoginAttempts: number;
  activeSessions: number;
  recentSecurityEvents: number;
  suspiciousActivity: number;
}

interface SecurityAlert {
  id: string;
  type: 'warning' | 'error' | 'info';
  message: string;
  timestamp: string;
  action?: string;
}

export const useEnhancedSecurity = () => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<SecurityMetrics>({
    failedLoginAttempts: 0,
    activeSessions: 0,
    recentSecurityEvents: 0,
    suspiciousActivity: 0
  });
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchSecurityMetrics();
      fetchSecurityAlerts();

      const interval = setInterval(() => {
        fetchSecurityMetrics();
        fetchSecurityAlerts();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [user]);

  const fetchSecurityMetrics = async () => {
    if (!currentOrganization?.id) return;
    try {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const auditRef = collection(db, 'organizations', currentOrganization.id, 'auditLogs');

      const [failedSnap, securitySnap, suspiciousSnap, sessionsSnap] = await Promise.all([
        getDocs(query(auditRef, where('action', '>=', 'LOGIN_FAILED'), where('action', '<=', 'LOGIN_FAILED\uf8ff'), where('created_at', '>=', since24h))),
        getDocs(query(auditRef, where('action', '>=', 'SECURITY_'), where('action', '<=', 'SECURITY_\uf8ff'), where('created_at', '>=', since24h))),
        getDocs(query(auditRef, where('action', '>=', 'SUSPICIOUS'), where('action', '<=', 'SUSPICIOUS\uf8ff'), where('created_at', '>=', since24h))),
        getDocs(query(collection(db, 'users', user!.uid, 'sessions'), where('is_active', '==', true))),
      ]);

      setMetrics({
        failedLoginAttempts: failedSnap.size,
        activeSessions: sessionsSnap.size,
        recentSecurityEvents: securitySnap.size,
        suspiciousActivity: suspiciousSnap.size,
      });
    } catch (error) {
      console.error('Error fetching security metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSecurityAlerts = async () => {
    if (!currentOrganization?.id) return;
    try {
      const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const auditRef = collection(db, 'organizations', currentOrganization.id, 'auditLogs');

      const snap = await getDocs(
        query(
          auditRef,
          where('action', '>=', 'SECURITY_'),
          where('action', '<=', 'SECURITY_\uf8ff'),
          where('created_at', '>=', since1h),
          orderBy('action'),
          orderBy('created_at', 'desc'),
          limit(10)
        )
      );

      const securityAlerts: SecurityAlert[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          type: (data.action.includes('SUSPICIOUS') || data.action.includes('FAILED') ? 'error' :
                 data.action.includes('ATTEMPT') ? 'warning' : 'info') as SecurityAlert['type'],
          message: formatSecurityMessage(data.action, data.details),
          timestamp: data.created_at ?? new Date().toISOString(),
          action: data.action,
        };
      });

      setAlerts(securityAlerts);
    } catch (error) {
      console.error('Error fetching security alerts:', error);
    }
  };

  const formatSecurityMessage = (action: string, details: any) => {
    const cleanAction = action.replace('SECURITY_', '');

    switch (cleanAction) {
      case 'SUSPICIOUS_LOGIN_ATTEMPTS':
        return `Multiple failed login attempts detected (${details?.attempts || 'unknown'} attempts)`;
      case 'MULTIPLE_IP_LOGINS':
        return `User logged in from multiple IP addresses (${details?.distinct_ips || 'unknown'} different IPs)`;
      case 'ROLE_CHANGE':
        return `User role changed from ${details?.old_role} to ${details?.new_role}`;
      case 'SESSION_CLEANUP':
        return `${details?.cleaned_sessions || 0} expired sessions cleaned up`;
      case 'PERMISSION_CHECK_FAILED':
        return `Permission check failed for ${details?.resource || 'unknown resource'}`;
      default:
        return `Security event: ${cleanAction}`;
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    if (!currentOrganization?.id) return;
    try {
      await addDoc(collection(db, 'organizations', currentOrganization.id, 'auditLogs'), {
        action: 'ALERT_ACKNOWLEDGED',
        details: { alert_id: alertId },
        user_id: user?.uid,
        created_at: new Date().toISOString(),
        created_at_ts: serverTimestamp(),
      });

      setAlerts(prev => prev.filter(alert => alert.id !== alertId));

      toast({
        title: "Alert Acknowledged",
        description: "The security alert has been acknowledged."
      });
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      toast({
        title: "Error",
        description: "Failed to acknowledge alert",
        variant: "destructive"
      });
    }
  };

  const forcePasswordReset = async (userId: string) => {
    if (!currentOrganization?.id) return;
    try {
      await addDoc(collection(db, 'organizations', currentOrganization.id, 'auditLogs'), {
        action: 'PASSWORD_RESET_FORCED',
        details: { target_user_id: userId },
        user_id: user?.uid,
        severity: 'high',
        created_at: new Date().toISOString(),
        created_at_ts: serverTimestamp(),
      });

      toast({
        title: "Password Reset Initiated",
        description: "A password reset has been forced for the user."
      });
    } catch (error) {
      console.error('Error forcing password reset:', error);
      toast({
        title: "Error",
        description: "Failed to force password reset",
        variant: "destructive"
      });
    }
  };

  const lockUserAccount = async (userId: string) => {
    if (!currentOrganization?.id) return;
    try {
      // Mark user inactive in Firestore (actual auth disable requires admin SDK / Cloud Function)
      const { doc, updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, 'users', userId), { isActive: false });

      await addDoc(collection(db, 'organizations', currentOrganization.id, 'auditLogs'), {
        action: 'ACCOUNT_LOCKED',
        details: { target_user_id: userId },
        user_id: user?.uid,
        severity: 'high',
        created_at: new Date().toISOString(),
        created_at_ts: serverTimestamp(),
      });

      toast({
        title: "Account Locked",
        description: "The user account has been locked for security."
      });
    } catch (error) {
      console.error('Error locking user account:', error);
      toast({
        title: "Error",
        description: "Failed to lock user account",
        variant: "destructive"
      });
    }
  };

  const getSecurityScore = () => {
    let score = 100;
    if (metrics.failedLoginAttempts > 10) score -= 20;
    if (metrics.suspiciousActivity > 5) score -= 30;
    if (metrics.activeSessions > 20) score -= 10;
    return Math.max(0, score);
  };

  return {
    metrics,
    alerts,
    loading,
    acknowledgeAlert,
    forcePasswordReset,
    lockUserAccount,
    getSecurityScore,
    refreshMetrics: fetchSecurityMetrics
  };
};
