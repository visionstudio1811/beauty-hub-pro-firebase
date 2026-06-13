import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
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
const WHATSAPP_MESSAGE = "Hi! I'd like a quote for Beauty Hub Pro.";
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

const features = [
  {
    icon: Calendar,
    title: 'Advanced Scheduling',
    description: 'Per-staff availability, service durations, conflict prevention, custom-time overrides for walk-ins and VIPs, and weekly + dated overrides.',
  },
  {
    icon: Smartphone,
    title: 'White-Label Client Portal',
    description: 'A branded PWA at crm.your-domain.com where clients sign in, book against their package, track sessions, and view their history.',
  },
  {
    icon: LinkIcon,
    title: 'Public Scheduler Links',
    description: 'Share a single booking link per treatment, staff member, or campaign. No login, no app. Clients pick a slot and you get the booking.',
  },
  {
    icon: FileSignature,
    title: 'Digital Waivers & Agreements',
    description: 'Send waivers and intake forms by SMS or email. Clients sign on their phone with optional OTP verification, photo uploads, and auto-backup to your Drive.',
  },
  {
    icon: Sparkles,
    title: 'Packages & Memberships',
    description: 'Multi-treatment packages with per-treatment session counters, expiry tracking, automatic membership status, and bundled retail.',
  },
  {
    icon: Send,
    title: 'Marketing Automation',
    description: 'Triggered emails for welcomes, birthdays, inactive clients, package renewals, appointment confirmations, and reminders, all in your brand voice.',
  },
  {
    icon: Receipt,
    title: 'Invoicing & Sales',
    description: 'Sequential, audit-grade invoices with frozen snapshots, PDF generation, drafts, and one-tap void. Every transaction reconciles to the cent.',
  },
  {
    icon: Palette,
    title: 'Brand Email Designer',
    description: 'Design the wrapper that every transactional email lives inside. Brand colors, logo, header image. Apply once, ship everywhere.',
  },
  {
    icon: Shield,
    title: 'Secure & Compliant',
    description: 'Role-based access, encrypted storage, audit logs, OTP-gated waiver signing, and per-tenant data isolation enforced in Firestore rules.',
  },
];

const includedFeatures = [
  // Booking & scheduling
  'Unlimited appointments and clients',
  'Per-staff availability, custom-time overrides, conflict prevention',
  'Public scheduler links (per treatment, per staff, per campaign)',
  'Acuity Scheduling sync (webhook + manual)',
  // Client experience
  'White-label client portal on your own domain',
  'Installable PWA for clients with Google or phone OTP sign-in',
  'Multi-treatment packages with per-treatment session counters',
  'Memberships, loyalty, and 3-state membership tracking',
  // Forms & compliance
  'Digital waivers, intakes, and agreements',
  'OTP-verified SMS waiver signing + photo uploads',
  'Google Drive auto-backup of every signed form and invoice',
  // Marketing
  'SMS + email reminders (Twilio or Infobip)',
  'Marketing automations: welcome, birthday, win-back, renewals',
  'Brand email designer with reusable wrapper templates',
  'Audience builder and campaign analytics',
  // Money & ops
  'Sequential, audit-grade invoicing with PDF + drafts',
  'Revenue, retention, and staff-performance analytics',
  'Multi-location management with shared client records',
  // Foundation
  'Role-based access, audit logs, per-tenant data isolation',
  'A dedicated Golden Circle consultant, not a chatbot',
];

const howItWorks = [
  {
    icon: Handshake,
    step: '01',
    title: 'Tell us about your business',
    description: 'Fill in a short quote form. We ask about your size, current software, and what you wish worked better.',
  },
  {
    icon: MessageSquare,
    step: '02',
    title: 'Onboarding call',
    description: 'A Golden Circle consultant scopes your setup, migrates your data from Square, Vagaro, or Acuity, and trains your team.',
  },
  {
    icon: Rocket,
    step: '03',
    title: 'Go live with confidence',
    description: 'Your bookings open, your staff is trained, and your consultant stays in your corner. We answer the phone, not a chatbot.',
  },
];

