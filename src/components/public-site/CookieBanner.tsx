import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

const STORAGE_KEY = 'bh:cookie-consent:v1';

type Choice = 'accepted' | 'rejected';

interface StoredConsent {
  choice: Choice;
  decidedAt: number;
}

function readConsent(): StoredConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (parsed && (parsed.choice === 'accepted' || parsed.choice === 'rejected')) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeConsent(choice: Choice) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ choice, decidedAt: Date.now() }),
    );
  } catch {
    /* localStorage may be blocked — fall through silently */
  }
}

/**
 * GDPR / CCPA-style cookie banner. Renders nothing if the visitor has already
 * decided. Choice is persisted to localStorage under `bh:cookie-consent:v1`.
 *
 * We default the page to using only strictly-necessary cookies; this banner
 * gates analytics + functional cookies. If you later wire in an analytics
 * provider, gate its initialization behind `readConsent()?.choice === 'accepted'`.
 */
export const CookieBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Defer the read so SSR / hydration doesn't flicker. Showing after a tick
    // also lets the page paint first so the banner doesn't fight with hero LCP.
    const timer = setTimeout(() => {
      const stored = readConsent();
      if (!stored) setVisible(true);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  const decide = (choice: Choice) => {
    writeConsent(choice);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop — does not dismiss on click so the choice stays explicit */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
        aria-hidden="true"
      />
      {/* Centered card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-live="polite"
        aria-label="Cookie consent"
        className="relative z-10 w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-300"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-base font-bold text-foreground">Cookies on beautyhubpro.com</p>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              We use cookies that are strictly necessary to operate the site and, with your permission, optional cookies to understand how visitors use it. You can change your mind any time by clearing site data.
            </p>
          </div>
          <button
            onClick={() => decide('rejected')}
            aria-label="Close cookie banner, declines optional cookies"
            className="text-muted-foreground hover:text-foreground p-1 -m-1 flex-shrink-0 rounded transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="flex-1 sm:flex-initial bg-[rgb(var(--c-gold))] text-[#1b1814] hover:bg-[rgb(var(--c-gold2))] border-0"
            onClick={() => decide('accepted')}
          >
            Accept all
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 sm:flex-initial"
            onClick={() => decide('rejected')}
          >
            Reject optional
          </Button>
          <Link
            to="/privacy"
            className="text-xs text-muted-foreground hover:text-primary underline ml-auto"
          >
            Privacy policy
          </Link>
        </div>
      </div>
    </div>
  );
};
