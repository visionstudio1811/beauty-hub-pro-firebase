// Session-timeout policy, shared by AuthContext (page-load / restore check) and
// IdleLogoutGuard (in-app idle timer + tab-visibility check).
//
// Two windows:
//  - IDLE_TIMEOUT_MS  — max inactivity while the tab is OPEN/visible. After this
//                       (with a warning before) the user is signed out.
//  - AWAY_LIMIT_MS    — max time AWAY (tab hidden or browser closed) since the
//                       last activity. On return, if exceeded, the session is
//                       dropped and the user must sign in again. This is what
//                       stops a closed-then-reopened URL from auto-connecting.

export const ACTIVITY_KEY = 'bh:lastActivity';

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min open
export const WARN_BEFORE_MS = 2 * 60 * 1000;   // warn at 28 min
export const ACTIVITY_THROTTLE_MS = 1000;
export const AWAY_LIMIT_MS = 60 * 60 * 1000;   // 1 hour away → re-login

/** Last recorded activity (epoch ms), or 0 if unknown / unavailable. */
export function getLastActivity(): number {
  try {
    return Number(localStorage.getItem(ACTIVITY_KEY) || '0') || 0;
  } catch {
    return 0;
  }
}

/** Record activity now (or at the given time). */
export function markActivity(now: number = Date.now()): void {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(now));
  } catch {
    // localStorage can throw in private mode — ignore.
  }
}

/**
 * True when the last recorded activity is older than the away limit — i.e. the
 * user has been gone too long and a restored session should NOT be honored.
 */
export function isSessionExpired(now: number = Date.now()): boolean {
  const last = getLastActivity();
  return last > 0 && now - last > AWAY_LIMIT_MS;
}