const faqs = [
  {
    q: 'Is there a contract or long-term commitment?',
    a: 'No long-term contract. Plans are month-to-month. We earn your business every month. If we stop being useful, you stop paying.',
  },
  {
    q: 'How long does onboarding take?',
    a: 'Most salons are fully live within 2 to 3 weeks. That includes data migration, staff training, and a go-live call. Multi-location setups may take 4 to 6 weeks depending on scope.',
  },
  {
    q: 'Can you migrate my data from another platform?',
    a: 'Yes. We regularly migrate clients, appointments, waivers, and package balances from Square, Vagaro, MindBody, Acuity, and bespoke spreadsheets. Migration is included in onboarding.',
  },
  {
    q: 'Are SMS reminders included?',
    a: 'Yes. SMS reminders, OTP-verified waivers, and marketing campaigns are part of the plan. You connect your own Twilio or Infobip account so you pay wholesale carrier rates with no markup from us.',
  },
  {
    q: 'What kind of support do I get?',
    a: 'Every customer gets human onboarding, data migration, and ongoing email support. Multi-location groups get a dedicated Golden Circle consultant on call. Real humans, not a ticket queue.',
  },
  {
    q: 'Can my clients book and manage appointments themselves?',
    a: 'Yes. Every customer gets a white-label client portal, an installable PWA that lives at your own crm.your-domain.com. Clients sign in with Google or a phone OTP, view their packages, see history, and request bookings against their remaining sessions. You approve or reschedule from the CRM.',
  },
  {
    q: 'Do marketing emails go out automatically?',
    a: 'Yes. Marketing automations cover welcomes, birthdays, inactive-client win-backs, package-renewal nudges, appointment confirmations, and reminders. Every email runs through your own branded wrapper that you design once in the email designer.',
  },
  {
    q: 'How do I cancel?',
    a: 'Email or call us any time. You can export your client, appointment, and package data before you go. We do not hold your data hostage.',
  },
];

