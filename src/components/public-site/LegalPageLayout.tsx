import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Wordmark } from '@/components/public-site/Wordmark';

const PARENT = 'The Golden Circle Consulting';
const PHONE = '+1 754-232-6590';
const PHONE_TEL = '+17542326590';
const EMAIL = 'thegoldencircle.skincare@gmail.com';

interface LegalPageLayoutProps {
  title: string;
  lastUpdated: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Shared wrapper for the four public legal pages (Privacy, Terms, SMS Terms,
 * AUP). Provides a slim nav, page header with last-updated date, prose
 * styling, cross-links between policies, and a back-home CTA.
 *
 * Scrolls to top on mount so deep-linked sections don't open scrolled to a
 * stale position when the visitor lands from a footer link.
 */
export const LegalPageLayout: React.FC<LegalPageLayoutProps> = ({
  title,
  lastUpdated,
  intro,
  children,
}) => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="gc-site min-h-screen bg-cream text-ink flex flex-col">
      {/* Slim nav */}
      <nav className="border-b border-line bg-white sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex flex-col leading-tight hover:opacity-80 transition-opacity">
            <Wordmark className="text-xl text-ink" />
            <span className="text-[10px] uppercase tracking-widest text-muted-ink">
              by {PARENT}
            </span>
          </Link>
          <Link
            to="/"
            className="flex items-center space-x-2 text-sm text-muted-ink hover:text-[rgb(var(--c-gold))] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to home</span>
          </Link>
        </div>
      </nav>

      {/* Header */}
      <header className="border-b border-line py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs uppercase tracking-widest text-muted-ink mb-3">
            Legal
          </p>
          <h1 className="text-4xl md:text-5xl text-ink mb-3">{title}</h1>
          <p className="text-sm text-muted-ink">
            Last updated: {lastUpdated}
          </p>
          {intro && (
            <div className="mt-6 text-lg text-muted-ink leading-relaxed">
              {intro}
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 py-12 px-4">
        <article className="max-w-3xl mx-auto space-y-8 text-ink leading-relaxed [&_h2]:text-2xl [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:scroll-mt-20 [&_h3]:text-lg [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-4 [&_p]:text-base [&_p]:leading-7 [&_p]:text-[rgb(var(--c-muted))] [&_li]:text-[rgb(var(--c-muted))] [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-2 [&_ol]:mb-4 [&_a]:text-[rgb(var(--c-gold))] [&_a]:underline [&_a:hover]:text-[rgb(var(--c-gold2))] [&_strong]:font-bold [&_strong]:text-ink">
          {children}
        </article>
      </main>

      {/* Cross-links footer */}
      <footer className="border-t border-line bg-cream2 py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm">
            <Link to="/privacy" className="text-muted-ink hover:text-[rgb(var(--c-gold))] transition-colors">
              Privacy Policy
            </Link>
            <span className="text-[rgb(var(--c-line))]" aria-hidden="true">·</span>
            <Link to="/terms" className="text-muted-ink hover:text-[rgb(var(--c-gold))] transition-colors">
              Terms of Use
            </Link>
            <span className="text-[rgb(var(--c-line))]" aria-hidden="true">·</span>
            <Link to="/sms-terms" className="text-muted-ink hover:text-[rgb(var(--c-gold))] transition-colors">
              SMS Terms
            </Link>
            <span className="text-[rgb(var(--c-line))]" aria-hidden="true">·</span>
            <Link to="/acceptable-use" className="text-muted-ink hover:text-[rgb(var(--c-gold))] transition-colors">
              Acceptable Use
            </Link>
            <span className="text-[rgb(var(--c-line))]" aria-hidden="true">·</span>
            <Link to="/dpa" className="text-muted-ink hover:text-[rgb(var(--c-gold))] transition-colors">
              Data Processing
            </Link>
            <span className="text-[rgb(var(--c-line))]" aria-hidden="true">·</span>
            <Link to="/" className="text-muted-ink hover:text-[rgb(var(--c-gold))] transition-colors">
              Home
            </Link>
          </div>
          <div className="mt-6 text-center text-xs text-muted-ink space-y-1">
            <p>
              Questions about this policy? Contact us at{' '}
              <a href={`mailto:${EMAIL}`} className="hover:text-[rgb(var(--c-gold))] underline">
                {EMAIL}
              </a>{' '}
              or{' '}
              <a href={`tel:${PHONE_TEL}`} className="hover:text-[rgb(var(--c-gold))] underline">
                {PHONE}
              </a>
              .
            </p>
            <p>&copy; 2026 {PARENT}<span className="gold-ink">.</span> All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
