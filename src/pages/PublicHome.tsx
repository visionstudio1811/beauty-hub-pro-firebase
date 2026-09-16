import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { CookieBanner } from '@/components/public-site/CookieBanner';
import { ScrollToTopButton } from '@/components/public-site/ScrollToTopButton';
import { SalonMarquee } from '@/components/public-site/SalonMarquee';
import { Wordmark } from '@/components/public-site/Wordmark';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  ArrowRight,
  Sparkles,
  Calendar,
  Users,
  BarChart3,
  Shield,
  Star,
  CheckCircle,
  Handshake,
  MessageSquare,
  Rocket,
  Phone,
  Mail,
  FileSignature,
  Smartphone,
  Send,
  Link as LinkIcon,
  Receipt,
  Palette,
} from 'lucide-react';
import { QuoteRequestForm } from '@/components/public-site/QuoteRequestForm';

const BRAND = 'beautyhubpro';
const PARENT = 'The Golden Circle Consulting';
const PHONE = '+1 754-232-6590';
const PHONE_TEL = '+17542326590';
const WHATSAPP_NUMBER = '17542326590';
const EMAIL = 'thegoldencircle.skincare@gmail.com';

// Shared button styles — gold-filled with fixed dark text (legible on both the
// light-page and dark-island gold values), and an outline variant for dark surfaces.
const GOLD_BTN =
  'bg-[rgb(var(--c-gold))] text-[#1b1814] hover:bg-[rgb(var(--c-gold2))] border-0';
const OUTLINE_ON_DARK =
  'bg-transparent border border-[rgb(var(--c-line))] text-ink hover:bg-[rgb(var(--c-ink)/0.08)]';
// Gold eyebrow pill
const GOLD_BADGE =
  'inline-block rounded-full border border-[rgb(var(--c-gold)/0.4)] bg-[rgb(var(--c-gold)/0.1)] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[rgb(var(--c-gold2))]';
// Forward-pointing CTA arrow — flips in RTL and slides along the reading direction on hover.
const CTA_ARROW =
  'ms-2 h-5 w-5 rtl:rotate-180 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-transform';

// Copy for each entry lives in publicSite.json under home.features.items.<key>
const FEATURES = [
  { icon: Calendar, key: 'scheduling' },
  { icon: Smartphone, key: 'portal' },
  { icon: LinkIcon, key: 'schedulerLinks' },
  { icon: FileSignature, key: 'waivers' },
  { icon: Sparkles, key: 'packages' },
  { icon: Send, key: 'marketing' },
  { icon: Receipt, key: 'invoicing' },
  { icon: Palette, key: 'emailDesigner' },
  { icon: Shield, key: 'security' },
] as const;

// Copy for each entry lives in publicSite.json under home.how.steps.<key>
const HOW_IT_WORKS = [
  { icon: Handshake, step: '01', key: 'tell' },
  { icon: MessageSquare, step: '02', key: 'call' },
  { icon: Rocket, step: '03', key: 'live' },
] as const;

// Copy for each entry lives in publicSite.json under home.faq.items.<key>
const FAQ_KEYS = [
  'contract',
  'onboarding',
  'migration',
  'sms',
  'support',
  'portal',
  'marketing',
  'cancel',
] as const;

// Copy for each entry lives in publicSite.json under home.hero.cards.<key>
const HERO_CARDS = [
  { icon: Calendar, key: 'booking' },
  { icon: Users, key: 'clients' },
  { icon: BarChart3, key: 'analytics' },
] as const;