export const PublicHome: React.FC = () => {
  useScrollReveal();

  return (
    <div className="gc-site min-h-screen bg-cream text-ink">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white border-b border-line z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex flex-col leading-tight">
              <Wordmark className="text-xl text-ink" />
              <span className="text-[10px] uppercase tracking-widest text-muted-ink">
                by {PARENT}
              </span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-muted-ink hover:text-ink transition-colors">Features</a>
              <a href="#how" className="text-muted-ink hover:text-ink transition-colors">How it works</a>
              <a href="#pricing" className="text-muted-ink hover:text-ink transition-colors">Plans</a>
              <a href="#faq" className="text-muted-ink hover:text-ink transition-colors">FAQ</a>
            </div>
            <a href="#contact">
              <Button className={GOLD_BTN}>Get a Quote</Button>
            </a>
          </div>
        </div>
      </nav>

      {/* Hero — dark island with gold radial glow + grid overlay */}
      <section className="is-dark soft-grad relative pt-32 pb-20 px-4 text-center overflow-hidden">
        <div className="grid-bg absolute inset-0 opacity-40 pointer-events-none" aria-hidden="true" />
        <div className="max-w-6xl mx-auto relative z-10">
          <span className={`${GOLD_BADGE} mb-6 gc-reveal in-view`}>
            Built by consultants who run salons
          </span>

          <h1 className="font-display text-5xl md:text-7xl font-extrabold text-ink leading-[1.05] text-balance mt-6 mb-8 gc-reveal in-view">
            The salon &amp; spa platform <em className="gold-ink">run by operators,</em> not a call center<span className="gold-ink">.</span>
          </h1>

          <p className="text-xl md:text-2xl text-muted-ink mb-12 max-w-3xl mx-auto leading-relaxed text-balance gc-reveal gc-reveal-d1 in-view">
            {BRAND} is the software arm of {PARENT}. We built it after running our own studios,
            so scheduling, clients, waivers, packages, and marketing finally feel like one tool instead of five.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16 gc-reveal gc-reveal-d2 in-view">
            <a href="#contact">
              <Button size="lg" className={`text-lg px-8 py-6 group ${GOLD_BTN}`}>
                Get a Quote
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>
            <a href="#pricing">
              <Button size="lg" variant="outline" className={`text-lg px-8 py-6 ${OUTLINE_ON_DARK}`}>
                See Plans
              </Button>
            </a>
          </div>

          {/* Preview cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20">
            {[
              { icon: Calendar, title: 'Smart Booking', body: '24/7 online booking with automated confirmations and reminders.' },
              { icon: Users, title: 'Client Management', body: 'Complete profiles with history, preferences, photos, and waivers.' },
              { icon: BarChart3, title: 'Business Analytics', body: 'Track revenue, retention, and staff performance with real insights.' },
            ].map((card, i) => (
              <div key={i} className="lift rounded-xl border border-line bg-cream2 p-6 text-center">
                <card.icon className="h-12 w-12 text-[rgb(var(--c-gold))] mb-4 mx-auto" />
                <h3 className="text-xl text-ink mb-2">{card.title}</h3>
                <p className="text-muted-ink">{card.body}</p>
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
              Everything you need to <em className="gold-ink">run a modern spa</em><span className="gold-ink">.</span>
            </h2>
            <p className="text-xl text-muted-ink max-w-3xl mx-auto">
              From booking to billing to marketing, {BRAND} handles every side of the business so you can focus on the work.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className={`lift group rounded-xl border border-line bg-cream2 p-6 gc-reveal gc-reveal-d${(index % 3) + 1}`}
              >
                <feature.icon className="h-12 w-12 text-[rgb(var(--c-gold))] mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl text-ink mb-3">{feature.title}</h3>
                <p className="text-muted-ink leading-relaxed">{feature.description}</p>
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
                Transform your <em className="gold-ink">beauty business</em><span className="gold-ink">.</span>
              </h2>
              <p className="text-xl text-muted-ink mb-8">
                Join the salon and spa owners who've rebuilt their operations on {BRAND} and got their evenings back.
              </p>
              <div className="space-y-4">
                {[
                  'Capture more bookings with 24/7 online scheduling',
                  'Cut no-shows with automated SMS & email reminders',
                  'Save hours every week on admin, waivers, and reporting',
                  'Boost retention with memberships, packages, and follow-ups',
                ].map((benefit, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <CheckCircle className="h-6 w-6 text-[rgb(var(--c-gold))] flex-shrink-0" />
                    <span className="text-lg text-ink">{benefit}</span>
                  </div>
                ))}
              </div>
              <a href="#contact" className="inline-block mt-8">
                <Button size="lg" className={`text-lg px-8 py-6 ${GOLD_BTN}`}>
                  Request a Quote
                </Button>
              </a>
            </div>

            <div className="relative gc-reveal gc-reveal-d2">
              <div className="rounded-3xl p-8 border border-line bg-cream">
                <div className="space-y-6">
                  <div className="rounded-xl p-4 border border-line bg-[rgb(var(--c-white))]">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-10 h-10 bg-[rgb(var(--c-gold)/0.15)] rounded-full flex items-center justify-center">
                        <Calendar className="h-5 w-5 text-[rgb(var(--c-gold))]" />
                      </div>
                      <div>
                        <p className="font-semibold text-ink">Today's Schedule</p>
                        <p className="text-sm text-muted-ink">12 appointments · 2 from portal</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {[
                        'Signature Facial · Sarah M.',
                        'Microneedling · Emma K. · pkg 4/8',
                        'Hydrafacial · Lisa P. · membership',
                      ].map((appt, i) => (
                        <div key={i} className="text-sm text-ink bg-[rgb(var(--c-gold)/0.1)] rounded-lg p-2">{appt}</div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl p-4 border border-line bg-[rgb(var(--c-white))]">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-muted-ink uppercase tracking-wide">Revenue</p>
                        <BarChart3 className="h-4 w-4 text-[rgb(var(--c-gold))]" />
                      </div>
                      <p className="text-xl font-bold gold-ink">$24,560</p>
                      <p className="text-xs text-muted-ink">↗ 18% MoM</p>
                    </div>
                    <div className="rounded-xl p-4 border border-line bg-[rgb(var(--c-white))]">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-muted-ink uppercase tracking-wide">Memberships</p>
                        <Sparkles className="h-4 w-4 text-[rgb(var(--c-gold))]" />
                      </div>
                      <p className="text-xl font-bold gold-ink">142</p>
                      <p className="text-xs text-muted-ink">8 renewing this week</p>
                    </div>
                  </div>
                  <div className="rounded-xl p-4 border border-line bg-[rgb(var(--c-white))]">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-[rgb(var(--c-gold)/0.15)] rounded-full flex items-center justify-center">
                        <FileSignature className="h-5 w-5 text-[rgb(var(--c-gold))]" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-ink">Waivers pending signature</p>
                        <p className="text-xs text-muted-ink">3 sent today · 1 awaiting OTP</p>
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
            {/* Phone mockup — left column on desktop */}
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
                          <p className="text-xs text-muted-ink uppercase tracking-widest">Welcome back</p>
                          <p className="font-semibold text-lg text-ink">Hi Emma</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-[rgb(var(--c-gold)/0.15)] flex items-center justify-center">
                          <Users className="h-5 w-5 text-[rgb(var(--c-gold))]" />
                        </div>
                      </div>
                      <div className="rounded-lg p-4 border border-[rgb(var(--c-gold)/0.25)] bg-[rgb(var(--c-gold)/0.08)]">
                        <p className="text-xs text-muted-ink uppercase tracking-wide mb-1">Active package</p>
                        <p className="font-semibold text-sm text-ink">Microneedling × 8</p>
                        <div className="mt-3 flex items-center justify-between">
                          <p className="text-xs text-muted-ink">4 of 8 used</p>
                          <p className="text-xs gold-ink font-semibold">Expires Aug 14</p>
                        </div>
                        <div className="mt-2 h-1.5 bg-[rgb(var(--c-line))] rounded-full overflow-hidden">
                          <div className="h-full bg-[rgb(var(--c-gold))]" style={{ width: '50%' }}></div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-ink">Upcoming</p>
                        <div className="bg-cream2 border border-line rounded-lg p-3 flex items-center space-x-3">
                          <Calendar className="h-4 w-4 text-[rgb(var(--c-gold))] flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink">Microneedling</p>
                            <p className="text-xs text-muted-ink">Thu Jun 13 · 2:30 PM</p>
                          </div>
                        </div>
                      </div>
                      <Button className={`w-full ${GOLD_BTN}`} size="sm">
                        Book a session
                      </Button>
                    </div>
                  </div>
                </div>
                {/* Floating brand chip */}
                <div className="absolute -top-3 -right-3 bg-cream border border-line rounded-full px-3 py-1.5 shadow-md flex items-center space-x-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[rgb(var(--c-gold))]" />
                  <span className="text-xs font-semibold text-ink">crm.your-brand.com</span>
                </div>
              </div>
            </div>

            {/* Copy — right column on desktop */}
            <div className="order-1 lg:order-2 gc-reveal gc-reveal-d2">
              <span className={`${GOLD_BADGE} mb-4`}>Client Portal</span>
              <h2 className="text-4xl md:text-5xl text-ink mt-4 mb-6">
                A booking app <em className="gold-ink">in your brand</em><span className="gold-ink">.</span>
              </h2>
              <p className="text-xl text-muted-ink mb-8 leading-relaxed">
                Every {BRAND} salon ships with an installable PWA at <span className="font-semibold text-ink">crm.your-domain.com</span>.
                Clients sign in with Google or phone OTP and see their packages, history, and upcoming visits. They never see a Beauty Hub Pro logo.
              </p>
              <div className="space-y-4 mb-8">
                {[
                  'Lives on your own domain, so clients only ever see your brand',
                  'Installable as an app from any phone, no app store gatekeepers',
                  'Sessions, expiry, and per-treatment counters auto-tracked',
                  'Booking requests route through staff approval, not blind double-bookings',
                  'OTP-verified waivers and agreements signed right on the device',
                ].map((line, i) => (
                  <div key={i} className="flex items-start space-x-3">
                    <CheckCircle className="h-6 w-6 text-[rgb(var(--c-gold))] flex-shrink-0 mt-0.5" />
                    <span className="text-lg text-ink leading-snug">{line}</span>
                  </div>
                ))}
              </div>
              <a href="#contact" className="inline-block">
                <Button size="lg" className={`text-lg px-8 py-6 ${GOLD_BTN}`}>
                  See it in your brand
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
              How it <em className="gold-ink">works</em><span className="gold-ink">.</span>
            </h2>
            <p className="text-xl text-muted-ink max-w-3xl mx-auto">
              {BRAND} is consulting-led, not self-serve. Here's what the first 30 days look like.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {howItWorks.map((step, i) => (
              <div key={i} className={`lift relative rounded-xl border border-line bg-cream p-8 gc-reveal gc-reveal-d${i + 1}`}>
                <div className="font-display text-5xl font-extrabold gold-ink mb-2">{step.step}</div>
                <step.icon className="h-10 w-10 text-[rgb(var(--c-gold))] mb-4" />
                <h3 className="text-xl text-ink mb-3">{step.title}</h3>
                <p className="text-muted-ink leading-relaxed">{step.description}</p>
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
            Built by operators, <em className="gold-ink">delivered with consulting</em><span className="gold-ink">.</span>
          </h2>
          <p className="text-lg text-muted-ink">
            Salons across the {PARENT} network run their front desk, packages, waivers, and marketing
            on {BRAND}, backed by people who have actually run a treatment room.
          </p>
        </div>
      </section>

      {/* Plan — single tier with everything included */}
      <section id="pricing" className="py-20 px-4 bg-cream">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16 gc-reveal">
            <h2 className="text-4xl md:text-5xl text-ink mb-6">
              One plan. <em className="gold-ink">Everything inside.</em>
            </h2>
            <p className="text-xl text-muted-ink max-w-3xl mx-auto">
              No starter / pro / enterprise jenga. Every {BRAND} customer gets the whole platform.
              You pay for the size of your business, not the features you're allowed to touch.
            </p>
          </div>

          <div className="relative rounded-2xl border border-[rgb(var(--c-gold)/0.4)] bg-cream2 shadow-gc-elevated p-8 md:p-12 max-w-4xl mx-auto gc-reveal gc-reveal-d1">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[rgb(var(--c-gold))] text-[#1b1814] px-4 py-1 text-xs font-semibold uppercase tracking-widest">
              All-Inclusive
            </span>

            <div className="text-center mb-10">
              <h3 className="text-3xl text-ink mb-3">The {BRAND} Plan</h3>
              <p className="text-muted-ink max-w-2xl mx-auto mb-5">
                Built for salons and spas of any size, from a single chair to a multi-location group.
                Quote scales with your team, locations, and SMS volume.
              </p>
              <div className="flex items-baseline justify-center">
                <span className="font-display text-3xl font-extrabold gold-ink">Custom quote</span>
              </div>
            </div>

            <div className="border-t border-line pt-8 mb-10">
              <p className="text-center text-sm uppercase tracking-widest text-muted-ink mb-6">
                What's included
              </p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                {includedFeatures.map((feature, i) => (
                  <li key={i} className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-[rgb(var(--c-gold))] flex-shrink-0 mt-0.5" />
                    <span className="text-ink">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <a href="#contact" className="block">
              <Button size="lg" className={`w-full text-lg py-6 group ${GOLD_BTN}`}>
                Get your custom quote
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>
          </div>

          <p className="text-center text-sm text-muted-ink mt-8 max-w-2xl mx-auto">
            Month-to-month. No setup fee. Cancel any time. Quote scales with your team and locations.
            Request a quote and a Golden Circle consultant will come back within one business day.
          </p>
        </div>
      </section>

      {/* About The Golden Circle Consulting */}
      <section className="py-20 px-4 bg-cream2">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="gc-reveal">
              <span className={`${GOLD_BADGE} mb-4`}>About</span>
              <h2 className="text-4xl md:text-5xl text-ink mt-4 mb-6">
                {PARENT}<span className="gold-ink">.</span>
              </h2>
              <p className="text-lg text-muted-ink leading-relaxed mb-4">
                We're salon and spa operators first, software builders second. After two decades
                advising skincare studios on how to grow, we kept running into the same problem:
                the tools our clients used were built by companies that had never swept up a
                treatment room.
              </p>
              <p className="text-lg text-muted-ink leading-relaxed mb-4">
                So we built {BRAND}. Every subscription includes consulting hours with a real
                Golden Circle advisor, because software alone doesn't grow a business. The
                combination of the two does.
              </p>
            </div>
            <div className="rounded-xl border border-line bg-cream p-8 gc-reveal gc-reveal-d2">
              <ul className="space-y-4">
                {[
                  'Over 20 years of salon & spa consulting',
                  'Built by practitioners, not engineers',
                  'Every plan includes human onboarding',
                  'Consulting hours, not a chatbot',
                  'Your data stays yours, export any time',
                ].map((line, i) => (
                  <li key={i} className="flex items-start space-x-3">
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
              Frequently asked <em className="gold-ink">questions</em><span className="gold-ink">.</span>
            </h2>
            <p className="text-xl text-muted-ink">
              Still have questions? Call us at{' '}
              <a href={`tel:${PHONE_TEL}`} className="gold-ink hover:underline">{PHONE}</a>.
            </p>
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="rounded-lg border border-line bg-cream2 px-6">
                <AccordionTrigger className="text-left text-lg font-semibold text-ink hover:no-underline">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-ink leading-relaxed">
                  {faq.a}
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
              <span className={`${GOLD_BADGE} mb-4`}>Get started</span>
              <h2 className="text-4xl md:text-5xl text-ink mt-4 mb-6">
                Request your <em className="gold-ink">custom quote</em><span className="gold-ink">.</span>
              </h2>
              <p className="text-lg text-muted-ink mb-8">
                Tell us about your business. A Golden Circle consultant will reach out within one
                business day with a plan recommendation and pricing tailored to your setup.
              </p>
              <div className="space-y-4">
                <a
                  href={`tel:${PHONE_TEL}`}
                  className="flex items-center space-x-3 text-ink hover:text-[rgb(var(--c-gold))] transition-colors"
                >
                  <Phone className="h-5 w-5 text-[rgb(var(--c-gold))]" />
                  <span className="text-lg">{PHONE}</span>
                </a>
                <a
                  href={`mailto:${EMAIL}`}
                  className="flex items-center space-x-3 text-ink hover:text-[rgb(var(--c-gold))] transition-colors break-all"
                >
                  <Mail className="h-5 w-5 text-[rgb(var(--c-gold))] flex-shrink-0" />
                  <span className="text-lg">{EMAIL}</span>
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
                  by {PARENT}
                </span>
              </div>
              <p className="text-muted-ink mb-4 max-w-md">
                The salon and spa management platform from {PARENT}. Built by operators, delivered with consulting.
              </p>
              <div className="space-y-2 text-sm text-muted-ink">
                <p>
                  <a href={`tel:${PHONE_TEL}`} className="hover:text-[rgb(var(--c-gold))] transition-colors">📞 {PHONE}</a>
                </p>
                <p>
                  <a href={`mailto:${EMAIL}`} className="hover:text-[rgb(var(--c-gold))] transition-colors break-all">📧 {EMAIL}</a>
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest gold-ink mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-muted-ink">
                <li><a href="#features" className="hover:text-[rgb(var(--c-gold))] transition-colors">Features</a></li>
                <li><a href="#how" className="hover:text-[rgb(var(--c-gold))] transition-colors">How it works</a></li>
                <li><a href="#pricing" className="hover:text-[rgb(var(--c-gold))] transition-colors">Plans</a></li>
                <li><a href="#faq" className="hover:text-[rgb(var(--c-gold))] transition-colors">FAQ</a></li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest gold-ink mb-4">Company</h3>
              <ul className="space-y-2 text-sm text-muted-ink">
                <li><a href="#contact" className="hover:text-[rgb(var(--c-gold))] transition-colors">Get a Quote</a></li>
                <li><a href={`mailto:${EMAIL}`} className="hover:text-[rgb(var(--c-gold))] transition-colors">Contact Us</a></li>
                <li><a href={`tel:${PHONE_TEL}`} className="hover:text-[rgb(var(--c-gold))] transition-colors">Call Us</a></li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest gold-ink mb-4">Legal</h3>
              <ul className="space-y-2 text-sm text-muted-ink">
                <li><Link to="/privacy" className="hover:text-[rgb(var(--c-gold))] transition-colors">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-[rgb(var(--c-gold))] transition-colors">Terms of Use</Link></li>
                <li><Link to="/sms-terms" className="hover:text-[rgb(var(--c-gold))] transition-colors">SMS Terms</Link></li>
                <li><Link to="/acceptable-use" className="hover:text-[rgb(var(--c-gold))] transition-colors">Acceptable Use</Link></li>
                <li><Link to="/dpa" className="hover:text-[rgb(var(--c-gold))] transition-colors">Data Processing</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-line mt-12 pt-8 text-center text-sm text-muted-ink">
            <p>&copy; 2026 {PARENT}<span className="gold-ink">.</span> All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp button — circular, fixed bottom-right, opens wa.me with a pre-filled greeting */}
      <a
        href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with us on WhatsApp"
        className="group fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-[#25D366]/30 hover:bg-[#1ebe5a] hover:shadow-xl hover:shadow-[#25D366]/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
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
