import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import {
  IDLE_TIMEOUT_MS,
  WARN_BEFORE_MS,
  ACTIVITY_THROTTLE_MS,
  ACTIVITY_KEY,
  markActivity,
  isSessionExpired,
} from '@/lib/idleSession';

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
];

// Idle-session guard. While a user is signed in, listens for activity across
// the document. After 28 minutes of inactivity it shows a "Stay signed in?"
// dialog with a 2-minute countdown; after 30 minutes total it signs the user
// out. Activity in any tab keeps all tabs alive via a localStorage broadcast.
export const IdleLogoutGuard: React.FC = () => {
  const { user, signOut } = useAuth();
  const [warningOpen, setWarningOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(WARN_BEFORE_MS / 1000));

  // Refs so the same activity handler can read/write timers without re-creating
  // listeners every render.
  const warnTimerRef = useRef<number | null>(null);
  const logoutTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const lastWriteRef = useRef(0);

  const clearAllTimers = useCallback(() => {
    if (warnTimerRef.current) {
      window.clearTimeout(warnTimerRef.current);
      warnTimerRef.current = null;
    }
    if (logoutTimerRef.current) {
      window.clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    clearAllTimers();
    setWarningOpen(false);
    try {
      await signOut();
    } catch (err) {
      console.warn('Idle signOut failed', err);
    }
  }, [clearAllTimers, signOut]);

  const scheduleTimers = useCallback(() => {
    clearAllTimers();
    setWarningOpen(false);
    setSecondsLeft(Math.floor(WARN_BEFORE_MS / 1000));

    warnTimerRef.current = window.setTimeout(() => {
      setWarningOpen(true);
      setSecondsLeft(Math.floor(WARN_BEFORE_MS / 1000));
      countdownTimerRef.current = window.setInterval(() => {
        setSecondsLeft(s => (s > 0 ? s - 1 : 0));
      }, 1000);
      logoutTimerRef.current = window.setTimeout(() => {
        void handleSignOut();
      }, WARN_BEFORE_MS);
    }, IDLE_TIMEOUT_MS - WARN_BEFORE_MS);
  }, [clearAllTimers, handleSignOut]);

  // Activity from this tab: throttle the localStorage write so mousemove
  // doesn't hammer it. The local timer reset is also throttled implicitly
  // because we only call scheduleTimers when not already in warning mode.
  const handleLocalActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastWriteRef.current >= ACTIVITY_THROTTLE_MS) {
      lastWriteRef.current = now;
      markActivity(now);
    }
    // While the warning dialog is open, ignore background activity so the user
    // is forced to acknowledge the dialog (clicking "Stay signed in" inside it
    // resets the timer explicitly). Otherwise a stray scroll could silently
    // dismiss the warning.
    if (!warningOpen) {
      scheduleTimers();
    }
  }, [scheduleTimers, warningOpen]);

  // Cross-tab: when another tab writes a fresh activity timestamp, treat it
  // as activity here too.
  const handleStorage = useCallback((e: StorageEvent) => {
    if (e.key !== ACTIVITY_KEY || !e.newValue) return;
    if (!warningOpen) {
      scheduleTimers();
    }
  }, [scheduleTimers, warningOpen]);

  // Tab visibility governs the "30 min open vs 1 hr away" split:
  //  - Hidden (backgrounded/minimized): pause the in-app idle timer so being
  //    away doesn't trip the 30-min limit — the 1-hour away window applies.
  //  - Visible again: if the user has been away longer than the away limit,
  //    sign out; otherwise treat the return as activity and restart the timer.
  const handleVisibility = useCallback(() => {
    if (document.visibilityState === 'hidden') {
      clearAllTimers();
      setWarningOpen(false);
      return;
    }
    // becoming visible
    if (isSessionExpired()) {
      void handleSignOut();
      return;
    }
    markActivity();
    scheduleTimers();
  }, [clearAllTimers, handleSignOut, scheduleTimers]);

  useEffect(() => {
    if (!user) {
      clearAllTimers();
      setWarningOpen(false);
      return;
    }

    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, handleLocalActivity, { passive: true }));
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);
    scheduleTimers();

    return () => {
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, handleLocalActivity));
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearAllTimers();
    };
  }, [user, handleLocalActivity, handleStorage, handleVisibility, scheduleTimers, clearAllTimers]);

  const handleStaySignedIn = () => {
    setWarningOpen(false);
    scheduleTimers();
    markActivity();
  };

  if (!user) return null;

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <AlertDialog open={warningOpen} onOpenChange={(open) => { if (!open) handleStaySignedIn(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Still there?</AlertDialogTitle>
          <AlertDialogDescription>
            You'll be signed out in {mm}:{ss} for security. Click below to stay signed in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleStaySignedIn}>Stay signed in</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