export const PublicHome: React.FC = () => {
  useScrollReveal();
  const { t } = useTranslation('publicSite');

  /** Read a JSON string array from the namespace (returns [] if the key is missing). */
  const list = (key: string): string[] => {
    const value = t(key, { returnObjects: true }) as unknown;
    return Array.isArray(value) ? (value as string[]) : [];
  };

  const brandVars = { brand: BRAND, parent: PARENT };
  const whatsappMessage = t('home.whatsapp.message');

  return (
    <div className="gc-site min-h-screen bg-cream text-ink">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white border-b border-line z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex flex-col leading-tight">
              <Wordmark className="text-xl text-ink" />
              <span className="text-[10px] uppercase tracking-widest text-muted-ink">
                {t('home.nav.byParent', { parent: PARENT })}
              </span>
            </div>
            <div className="hidden md:flex items-center space-x-8 rtl:space-x-reverse">
              <a href="#features" className="text-muted-ink hover:text-ink transition-colors">{t('home.nav.features')}</a>
              <a href="#how" className="text-muted-ink hover:text-ink transition-colors">{t('home.nav.howItWorks')}</a>
              <a href="#pricing" className="text-muted-ink hover:text-ink transition-colors">{t('home.nav.plans')}</a>
              <a href="#faq" className="text-muted-ink hover:text-ink transition-colors">{t('home.nav.faq')}</a>
            </div>
            <div className="flex items-center gap-2">
              {/* Full label on tablet/desktop, icon-only on phones so the CTA keeps room */}
              <LanguageSwitcher variant="full" persist={false} className="hidden sm:inline-flex text-muted-ink hover:text-ink" />
              <LanguageSwitcher variant="compact" persist={false} className="sm:hidden text-muted-ink hover:text-ink" />
              <a href="#contact">
                <Button className={GOLD_BTN}>{t('home.nav.getQuote')}</Button>
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero — dark island with gold radial glow + grid overlay */}
      <section className="is-dark soft-grad relative pt-32 pb-20 px-4 text-center overflow-hidden">
        <div className="grid-bg absolute inset-0 opacity-40 pointer-events-none" aria-hidden="true" />
        <div className="max-w-6xl mx-auto relative z-10">
          <span className={`${GOLD_BADGE} mb-6 gc-reveal in-view`}>
            {t('home.hero.badge')}
          </span>

          <h1 className="font-display text-5xl md:text-7xl font-extrabold text-ink leading-[1.05] text-balance mt-6 mb-8 gc-reveal in-view">
            {t('home.hero.titleLead')}<em className="gold-ink">{t('home.hero.titleEm')}</em>{t('home.hero.titleTail')}<span className="gold-ink">.</span>
          </h1>

          <p className="text-xl md:text-2xl text-muted-ink mb-12 max-w-3xl mx-auto leading-relaxed text-balance gc-reveal gc-reveal-d1 in-view">
            {t('home.hero.subtitle', brandVars)}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16 gc-reveal gc-reveal-d2 in-view">
            <a href="#contact">
              <Button size="lg" className={`text-lg px-8 py-6 group ${GOLD_BTN}`}>
                {t('home.hero.getQuote')}
                <ArrowRight className={CTA_ARROW} />
              </Button>
            </a>
            <a href="#pricing">
              <Button size="lg" variant="outline" className={`text-lg px-8 py-6 ${OUTLINE_ON_DARK}`}>
                {t('home.hero.seePlans')}
              </Button>
            </a>
          </div>

          {/* Preview cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20">
            {HERO_CARDS.map((card) => (
              <div key={card.key} className="lift rounded-xl border border-line bg-cream2 p-6 text-center">
                <card.icon className="h-12 w-12 text-[rgb(var(--c-gold))] mb-4 mx-auto" />
                <h3 className="text-xl text-ink mb-2">{t(`home.hero.cards.${card.key}.title`)}</h3>
                <p className="text-muted-ink">{t(`home.hero.cards.${card.key}.body`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Salons on the network — scrolling marquee */}
      <SalonMarquee />

      {/* Features grid */}
      <section id="features" className="py-20 px-4 bg-cream">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 gc-reveal">
            <h2 className="text-4xl md:text-5xl text-ink mb-6">
              {t('home.features.titleLead')}<em className="gold-ink">{t('home.features.titleEm')}</em><span className="gold-ink">.</span>
            </h2>
            <p className="text-xl text-muted-ink max-w-3xl mx-auto">
              {t('home.features.subtitle', brandVars)}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map((feature, index) => (
              <div
                key={feature.key}
                className={`lift group rounded-xl border border-line bg-cream2 p-6 gc-reveal gc-reveal-d${(index % 3) + 1}`}
              >
                <feature.icon className="h-12 w-12 text-[rgb(var(--c-gold))] mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl text-ink mb-3">{t(`home.features.items.${feature.key}.title`)}</h3>
                <p className="text-muted-ink leading-relaxed">{t(`home.features.items.${feature.key}.description`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-4 bg-cream2">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="gc-reveal">
              <h2 className="text-4xl md:text-5xl text-ink mb-6">
                {t('home.benefits.titleLead')}<em className="gold-ink">{t('home.benefits.titleEm')}</em><span className="gold-ink">.</span>
              </h2>
              <p className="text-xl text-muted-ink mb-8">
                {t('home.benefits.subtitle', brandVars)}
              </p>
              <div className="space-y-4">
                {list('home.benefits.items').map((benefit, index) => (
                  <div key={index} className="flex items-center space-x-3 rtl:space-x-reverse">
                    <CheckCircle className="h-6 w-6 text-[rgb(var(--c-gold))] flex-shrink-0" />
                    <span className="text-lg text-ink">{benefit}</span>
                  </div>
                ))}
              </div>
              <a href="#contact" className="inline-block mt-8">
                <Button size="lg" className={`text-lg px-8 py-6 ${GOLD_BTN}`}>
                  {t('home.benefits.cta')}
                </Button>
              </a>
            </div>

            <div className="relative gc-reveal gc-reveal-d2">
              <div className="rounded-3xl p-8 border border-line bg-cream">
                <div className="space-y-6">
                  <div className="rounded-xl p-4 border border-line bg-[rgb(var(--c-white))]">
                    <div className="flex items-center space-x-3 rtl:space-x-reverse mb-3">
                      <div className="w-10 h-10 bg-[rgb(var(--c-gold)/0.15)] rounded-full flex items-center justify-center">
                        <Calendar className="h-5 w-5 text-[rgb(var(--c-gold))]" />
                      </div>
                      <div>
                        <p className="font-semibold text-ink">{t('home.benefits.mock.todaysSchedule')}</p>
                        <p className="text-sm text-muted-ink">{t('home.benefits.mock.appointmentsSummary')}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {list('home.benefits.mock.appointments').map((appt, i) => (
                        <div key={i} className="text-sm text-ink bg-[rgb(var(--c-gold)/0.1)] rounded-lg p-2">{appt}</div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl p-4 border border-line bg-[rgb(var(--c-white))]">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-muted-ink uppercase tracking-wide">{t('home.benefits.mock.revenue')}</p>
                        <BarChart3 className="h-4 w-4 text-[rgb(var(--c-gold))]" />
                      </div>
                      <p className="text-xl font-bold gold-ink"><span className="ltr-inline">{t('home.benefits.mock.revenueValue')}</span></p>
                      <p className="text-xs text-muted-ink">{t('home.benefits.mock.revenueDelta')}</p>
                    </div>
                    <div className="rounded-xl p-4 border border-line bg-[rgb(var(--c-white))]">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-muted-ink uppercase tracking-wide">{t('home.benefits.mock.memberships')}</p>
                        <Sparkles className="h-4 w-4 text-[rgb(var(--c-gold))]" />
                      </div>
                      <p className="text-xl font-bold gold-ink">{t('home.benefits.mock.membershipsValue')}</p>
                      <p className="text-xs text-muted-ink">{t('home.benefits.mock.membershipsNote')}</p>
                    </div>
                  </div>
                  <div className="rounded-xl p-4 border border-line bg-[rgb(var(--c-white))]">
                    <div className="flex items-center space-x-3 rtl:space-x-reverse">
                      <div className="w-10 h-10 bg-[rgb(var(--c-gold)/0.15)] rounded-full flex items-center justify-center">
                        <FileSignature className="h-5 w-5 text-[rgb(var(--c-gold))]" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-ink">{t('home.benefits.mock.waiversPending')}</p>
                        <p className="text-xs text-muted-ink">{t('home.benefits.mock.waiversNote')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Client Portal showcase */}
      <section className="py-20 px-4 bg-cream">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Phone mockup — first column on desktop */}
            <div className="relative order-2 lg:order-1 gc-reveal">
              <div className="relative mx-auto" style={{ maxWidth: '320px' }}>
                {/* Phone frame */}
                <div className="bg-ink rounded-[2.5rem] p-3 shadow-2xl">
                  <div className="bg-cream rounded-[2rem] overflow-hidden">
                    {/* Notch */}
                    <div className="h-6 bg-ink flex justify-center items-end pb-1">
                      <div className="w-20 h-4 bg-ink rounded-b-2xl"></div>
                    </div>
                    {/* Portal screen */}
                    <div className="p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-ink uppercase tracking-widest">{t('home.portal.mock.welcomeBack')}</p>
                          <p className="font-semibold text-lg text-ink">{t('home.portal.mock.greeting')}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-[rgb(var(--c-gold)/0.15)] flex items-center justify-center">
                          <Users className="h-5 w-5 text-[rgb(var(--c-gold))]" />
                        </div>
                      </div>
                      <div className="rounded-lg p-4 border border-[rgb(var(--c-gold)/0.25)] bg-[rgb(var(--c-gold)/0.08)]">
                        <p className="text-xs text-muted-ink uppercase tracking-wide mb-1">{t('home.portal.mock.activePackage')}</p>
                        <p className="font-semibold text-sm text-ink">{t('home.portal.mock.packageName')}</p>
                        <div className="mt-3 flex items-center justify-between">
                          <p className="text-xs text-muted-ink">{t('home.portal.mock.used')}</p>
                          <p className="text-xs gold-ink font-semibold">{t('home.portal.mock.expires')}</p>
                        </div>
                        <div className="mt-2 h-1.5 bg-[rgb(var(--c-line))] rounded-full overflow-hidden">
                          <div className="h-full bg-[rgb(var(--c-gold))]" style={{ width: '50%' }}></div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-ink">{t('home.portal.mock.upcoming')}</p>
                        <div className="bg-cream2 border border-line rounded-lg p-3 flex items-center space-x-3 rtl:space-x-reverse">
                          <Calendar className="h-4 w-4 text-[rgb(var(--c-gold))] flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink">{t('home.portal.mock.treatment')}</p>
                            <p className="text-xs text-muted-ink">{t('home.portal.mock.when')}</p>
                          </div>
                        </div>
                      </div>
                      <Button className={`w-full ${GOLD_BTN}`} size="sm">
                        {t('home.portal.mock.book')}
                      </Button>
                    </div>
                  </div>
                </div>
                {/* Floating brand chip */}
                <div className="absolute -top-3 -end-3 bg-cream border border-line rounded-full px-3 py-1.5 shadow-md flex items-center space-x-1.5 rtl:space-x-reverse">
                  <Sparkles className="h-3.5 w-3.5 text-[rgb(var(--c-gold))]" />
                  <span className="text-xs font-semibold text-ink ltr-inline">{t('home.portal.chip')}</span>
                </div>
              </div>
            </div>

            {/* Copy — second column on desktop */}
            <div className="order-1 lg:order-2 gc-reveal gc-reveal-d2">
              <span className={`${GOLD_BADGE} mb-4`}>{t('home.portal.badge')}</span>
              <h2 className="text-4xl md:text-5xl text-ink mt-4 mb-6">
                {t('home.portal.titleLead')}<em className="gold-ink">{t('home.portal.titleEm')}</em><span className="gold-ink">.</span>
              </h2>
              <p className="text-xl text-muted-ink mb-8 leading-relaxed">
                {t('home.portal.descriptionLead', brandVars)}<span className="font-semibold text-ink ltr-inline">{t('home.portal.domain')}</span>{t('home.portal.descriptionTail')}
              </p>
              <div className="space-y-4 mb-8">
                {list('home.portal.items').map((line, i) => (
                  <div key={i} className="flex items-start space-x-3 rtl:space-x-reverse">
                    <CheckCircle className="h-6 w-6 text-[rgb(var(--c-gold))] flex-shrink-0 mt-0.5" />
                    <span className="text-lg text-ink leading-snug">{line}</span>
                  </div>
                ))}
              </div>
              <a href="#contact" className="inline-block">
                <Button size="lg" className={`text-lg px-8 py-6 ${GOLD_BTN}`}>
                  {t('home.portal.cta')}
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-20 px-4 bg-cream2">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 gc-reveal">
            <h2 className="text-4xl md:text-5xl text-ink mb-6">
              {t('home.how.titleLead')}<em className="gold-ink">{t('home.how.titleEm')}</em><span className="gold-ink">.</span>
            </h2>
            <p className="text-xl text-muted-ink max-w-3xl mx-auto">
              {t('home.how.subtitle', brandVars)}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.key} className={`lift relative rounded-xl border border-line bg-cream p-8 gc-reveal gc-reveal-d${i + 1}`}>
                <div className="font-display text-5xl font-extrabold gold-ink mb-2">{step.step}</div>
                <step.icon className="h-10 w-10 text-[rgb(var(--c-gold))] mb-4" />
                <h3 className="text-xl text-ink mb-3">{t(`home.how.steps.${step.key}.title`)}</h3>
                <p className="text-muted-ink leading-relaxed">{t(`home.how.steps.${step.key}.description`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trusted by — dark island */}
      <section className="is-dark py-20 px-4 text-center">
        <div className="max-w-3xl mx-auto gc-reveal">
          <div className="flex items-center justify-center gap-1 mb-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-6 w-6 fill-[rgb(var(--c-gold))] text-[rgb(var(--c-gold))]" />
            ))}
          </div>
          <h2 className="text-3xl md:text-4xl text-ink mb-4">
            {t('home.trusted.titleLead')}<em className="gold-ink">{t('home.trusted.titleEm')}</em><span className="gold-ink">.</span>
          </h2>
          <p className="text-lg text-muted-ink">
            {t('home.trusted.subtitle', brandVars)}
          </p>
        </div>
      </section>

      {/* Plan — single tier with everything included */}
      <section id="pricing" className="py-20 px-4 bg-cream">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16 gc-reveal">
            <h2 className="text-4xl md:text-5xl text-ink mb-6">
              {t('home.plan.titleLead')}<em className="gold-ink">{t('home.plan.titleEm')}</em>
            </h2>
            <p className="text-xl text-muted-ink max-w-3xl mx-auto">
              {t('home.plan.subtitle', brandVars)}
            </p>
          </div>

          <div className="relative rounded-2xl border border-[rgb(var(--c-gold)/0.4)] bg-cream2 shadow-gc-elevated p-8 md:p-12 max-w-4xl mx-auto gc-reveal gc-reveal-d1">
            {/* Horizontally centered pill — left-1/2 + -translate-x-1/2 is symmetric, so it stays physical */}
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[rgb(var(--c-gold))] text-[#1b1814] px-4 py-1 text-xs font-semibold uppercase tracking-widest whitespace-nowrap">
              {t('home.plan.badge')}
            </span>

            <div className="text-center mb-10">
              <h3 className="text-3xl text-ink mb-3">{t('home.plan.name', brandVars)}</h3>
              <p className="text-muted-ink max-w-2xl mx-auto mb-5">
                {t('home.plan.description')}
              </p>
              <div className="flex items-baseline justify-center">
                <span className="font-display text-3xl font-extrabold gold-ink">{t('home.plan.price')}</span>
              </div>
            </div>

            <div className="border-t border-line pt-8 mb-10">
              <p className="text-center text-sm uppercase tracking-widest text-muted-ink mb-6">
                {t('home.plan.included')}
              </p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                {list('home.plan.items').map((feature, i) => (
                  <li key={i} className="flex items-start space-x-3 rtl:space-x-reverse">
                    <CheckCircle className="h-5 w-5 text-[rgb(var(--c-gold))] flex-shrink-0 mt-0.5" />
                    <span className="text-ink">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <a href="#contact" className="block">
              <Button size="lg" className={`w-full text-lg py-6 group ${GOLD_BTN}`}>
                {t('home.plan.cta')}
                <ArrowRight className={CTA_ARROW} />
              </Button>
            </a>
          </div>

          <p className="text-center text-sm text-muted-ink mt-8 max-w-2xl mx-auto">
            {t('home.plan.footnote')}
          </p>
        </div>
      </section>

      {/* About The Golden Circle Consulting */}
      <section className="py-20 px-4 bg-cream2">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="gc-reveal">
              <span className={`${GOLD_BADGE} mb-4`}>{t('home.about.badge')}</span>
              <h2 className="text-4xl md:text-5xl text-ink mt-4 mb-6">
                <span className="ltr-inline">{PARENT}</span><span className="gold-ink">.</span>
              </h2>
              <p className="text-lg text-muted-ink leading-relaxed mb-4">
                {t('home.about.p1')}
              </p>
              <p className="text-lg text-muted-ink leading-relaxed mb-4">
                {t('home.about.p2', brandVars)}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-cream p-8 gc-reveal gc-reveal-d2">
              <ul className="space-y-4">
                {list('home.about.items').map((line, i) => (
                  <li key={i} className="flex items-start space-x-3 rtl:space-x-reverse">
                    <CheckCircle className="h-5 w-5 text-[rgb(var(--c-gold))] flex-shrink-0 mt-0.5" />
                    <span className="text-ink">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 px-4 bg-cream">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12 gc-reveal">
            <h2 className="text-4xl md:text-5xl text-ink mb-6">
              {t('home.faq.titleLead')}<em className="gold-ink">{t('home.faq.titleEm')}</em><span className="gold-ink">.</span>
            </h2>
            <p className="text-xl text-muted-ink">
              {t('home.faq.subtitleLead')}
              <a href={`tel:${PHONE_TEL}`} className="gold-ink hover:underline ltr-inline">{PHONE}</a>.
            </p>
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            {FAQ_KEYS.map((key, i) => (
              <AccordionItem key={key} value={`faq-${i}`} className="rounded-lg border border-line bg-cream2 px-6">
                <AccordionTrigger className="text-start text-lg font-semibold text-ink hover:no-underline">
                  {t(`home.faq.items.${key}.q`)}
                </AccordionTrigger>
                <AccordionContent className="text-muted-ink leading-relaxed">
                  {t(`home.faq.items.${key}.a`)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Contact / Quote */}
      <section id="contact" className="py-20 px-4 bg-cream2">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="gc-reveal">
              <span className={`${GOLD_BADGE} mb-4`}>{t('home.contact.badge')}</span>
              <h2 className="text-4xl md:text-5xl text-ink mt-4 mb-6">
                {t('home.contact.titleLead')}<em className="gold-ink">{t('home.contact.titleEm')}</em><span className="gold-ink">.</span>
              </h2>
              <p className="text-lg text-muted-ink mb-8">
                {t('home.contact.description')}
              </p>
              <div className="space-y-4">
                <a
                  href={`tel:${PHONE_TEL}`}
                  className="flex items-center space-x-3 rtl:space-x-reverse text-ink hover:text-[rgb(var(--c-gold))] transition-colors"
                >
                  <Phone className="h-5 w-5 text-[rgb(var(--c-gold))]" />
                  <span className="text-lg ltr-inline">{PHONE}</span>
                </a>
                <a
                  href={`mailto:${EMAIL}`}
                  className="flex items-center space-x-3 rtl:space-x-reverse text-ink hover:text-[rgb(var(--c-gold))] transition-colors break-all"
                >
                  <Mail className="h-5 w-5 text-[rgb(var(--c-gold))] flex-shrink-0" />
                  <span className="text-lg ltr-inline">{EMAIL}</span>
                </a>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-cream p-8 gc-reveal gc-reveal-d2">
              <QuoteRequestForm />
            </div>
          </div>
        </div>
      </section>

      {/* Footer — dark island */}
      <footer className="is-dark py-16 px-4 border-t border-line">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
            <div className="col-span-2">
              <div className="flex flex-col leading-tight mb-4">
                <Wordmark className="text-xl text-ink" />
                <span className="text-[10px] uppercase tracking-widest text-muted-ink">
                  {t('home.footer.byParent', { parent: PARENT })}
                </span>
              </div>
              <p className="text-muted-ink mb-4 max-w-md">
                {t('home.footer.tagline', { parent: PARENT })}
              </p>
              <div className="space-y-2 text-sm text-muted-ink">
                <p>
                  <a href={`tel:${PHONE_TEL}`} className="hover:text-[rgb(var(--c-gold))] transition-colors">📞 <span className="ltr-inline">{PHONE}</span></a>
                </p>
                <p>
                  <a href={`mailto:${EMAIL}`} className="hover:text-[rgb(var(--c-gold))] transition-colors break-all">📧 <span className="ltr-inline">{EMAIL}</span></a>
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest gold-ink mb-4">{t('home.footer.product')}</h3>
              <ul className="space-y-2 text-sm text-muted-ink">
                <li><a href="#features" className="hover:text-[rgb(var(--c-gold))] transition-colors">{t('home.footer.features')}</a></li>
                <li><a href="#how" className="hover:text-[rgb(var(--c-gold))] transition-colors">{t('home.footer.howItWorks')}</a></li>
                <li><a href="#pricing" className="hover:text-[rgb(var(--c-gold))] transition-colors">{t('home.footer.plans')}</a></li>
                <li><a href="#faq" className="hover:text-[rgb(var(--c-gold))] transition-colors">{t('home.footer.faq')}</a></li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest gold-ink mb-4">{t('home.footer.company')}</h3>
              <ul className="space-y-2 text-sm text-muted-ink">
                <li><a href="#contact" className="hover:text-[rgb(var(--c-gold))] transition-colors">{t('home.footer.getQuote')}</a></li>
                <li><a href={`mailto:${EMAIL}`} className="hover:text-[rgb(var(--c-gold))] transition-colors">{t('home.footer.contactUs')}</a></li>
                <li><a href={`tel:${PHONE_TEL}`} className="hover:text-[rgb(var(--c-gold))] transition-colors">{t('home.footer.callUs')}</a></li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest gold-ink mb-4">{t('home.footer.legal')}</h3>
              <ul className="space-y-2 text-sm text-muted-ink">
                <li><Link to="/privacy" className="hover:text-[rgb(var(--c-gold))] transition-colors">{t('home.footer.privacy')}</Link></li>
                <li><Link to="/terms" className="hover:text-[rgb(var(--c-gold))] transition-colors">{t('home.footer.terms')}</Link></li>
                <li><Link to="/sms-terms" className="hover:text-[rgb(var(--c-gold))] transition-colors">{t('home.footer.smsTerms')}</Link></li>
                <li><Link to="/acceptable-use" className="hover:text-[rgb(var(--c-gold))] transition-colors">{t('home.footer.acceptableUse')}</Link></li>
                <li><Link to="/dpa" className="hover:text-[rgb(var(--c-gold))] transition-colors">{t('home.footer.dpa')}</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-line mt-12 pt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-center text-sm text-muted-ink">
            <p>{t('home.footer.copyright', { parent: PARENT })}<span className="gold-ink">.</span> {t('home.footer.rights')}</p>
            <LanguageSwitcher variant="full" persist={false} className="text-muted-ink hover:text-ink" />
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp button — circular, fixed at the bottom inline-end corner, opens wa.me with a pre-filled greeting */}
      <a
        href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMessage)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('home.whatsapp.aria')}
        className="group fixed bottom-6 end-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-[#25D366]/30 hover:bg-[#1ebe5a] hover:shadow-xl hover:shadow-[#25D366]/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          className="h-7 w-7 flex-shrink-0"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
        </svg>
      </a>

      {/* Back-to-top button — appears after scroll, sits above the WhatsApp button */}
      <ScrollToTopButton />

      {/* GDPR/CCPA cookie consent — centered modal, appears once per browser until decided */}
      <CookieBanner />
    </div>
  );
};
