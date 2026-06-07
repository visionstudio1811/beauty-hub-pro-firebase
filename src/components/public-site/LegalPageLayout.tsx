import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowLeft } from 'lucide-react';

const BRAND = 'beautyhubpro';
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
    <div className="min-h-screen bg-background flex flex-col">
      {/* Slim nav */}
      <nav className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
            <Sparkles className="h-7 w-7 text-primary" />
            <div className="flex flex-col leading-tight">
              <span className="text-xl font-bold text-gradient">{BRAND}</span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                by {PARENT}
              </span>
            </div>
          </Link>
          <Link
            to="/"
            className="flex items-center space-x-2 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to home</span>
          </Link>
        </div>
      </nav>

      {/* Header */}
      <header className="border-b border-border py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
            Legal
          </p>
          <h1 className="text-4xl md:text-5xl font-black mb-3">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Last updated: {lastUpdated}
          </p>
          {intro && (
            <div className="mt-6 text-lg text-muted-foreground leading-relaxed">
              {intro}
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 py-12 px-4">
        <article className="max-w-3xl mx-auto space-y-8 text-foreground leading-relaxed [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:scroll-mt-20 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-4 [&_p]:text-base [&_p]:leading-7 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-2 [&_ol]:mb-4 [&_a]:text-primary [&_a]:underline [&_a:hover]:text-primary/80 [&_strong]:font-bold">
          {children}
        </article>
      </main>

      {/* Cross-links footer */}
      <footer className="border-t border-border bg-muted/30 py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm">
            <Link to="/privacy" className="text-muted-foreground hover:text-primary transition-colors">
              Privacy Policy
            </Link>
            <span className="text-border" aria-hidden="true">·</span>
            <Link to="/terms" className="text-muted-foreground hover:text-primary transition-colors">
              Terms of Use
            </Link>
            <span className="text-border" aria-hidden="true">·</span>
            <Link to="/sms-terms" className="text-muted-foreground hover:text-primary transition-colors">
              SMS Terms
            </Link>
            <span className="text-border" aria-hidden="true">·</span>
            <Link to="/acceptable-use" className="text-muted-foreground hover:text-primary transition-colors">
              Acceptable Use
            </Link>
            <span className="text-border" aria-hidden="true">·</span>
            <Link to="/" className="text-muted-foreground hover:text-primary transition-colors">
              Home
            </Link>
          </div>
          <div className="mt-6 text-center text-xs text-muted-foreground space-y-1">
            <p>
              Questions about this policy? Contact us at{' '}
              <a href={`mailto:${EMAIL}`} className="hover:text-primary underline">
                {EMAIL}
              </a>{' '}
              or{' '}
              <a href={`tel:${PHONE_TEL}`} className="hover:text-primary underline">
                {PHONE}
              </a>
              .
            </p>
            <p>&copy; 2026 {PARENT}. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
