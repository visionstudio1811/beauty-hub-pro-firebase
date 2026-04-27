import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';
import { QuoteRequestForm } from '@/components/public-site/QuoteRequestForm';

const BRAND = 'beautyhubpro';
const PARENT = 'The Golden Circle Consulting';
const PHONE = '385-474-2863';
const PHONE_TEL = '3854742863';
const EMAIL = 'thegoldencircle.skincare@gmail.com';

const features = [
  {
    icon: Calendar,
    title: 'Advanced Scheduling',
    description: 'Intelligent booking with staff availability, service durations, and conflict prevention built for spa ops.',
  },
  {
    icon: Users,
    title: 'Client Profiles',
    description: 'Complete client records with treatment history, photos, waivers, preferences, and communication logs.',
  },
  {
    icon: BarChart3,
    title: 'Revenue Analytics',
    description: 'Real-time insights into revenue, retention, and staff performance with detailed financial reporting.',
  },
  {
    icon: Shield,
    title: 'Secure & Compliant',
    description: 'Role-based access, encrypted storage, audit logs, and HIPAA-aware waiver flows for peace of mind.',
  },
  {
    icon: Sparkles,
    title: 'Packages & Memberships',
    description: 'Build treatment packages, recurring memberships, and loyalty programs with automated session tracking.',
  },
  {
    icon: Star,
    title: 'Multi-Location Ready',
    description: 'Manage multiple studios with centralized control, per-location settings, and shared client records.',
  },
];

const tiers = [
  {
    name: 'Essentials',
    price: '$99',
    period: '/mo',
    description: 'For solo practitioners and single-chair studios getting their systems in order.',
    features: [
      'Up to 200 appointments/month',
      'Online booking & client records',
      'Email reminders & confirmations',
      'Waiver templates & e-signing',
      'Standard support',
    ],
    popular: false,
  },
  {
    name: 'Signature',
    price: '$149',
    period: '/mo',
    description: 'For growing salons and spas that need to automate the boring work.',
    features: [
      'Unlimited appointments',
      'SMS reminders & marketing',
      'Packages, memberships & loyalty',
      'Client waivers & photo history',
      'Business analytics dashboard',
      'Priority support',
    ],
    popular: true,
  },
  {
    name: 'Suite',
    price: '$259',
    period: '/mo',
    description: 'For multi-location spas and salon groups that want a dedicated partner.',
    features: [
      'Everything in Signature',
      'Multi-location management',
      'Acuity Scheduling integration',
      'Marketing automations',
      'Custom reporting',
      'Dedicated Golden Circle consultant',
    ],
    popular: false,
  },
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
    a: 'SMS is included on Signature and Suite. You connect your own Twilio account so you pay wholesale carrier rates with no markup from us.',
  },
  {
    q: 'What kind of support do I get?',
    a: 'Email support on every plan, priority support on Signature, and a dedicated consultant on Suite. Real humans at The Golden Circle Consulting — not a ticket queue.',
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
              <a href="#pricing" className="text-foreground hover:text-primary smooth-transition">Pricing</a>
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

          <h1 className="text-5xl md:text-7xl font-bold mb-8 leading-tight">
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
                See Pricing
              </Button>
            </a>
          </div>

          {/* Preview cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20">
            <Card className="p-6 card-elegant hover:glow-effect smooth-transition">
              <Calendar className="h-12 w-12 text-primary mb-4 mx-auto" />
              <h3 className="text-xl font-semibold mb-2">Smart Booking</h3>
              <p className="text-muted-foreground">24/7 online booking with automated confirmations and reminders.</p>
            </Card>
            <Card className="p-6 card-elegant hover:glow-effect smooth-transition">
              <Users className="h-12 w-12 text-primary mb-4 mx-auto" />
              <h3 className="text-xl font-semibold mb-2">Client Management</h3>
              <p className="text-muted-foreground">Complete profiles with history, preferences, photos, and waivers.</p>
            </Card>
            <Card className="p-6 card-elegant hover:glow-effect smooth-transition">
              <BarChart3 className="h-12 w-12 text-primary mb-4 mx-auto" />
              <h3 className="text-xl font-semibold mb-2">Business Analytics</h3>
              <p className="text-muted-foreground">Track revenue, retention, and staff performance with real insights.</p>
            </Card>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="py-20 px-4 subtle-gradient">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
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
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
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
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
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
                        <p className="text-sm text-muted-foreground">12 appointments</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {['Facial Treatment — Sarah M.', 'Massage Therapy — Emma K.', 'Hair Styling — Lisa P.'].map((appt, i) => (
                        <div key={i} className="text-sm bg-accent/40 rounded-lg p-2">{appt}</div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-card rounded-xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-semibold">Monthly Revenue</p>
                      <BarChart3 className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-2xl font-bold text-primary">$24,560</p>
                    <p className="text-sm text-muted-foreground">↗ 18% from last month</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-20 px-4 subtle-gradient">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
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
                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{step.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Simple, transparent
              <span className="text-gradient block mt-2">pricing</span>
            </h2>
            <p className="text-xl text-muted-foreground">
              Choose the plan that fits your business. Every tier includes onboarding with a real consultant.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {tiers.map((plan, index) => (
              <Card key={index} className={`p-8 card-elegant relative ${plan.popular ? 'border-primary glow-effect' : ''}`}>
                {plan.popular && (
                  <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground">
                    Most Popular
                  </Badge>
                )}
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <p className="text-muted-foreground mb-4">{plan.description}</p>
                  <div className="flex items-baseline justify-center">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground ml-1">{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start space-x-3">
                      <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <a href="#contact" className="block">
                  <Button
                    className={`w-full ${plan.popular ? 'bg-primary hover:bg-primary/90 glow-effect' : ''}`}
                    variant={plan.popular ? 'default' : 'outline'}
                  >
                    Get a Quote
                  </Button>
                </a>
              </Card>
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-8">
            All plans month-to-month. No setup fee. Cancel any time.
          </p>
        </div>
      </section>

      {/* About The Golden Circle Consulting */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <Badge className="mb-4 bg-accent text-accent-foreground">About</Badge>
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
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
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
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
                <AccordionTrigger className="text-left text-lg font-semibold hover:no-underline">
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
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
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
              <h3 className="font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-primary smooth-transition">Features</a></li>
                <li><a href="#how" className="hover:text-primary smooth-transition">How it works</a></li>
                <li><a href="#pricing" className="hover:text-primary smooth-transition">Pricing</a></li>
                <li><a href="#faq" className="hover:text-primary smooth-transition">FAQ</a></li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#contact" className="hover:text-primary smooth-transition">Get a Quote</a></li>
                <li><a href={`mailto:${EMAIL}`} className="hover:text-primary smooth-transition">Contact Us</a></li>
                <li><a href={`tel:${PHONE_TEL}`} className="hover:text-primary smooth-transition">Call Us</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border mt-12 pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2026 {PARENT}. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
