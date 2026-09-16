import React, { useEffect } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { Wordmark } from '@/components/public-site/Wordmark';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useLanguage } from '@/i18n/LanguageProvider';
import { isAppLanguage } from '@/i18n';

const PARENT = 'The Golden Circle Consulting';
const PHONE = '+1 754-232-6590';
const PHONE_TEL = '+17542326590';
const EMAIL = 'thegoldencircle.skincare@gmail.com';

interface LegalPageLayoutProps {
  title: string;
  /** Date of the last revision. A Date is formatted with the active locale; a string is rendered as-is. */
  lastUpdated: Date | string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Shared wrapper for the public legal pages (Privacy, Terms, SMS Terms,
 * AUP, DPA). Provides a slim nav, page header with last-updated date, prose
 * styling, cross-links between policies, and a back-home CTA.
 *
 * Supports `?lang=en|he` so a policy can be deep-linked in a specific
 * language. The param is applied via `setLanguage(lang, { persist: false })`,
 * which never writes `users/{uid}.language`, but — like every other
 * `persist: false` caller (WaiverForm, PublicBookingPage, ClientPortal) — it
 * does update the device-level `localStorage['bh:language']` and installs a
 * session-long override that outranks the signed-in user's stored preference
 * until the next full reload. The user can still flip it back with the
 * switcher in the nav. When the active language is Hebrew, a notice under the
 * title states that the English version is the binding one and links to it.
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
  const { t } = useTranslation('legal');
  const { language, locale, setLanguage } = useLanguage();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const langParam = searchParams.get('lang');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Honour ?lang=en|he. persist:false skips the users/{uid} write but still
  // updates localStorage + the in-session override (see LanguageProvider).
  useEffect(() => {
    if (isAppLanguage(langParam)) {
      void setLanguage(langParam, { persist: false });
    }
    // Intentionally keyed on the param only: switching language via the
    // switcher must not be undone by a stale ?lang value in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langParam]);

  const formattedDate =
    lastUpdated instanceof Date
      ? lastUpdated.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })
      : lastUpdated;

