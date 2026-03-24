import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';

interface SessionData {
  id: string;
  user_id: string;
  session_token: string;
  created_at: string;
  last_activity: string;
  expires_at: string;
  is_active: boolean;
  ip_address: string;
  user_agent: string;
  logout_reason?: string;
}

const docToSession = (id: string, data: any): SessionData => ({
  id,
  user_id: data.user_id || '',
  session_token: data.session_token || '',
  created_at: data.created_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
  last_activity: data.last_activity?.toDate?.()?.toISOString() ?? new Date().toISOString(),
  expires_at: data.expires_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
  is_active: data.is_active ?? true,
  ip_address: String(data.ip_address || 'unknown'),
  user_agent: data.user_agent || '',
  logout_reason: data.logout_reason ?? undefined,
});

export const useSessionSecurity = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchUserSessions();
      setupSessionTracking();
    }
  }, [user?.uid]);

  const fetchUserSessions = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const q = query(
        collection(db, 'users', user.uid, 'sessions'),
        orderBy('created_at', 'desc')
      );
      const snapshot = await getDocs(q);
      setSessions(snapshot.docs.map(d => docToSession(d.id, d.data())));
    } catch (error) {
      console.error('Error fetching user sessions:', error);
      toast({ title: 'Error', description: 'Failed to load session data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const setupSessionTracking = async () => {
    if (!user) return;
    try {
      // Use a cryptographically secure random session ID — never truncate auth tokens
      const sessionToken = crypto.randomUUID();

      // Check if session already exists for this browser session
      const q = query(
        collection(db, 'users', user.uid, 'sessions'),
        where('session_token', '==', sessionToken)
      );
      const existing = await getDocs(q);

      let sessionDocId: string;

      if (!existing.empty) {
        sessionDocId = existing.docs[0].id;
        await updateDoc(doc(db, 'users', user.uid, 'sessions', sessionDocId), {
          last_activity: serverTimestamp(),
          is_active: true,
        });
      } else {
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
        const docRef = await addDoc(collection(db, 'users', user.uid, 'sessions'), {
          user_id: user.uid,
          session_token: sessionToken,
          expires_at: expiresAt,
          last_activity: serverTimestamp(),
          is_active: true,
          ip_address: 'client-ip-placeholder',
          user_agent: navigator.userAgent.substring(0, 200),
          created_at: serverTimestamp(),
        });
        sessionDocId = docRef.id;
      }

      setCurrentSessionId(sessionDocId);

      const activityInterval = setInterval(updateSessionActivity, 5 * 60 * 1000);
      const handleBeforeUnload = () => {
        clearInterval(activityInterval);
        updateSessionActivity();
      };
      window.addEventListener('beforeunload', handleBeforeUnload);

      return () => {
        clearInterval(activityInterval);
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    } catch (error) {
      console.error('Error setting up session tracking:', error);
    }
  };

  const updateSessionActivity = async () => {
    if (!currentSessionId || !user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'sessions', currentSessionId), {
        last_activity: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating session activity:', error);
    }
  };

  const terminateSession = async (sessionId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'sessions', sessionId), {
        is_active: false,
        logout_reason: 'user_terminated',
      });

      await fetchUserSessions();
      toast({ title: 'Session Terminated', description: 'Session has been terminated successfully' });

      if (sessionId === currentSessionId) {
        await signOut(auth);
      }
    } catch (error) {
      console.error('Error terminating session:', error);
      toast({ title: 'Error', description: 'Failed to terminate session', variant: 'destructive' });
    }
  };

  const terminateAllOtherSessions = async () => {
    if (!user || !currentSessionId) return;
    try {
      const q = query(
        collection(db, 'users', user.uid, 'sessions'),
        where('is_active', '==', true)
      );
      const snapshot = await getDocs(q);

      for (const docSnap of snapshot.docs) {
        if (docSnap.id !== currentSessionId) {
          await updateDoc(doc(db, 'users', user.uid, 'sessions', docSnap.id), {
            is_active: false,
            logout_reason: 'all_sessions_terminated',
          });
        }
      }

      await fetchUserSessions();
      toast({ title: 'Sessions Terminated', description: 'All other sessions have been terminated' });
    } catch (error) {
      console.error('Error terminating other sessions:', error);
      toast({ title: 'Error', description: 'Failed to terminate other sessions', variant: 'destructive' });
    }
  };

  const getSessionRisk = (session: SessionData): 'low' | 'medium' | 'high' => {
    const now = new Date();
    const lastActivity = new Date(session.last_activity);
    const hoursSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);

    if (hoursSinceActivity > 24 && session.is_active) return 'high';
    if (hoursSinceActivity > 6) return 'medium';
    return 'low';
  };

  return {
    sessions,
    loading,
    currentSessionId,
    fetchUserSessions,
    terminateSession,
    terminateAllOtherSessions,
    getSessionRisk,
    refreshSessions: fetchUserSessions,
  };
};
