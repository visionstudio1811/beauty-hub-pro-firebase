import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import i18n, {
  applyDocumentLanguage,
  DEFAULT_LANGUAGE,
  isAppLanguage,
  isRtl,
  localeFor,
  type AppLanguage,
} from '@/i18n';

/**
 * Language resolution order (first match wins):
 *   1. explicit override set this session via setLanguage(lang, { persist: false })
 *      (used by client-facing pages that follow the org they resolved)
 *   2. users/{uid}.language        — per-user preference (staff CRM)
 *   3. organizations/{orgId}.language — org default set by an admin in Settings
 *   4. localStorage 'bh:language'  — last choice on this device (covers /auth before login)
 *   5. browser language (navigator.language starts with 'he') — anonymous visitors
 *   6. 'en'
 */

export const LANGUAGE_STORAGE_KEY = 'bh:language';

interface LanguageContextValue {
  language: AppLanguage;
  /** true when the active language is written right-to-left */
  isRtl: boolean;
  /** BCP-47 locale string for Intl / date-fns / toLocaleString */
  locale: string;
  /**
   * Change the active language.
   * persist (default true): also write users/{uid}.language when a staff user is
   * signed in. Pass { persist: false } from client-facing pages.
   */
  setLanguage: (lang: AppLanguage, opts?: { persist?: boolean }) => Promise<void>;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function readStored(): AppLanguage | null {
  try {
    const v = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isAppLanguage(v) ? v : null;
  } catch {
    return null;
  }
}

function browserLanguage(): AppLanguage | null {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator.language : '';
    return nav && nav.toLowerCase().startsWith('he') ? 'he' : null;
  } catch {
    return null;
  }
}

function writeStored(lang: AppLanguage) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    /* private mode */
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const { currentOrganization } = useOrganization();
  const [override, setOverride] = useState<AppLanguage | null>(null);
  const [stored, setStored] = useState<AppLanguage | null>(() => readStored());

  const profileLang = isAppLanguage((profile as { language?: unknown } | null)?.language)
    ? ((profile as { language?: AppLanguage }).language as AppLanguage)
    : null;
  const orgLang = isAppLanguage((currentOrganization as { language?: unknown } | null)?.language)
    ? ((currentOrganization as { language?: AppLanguage }).language as AppLanguage)
    : null;

  const language: AppLanguage = override ?? profileLang ?? orgLang ?? stored ?? browserLanguage() ?? DEFAULT_LANGUAGE;

  useEffect(() => {
    if (i18n.language !== language) void i18n.changeLanguage(language);
    applyDocumentLanguage(language);
  }, [language]);

  const setLanguage = useCallback(
    async (lang: AppLanguage, opts?: { persist?: boolean }) => {
      const persist = opts?.persist ?? true;
      if (!persist) {
        // Session-only (client-facing pages following their org): never touch
        // the device-level preference or the staff profile.
        setOverride(lang);
        return;
      }
      writeStored(lang);
      setStored(lang);
      setOverride(null);
      if (user?.uid && profile) {
        try {
          await updateDoc(doc(db, 'users', user.uid), { language: lang, updatedAt: serverTimestamp() });
        } catch (err) {
          console.error('Failed to persist language preference', err);
        }
      }
      // If there is no profile the localStorage value is what wins (auth page etc.)
      if (!profile) setOverride(lang);
    },
    [user?.uid, profile],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ language, isRtl: isRtl(language), locale: localeFor(language), setLanguage }),
    [language, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