  return (
    <div className="gc-site min-h-screen bg-cream text-ink flex flex-col">
      {/* Slim nav */}
      <nav className="border-b border-line bg-white sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex flex-col leading-tight hover:opacity-80 transition-opacity">
            <Wordmark className="text-xl text-ink" />
            <span className="text-[10px] uppercase tracking-widest text-muted-ink">
              {t('layout.by', { parent: PARENT })}
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <LanguageSwitcher variant="full" />
            <Link
              to="/"
              className="flex items-center space-x-2 rtl:space-x-reverse text-sm text-muted-ink hover:text-[rgb(var(--c-gold))] transition-colors"
            >
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              <span className="hidden sm:inline">{t('layout.backToHome')}</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <header className="border-b border-line py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs uppercase tracking-widest text-muted-ink mb-3">
            {t('layout.eyebrow')}
          </p>
          <h1 className="text-4xl md:text-5xl text-ink mb-3">{title}</h1>
          {language === 'he' && (
            <div
              role="note"
              className="mt-4 mb-4 rounded-md border border-[rgb(var(--c-gold))] bg-white px-4 py-3 text-sm text-ink leading-relaxed"
            >
              <Trans
                t={t}
                i18nKey="layout.translationNotice"
                components={{
                  englishLink: (
                    <Link
                      to={{ pathname, search: '?lang=en' }}
                      className="text-[rgb(var(--c-gold))] underline hover:text-[rgb(var(--c-gold2))]"
                    />
                  ),
                }}
              />
            </div>
          )}
          <p className="text-sm text-muted-ink">
            {t('layout.lastUpdated', { date: formattedDate })}
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
        <article className="max-w-3xl mx-auto space-y-8 text-ink leading-relaxed [&_h2]:text-2xl [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:scroll-mt-20 [&_h3]:text-lg [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-4 [&_p]:text-base [&_p]:leading-7 [&_p]:text-[rgb(var(--c-muted))] [&_li]:text-[rgb(var(--c-muted))] [&_ul]:list-disc [&_ul]:ps-6 [&_ul]:space-y-2 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:ps-6 [&_ol]:space-y-2 [&_ol]:mb-4 [&_a]:text-[rgb(var(--c-gold))] [&_a]:underline [&_a:hover]:text-[rgb(var(--c-gold2))] [&_strong]:font-bold [&_strong]:text-ink">
          {children}
        </article>
      </main>

      {/* Cross-links footer */}
      <footer className="border-t border-line bg-cream2 py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm">
            <Link to="/privacy" className="text-muted-ink hover:text-[rgb(var(--c-gold))] transition-colors">
              {t('layout.links.privacy')}
            </Link>
            <span className="text-[rgb(var(--c-line))]" aria-hidden="true">·</span>
            <Link to="/terms" className="text-muted-ink hover:text-[rgb(var(--c-gold))] transition-colors">
              {t('layout.links.terms')}
            </Link>
            <span className="text-[rgb(var(--c-line))]" aria-hidden="true">·</span>
            <Link to="/sms-terms" className="text-muted-ink hover:text-[rgb(var(--c-gold))] transition-colors">
              {t('layout.links.sms')}
            </Link>
            <span className="text-[rgb(var(--c-line))]" aria-hidden="true">·</span>
            <Link to="/acceptable-use" className="text-muted-ink hover:text-[rgb(var(--c-gold))] transition-colors">
              {t('layout.links.aup')}
            </Link>
            <span className="text-[rgb(var(--c-line))]" aria-hidden="true">·</span>
            <Link to="/dpa" className="text-muted-ink hover:text-[rgb(var(--c-gold))] transition-colors">
              {t('layout.links.dpa')}
            </Link>
            <span className="text-[rgb(var(--c-line))]" aria-hidden="true">·</span>
            <Link to="/" className="text-muted-ink hover:text-[rgb(var(--c-gold))] transition-colors">
              {t('layout.links.home')}
            </Link>
          </div>
          <div className="mt-6 text-center text-xs text-muted-ink space-y-1">
            <p>
              <Trans
                t={t}
                i18nKey="layout.contact"
                values={{ email: EMAIL, phone: PHONE }}
                components={{
                  emailLink: (
                    <a href={`mailto:${EMAIL}`} className="ltr-inline hover:text-[rgb(var(--c-gold))] underline" dir="ltr" />
                  ),
                  phoneLink: (
                    <a href={`tel:${PHONE_TEL}`} className="ltr-inline hover:text-[rgb(var(--c-gold))] underline" dir="ltr" />
                  ),
                }}
              />
            </p>
            <p>
              <Trans
                t={t}
                i18nKey="layout.copyright"
                values={{ parent: PARENT }}
                components={{ gold: <span className="gold-ink" /> }}
              />
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

/**
 * Named inline components available inside every legal translation string.
 * Usage in JSON: "See our <privacy>Privacy Policy</privacy>." / "<email>x@y</email>".
 * `<strong>` needs no mapping: react-i18next keeps basic HTML nodes as-is.
 */
export const LEGAL_LINKS: Record<string, React.ReactElement> = {
  privacy: <a href="/privacy" />,
  terms: <a href="/terms" />,
  sms: <a href="/sms-terms" />,
  aup: <a href="/acceptable-use" />,
  dpa: <a href="/dpa" />,
  email: <a href={`mailto:${EMAIL}`} className="ltr-inline" dir="ltr" />,
  phone: <a href={`tel:${PHONE_TEL}`} className="ltr-inline" dir="ltr" />,
  ltr: <span className="ltr-inline" dir="ltr" />,
};

/** Renders one translated legal string (namespace `legal`) with inline links / <strong>. */
export const LegalText: React.FC<{ k: string }> = ({ k }) => (
  <Trans ns="legal" i18nKey={k} components={LEGAL_LINKS} />
);

/** Renders a translated paragraph. */
export const LegalParagraph: React.FC<{ k: string }> = ({ k }) => (
  <p>
    <LegalText k={k} />
  </p>
);

/** Renders a translated array of strings as a bulleted list, one <li> per entry. */
export const LegalList: React.FC<{ k: string }> = ({ k }) => {
  const { t } = useTranslation('legal');
  const items = t(k, { returnObjects: true }) as unknown;
  const list = Array.isArray(items) ? (items as string[]) : [];
  return (
    <ul>
      {list.map((_, i) => (
        <li key={i}>
          <LegalText k={`${k}.${i}`} />
        </li>
      ))}
    </ul>
  );
};
