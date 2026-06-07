import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CookieBanner } from '@/components/public-site/CookieBanner';
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
    description: 'Share a single booking link per treatment, staff member, or campaign. No login, no app — clients pick a slot and you get the booking.',
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
    description: 'Triggered emails for welcomes, birthdays, inactive clients, package renewals, appointment confirmations, and reminders — all in your brand voice.',
  },
  {
    icon: Receipt,
    title: 'Invoicing & Sales',
    description: 'Sequential, audit-grade invoices with frozen snapshots, PDF generation, drafts, and one-tap void. Every transaction reconciles to the cent.',
  },
  {
    icon: Palette,
    title: 'Brand Email Designer',
    description: 'Design the wrapper that every transactional email lives inside. Brand colors, logo, header image — apply once, ship everywhere.',
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
  'Installable PWA for clients — Google or phone OTP sign-in',
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
  'Onboarding + data migration from Square, Vagaro, Acuity, MindBody',
  'A dedicated Golden Circle consultant — not a chatbot',
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
    description: 'Your bookings open, your staff is trained, and your consultant stays in your corner — we answer the phone, not a chatbot.',
  },
];

const faqs = [
  {
    q: 'Is there a contract or long-term commitment?',
    a: 'No long-term contract. Plans are month-to-month. We earn your business every month — if we stop being useful, you stop paying.',
  },
  {
    q: 'How long does onboarding take?',
    a: 'Most salons are fully live within 2–3 weeks. That includes data migration, staff training, and a go-live call. Multi-location setups may take 4–6 weeks depending on scope.',
  },
  {
    q: 'Can you migrate my data from another platform?',
    a: 'Yes. We regularly migrate clients, appointments, waivers, and package balances from Square, Vagaro, MindBody, Acuity, and bespoke spreadsheets. Migration is included in onboarding.',
  },
  {
    q: 'Are SMS reminders included?',
    a: 'Yes — SMS reminders, OTP-verified waivers, and marketing campaigns are part of the plan. You connect your own Twilio or Infobip account so you pay wholesale carrier rates with no markup from us.',
  },
  {
    q: 'What kind of support do I get?',
    a: 'Every customer gets human onboarding, data migration, and ongoing email support. Multi-location groups get a dedicated Golden Circle consultant on call. Real humans, not a ticket queue.',
  },
  {
    q: 'Can my clients book and manage appointments themselves?',
    a: 'Yes — every customer gets a white-label client portal, an installable PWA that lives at your own crm.your-domain.com. Clients sign in with Google or a phone OTP, view their packages, see history, and request bookings against their remaining sessions. You approve or reschedule from the CRM.',
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
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-background/95 backdrop-blur-sm border-b border-border z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Sparkles className="h-7 w-7 text-primary" />
              <div className="flex flex-col leading-tight">
                <span className="text-xl font-bold text-gradient">{BRAND}</span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  by {PARENT}
                </span>
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-foreground hover:text-primary smooth-transition">Features</a>
              <a href="#how" className="text-foreground hover:text-primary smooth-transition">How it works</a>
              <a href="#pricing" className="text-foreground hover:text-primary smooth-transition">Plans</a>
              <a href="#faq" className="text-foreground hover:text-primary smooth-transition">FAQ</a>
            </div>
            <a href="#contact">
              <Button className="bg-primary hover:bg-primary/90 glow-effect">Get a Quote</Button>
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 text-center">
        <div className="max-w-6xl mx-auto">
          <Badge className="mb-6 bg-accent text-accent-foreground">
            Built by consultants who run salons
          </Badge>

          <h1 className="text-5xl md:text-7xl font-black mb-8 leading-tight">
            The salon & spa platform
            <span className="text-gradient block mt-2">run by operators,</span>
            not a call center.
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-3xl mx-auto leading-relaxed">
            {BRAND} is the software arm of {PARENT}. We built it after running our own studios —
            so scheduling, clients, waivers, packages, and marketing finally feel like one tool instead of five.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <a href="#contact">
              <Button size="lg" className="text-lg px-8 py-6 bg-primary hover:bg-primary/90 glow-effect group">
                Get a Quote
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>
            <a href="#pricing">
              <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-primary text-primary hover:bg-primary/5">
                See Plans
              </Button>
            </a>
          </div>

          {/* Preview cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20">
            <Card className="p-6 card-elegant hover:glow-effect smooth-transition">
              <Calendar className="h-12 w-12 text-primary mb-4 mx-auto" />
              <h3 className="text-xl font-bold mb-2">Smart Booking</h3>
              <p className="text-muted-foreground">24/7 online booking with automated confirmations and reminders.</p>
            </Card>
            <Card className="p-6 card-elegant hover:glow-effect smooth-transition">
              <Users className="h-12 w-12 text-primary mb-4 mx-auto" />
              <h3 className="text-xl font-bold mb-2">Client Management</h3>
              <p className="text-muted-foreground">Complete profiles with history, preferences, photos, and waivers.</p>
            </Card>
            <Card className="p-6 card-elegant hover:glow-effect smooth-transition">
              <BarChart3 className="h-12 w-12 text-primary mb-4 mx-auto" />
              <h3 className="text-xl font-bold mb-2">Business Analytics</h3>
              <p className="text-muted-foreground">Track revenue, retention, and staff performance with real insights.</p>
            </Card>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="py-20 px-4 subtle-gradient">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-6">
              Everything you need to
              <span className="text-gradient block mt-2">run a modern spa</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              From booking to billing to marketing, {BRAND} handles every side of the business so you can focus on the work.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="p-6 card-elegant hover:glow-effect smooth-transition group">
                <feature.icon className="h-12 w-12 text-primary mb-4 group-hover:scale-110 smooth-transition" />
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-black mb-6">
                Transform your
                <span className="text-gradient"> beauty business</span>
              </h2>
              <p className="text-xl text-muted-foreground mb-8">
                Join the salon and spa owners who've rebuilt their operations on {BRAND} — and got their evenings back.
              </p>
              <div className="space-y-4">
                {[
                  'Increase bookings by 40% with 24/7 online scheduling',
                  'Cut no-shows by 60% with automated SMS & email reminders',
                  'Save 10+ hours per week on admin, waivers, and reporting',
                  'Boost retention with memberships, packages, and follow-ups',
                ].map((benefit, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <CheckCircle className="h-6 w-6 text-primary flex-shrink-0" />
                    <span className="text-lg">{benefit}</span>
                  </div>
                ))}
              </div>
              <a href="#contact" className="inline-block mt-8">
                <Button size="lg" className="text-lg px-8 py-6 bg-primary hover:bg-primary/90 glow-effect">
                  Request a Quote
                </Button>
              </a>
            </div>

            <div className="relative">
              <div className="bg-gradient-to-br from-primary/10 to-accent/30 rounded-3xl p-8 card-elegant">
                <div className="space-y-6">
                  <div className="bg-card rounded-xl p-4 shadow-sm">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <Calendar className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">Today's Schedule</p>
                        <p className="text-sm text-muted-foreground">12 appointments · 2 from portal</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {[
                        'Signature Facial — Sarah M.',
                        'Microneedling — Emma K. · pkg 4/8',
                        'Hydrafacial — Lisa P. · membership',
                      ].map((appt, i) => (
                        <div key={i} className="text-sm bg-accent/40 rounded-lg p-2">{appt}</div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-card rounded-xl p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Revenue</p>
                        <BarChart3 className="h-4 w-4 text-primary" />
                      </div>
                      <p className="text-xl font-bold text-primary">$24,560</p>
                      <p className="text-xs text-muted-foreground">↗ 18% MoM</p>
                    </div>
                    <div className="bg-card rounded-xl p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Memberships</p>
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                      <p className="text-xl font-bold text-primary">142</p>
                      <p className="text-xs text-muted-foreground">8 renewing this week</p>
                    </div>
                  </div>
                  <div className="bg-card rounded-xl p-4 shadow-sm">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <FileSignature className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-sm">Waivers pending signature</p>
                        <p className="text-xs text-muted-foreground">3 sent today · 1 awaiting OTP</p>
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
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Phone mockup — left column on desktop */}
            <div className="relative order-2 lg:order-1">
              <div className="relative mx-auto" style={{ maxWidth: '320px' }}>
                {/* Phone frame */}
                <div className="bg-foreground rounded-[2.5rem] p-3 shadow-2xl">
                  <div className="bg-background rounded-[2rem] overflow-hidden">
                    {/* Notch */}
                    <div className="h-6 bg-foreground flex justify-center items-end pb-1">
                      <div className="w-20 h-4 bg-foreground rounded-b-2xl"></div>
                    </div>
                    {/* Portal screen */}
                    <div className="p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-widest">Welcome back</p>
                          <p className="font-semibold text-lg">Hi Emma</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                      </div>
                      <Card className="p-4 bg-primary/5 border-primary/10">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Active package</p>
                        <p className="font-semibold text-sm">Microneedling × 8</p>
                        <div className="mt-3 flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">4 of 8 used</p>
                          <p className="text-xs text-primary font-semibold">Expires Aug 14</p>
                        </div>
                        <div className="mt-2 h-1.5 bg-accent rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: '50%' }}></div>
                        </div>
                      </Card>
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Upcoming</p>
                        <div className="bg-card border rounded-lg p-3 flex items-center space-x-3">
                          <Calendar className="h-4 w-4 text-primary flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Microneedling</p>
                            <p className="text-xs text-muted-foreground">Thu Jun 13 · 2:30 PM</p>
                          </div>
                        </div>
                      </div>
                      <Button className="w-full bg-primary hover:bg-primary/90" size="sm">
                        Book a session
                      </Button>
                    </div>
                  </div>
                </div>
                {/* Floating brand chip */}
                <div className="absolute -top-3 -right-3 bg-card border rounded-full px-3 py-1.5 shadow-md flex items-center space-x-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold">crm.your-brand.com</span>
                </div>
              </div>
            </div>

            {/* Copy — right column on desktop */}
            <div className="order-1 lg:order-2">
              <Badge className="mb-4 bg-accent text-accent-foreground">Client Portal</Badge>
              <h2 className="text-4xl md:text-5xl font-black mb-6">
                A booking app
                <span className="text-gradient block mt-2">in your brand</span>
              </h2>
              <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
                Every {BRAND} salon ships with an installable PWA at <span className="font-semibold text-foreground">crm.your-domain.com</span>.
                Clients sign in with Google or phone OTP and see their packages, history, and upcoming visits — never a Beauty Hub Pro logo.
              </p>
              <div className="space-y-4 mb-8">
                {[
                  'Lives on your own domain — clients only ever see your brand',
                  'Installable as an app from any phone, no app store gatekeepers',
                  'Sessions, expiry, and per-treatment counters auto-tracked',
                  'Booking requests route through staff approval, not blind double-bookings',
                  'OTP-verified waivers and agreements signed right on the device',
                ].map((line, i) => (
                  <div key={i} className="flex items-start space-x-3">
                    <CheckCircle className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-lg leading-snug">{line}</span>
                  </div>
                ))}
              </div>
              <a href="#contact" className="inline-block">
                <Button size="lg" className="text-lg px-8 py-6 bg-primary hover:bg-primary/90 glow-effect">
                  See it in your brand
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-20 px-4 subtle-gradient">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-6">
              How it
              <span className="text-gradient"> works</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              {BRAND} is consulting-led, not self-serve. Here's what the first 30 days look like.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {howItWorks.map((step, i) => (
              <Card key={i} className="p-8 card-elegant relative">
                <div className="text-5xl font-bold text-accent mb-2">{step.step}</div>
                <step.icon className="h-10 w-10 text-primary mb-4" />
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{step.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Plan — single tier with everything included */}
      <section id="pricing" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-6">
              One plan.
              <span className="text-gradient block mt-2">Everything inside.</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              No starter / pro / enterprise jenga. Every {BRAND} customer gets the whole platform —
              you pay for the size of your business, not the features you're allowed to touch.
            </p>
          </div>

          <Card className="p-8 md:p-12 card-elegant relative border-primary/40 glow-effect max-w-4xl mx-auto">
            <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground">
              All-Inclusive
            </Badge>

            <div className="text-center mb-10">
              <h3 className="text-3xl font-bold mb-3">The {BRAND} Plan</h3>
              <p className="text-muted-foreground max-w-2xl mx-auto mb-5">
                Built for salons and spas of any size — from a single chair to a multi-location group.
                Quote scales with your team, locations, and SMS volume.
              </p>
              <div className="flex items-baseline justify-center">
                <span className="text-3xl font-semibold text-primary">Custom quote</span>
              </div>
            </div>

            <div className="border-t border-border pt-8 mb-10">
              <p className="text-center text-sm uppercase tracking-widest text-muted-foreground mb-6">
                What's included
              </p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                {includedFeatures.map((feature, i) => (
                  <li key={i} className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <a href="#contact" className="block">
              <Button
                size="lg"
                className="w-full text-lg py-6 bg-primary hover:bg-primary/90 glow-effect group"
              >
                Get your custom quote
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>
          </Card>

          <p className="text-center text-sm text-muted-foreground mt-8 max-w-2xl mx-auto">
            Month-to-month. No setup fee. Cancel any time. Quote scales with your team and locations —
            request a quote and a Golden Circle consultant will come back within one business day.
          </p>
        </div>
      </section>

      {/* About The Golden Circle Consulting */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <Badge className="mb-4 bg-accent text-accent-foreground">About</Badge>
              <h2 className="text-4xl md:text-5xl font-black mb-6">
                {PARENT}
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed mb-4">
                We're salon and spa operators first, software builders second. After two decades
                advising skincare studios on how to grow, we kept running into the same problem:
                the tools our clients used were built by companies that had never swept up a
                treatment room.
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed mb-4">
                So we built {BRAND}. Every subscription includes consulting hours with a real
                Golden Circle advisor — because software alone doesn't grow a business. The
                combination of the two does.
              </p>
            </div>
            <Card className="p-8 card-elegant">
              <ul className="space-y-4">
                {[
                  'Over 20 years of salon & spa consulting',
                  'Built by practitioners, not engineers',
                  'Every plan includes human onboarding',
                  'Consulting hours — not a chatbot',
                  'Your data stays yours, export any time',
                ].map((line, i) => (
                  <li key={i} className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-foreground">{line}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 px-4 subtle-gradient">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-black mb-6">
              Frequently asked
              <span className="text-gradient"> questions</span>
            </h2>
            <p className="text-xl text-muted-foreground">
              Still have questions? Call us at{' '}
              <a href={`tel:${PHONE_TEL}`} className="text-primary hover:underline">{PHONE}</a>.
            </p>
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="card-elegant px-6 rounded-lg border-0">
                <AccordionTrigger className="text-left text-lg font-bold hover:no-underline">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Contact / Quote */}
      <section id="contact" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div>
              <Badge className="mb-4 bg-accent text-accent-foreground">Get started</Badge>
              <h2 className="text-4xl md:text-5xl font-black mb-6">
                Request your
                <span className="text-gradient block mt-2">custom quote</span>
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Tell us about your business. A Golden Circle consultant will reach out within one
                business day with a plan recommendation and pricing tailored to your setup.
              </p>
              <div className="space-y-4">
                <a
                  href={`tel:${PHONE_TEL}`}
                  className="flex items-center space-x-3 text-foreground hover:text-primary smooth-transition"
                >
                  <Phone className="h-5 w-5 text-primary" />
                  <span className="text-lg">{PHONE}</span>
                </a>
                <a
                  href={`mailto:${EMAIL}`}
                  className="flex items-center space-x-3 text-foreground hover:text-primary smooth-transition break-all"
                >
                  <Mail className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-lg">{EMAIL}</span>
                </a>
              </div>
            </div>
            <Card className="p-8 card-elegant">
              <QuoteRequestForm />
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-muted/40 py-16 px-4 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
            <div className="col-span-2">
              <div className="flex items-center space-x-2 mb-4">
                <Sparkles className="h-7 w-7 text-primary" />
                <div className="flex flex-col leading-tight">
                  <span className="text-xl font-bold text-gradient">{BRAND}</span>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    by {PARENT}
                  </span>
                </div>
              </div>
              <p className="text-muted-foreground mb-4 max-w-md">
                The salon and spa management platform from {PARENT}. Built by operators, delivered with consulting.
              </p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <a href={`tel:${PHONE_TEL}`} className="hover:text-primary smooth-transition">📞 {PHONE}</a>
                </p>
                <p>
                  <a href={`mailto:${EMAIL}`} className="hover:text-primary smooth-transition break-all">📧 {EMAIL}</a>
                </p>
              </div>
            </div>

            <div>
              <h3 className="font-bold mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-primary smooth-transition">Features</a></li>
                <li><a href="#how" className="hover:text-primary smooth-transition">How it works</a></li>
                <li><a href="#pricing" className="hover:text-primary smooth-transition">Plans</a></li>
                <li><a href="#faq" className="hover:text-primary smooth-transition">FAQ</a></li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold mb-4">Company</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#contact" className="hover:text-primary smooth-transition">Get a Quote</a></li>
                <li><a href={`mailto:${EMAIL}`} className="hover:text-primary smooth-transition">Contact Us</a></li>
                <li><a href={`tel:${PHONE_TEL}`} className="hover:text-primary smooth-transition">Call Us</a></li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold mb-4">Legal</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to="/privacy" className="hover:text-primary smooth-transition">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-primary smooth-transition">Terms of Use</Link></li>
                <li><Link to="/sms-terms" className="hover:text-primary smooth-transition">SMS Terms</Link></li>
                <li><Link to="/acceptable-use" className="hover:text-primary smooth-transition">Acceptable Use</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border mt-12 pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2026 {PARENT}. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp button — fixed bottom-right, opens wa.me with a pre-filled greeting */}
      <a
        href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with us on WhatsApp"
        className="group fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full bg-[#25D366] px-4 py-3 text-white shadow-lg shadow-[#25D366]/30 hover:bg-[#1ebe5a] hover:shadow-xl hover:shadow-[#25D366]/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          className="h-7 w-7 flex-shrink-0"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
        </svg>
        <span className="hidden sm:inline font-semibold pr-1">Chat on WhatsApp</span>
      </a>

      {/* GDPR/CCPA cookie consent — appears once per browser until decided */}
      <CookieBanner />
    </div>
  );
};
