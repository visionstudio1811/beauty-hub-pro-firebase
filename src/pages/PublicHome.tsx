import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Sparkles, Calendar, Users, BarChart3, Shield, Star, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export const PublicHome: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-accent/10">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/95 backdrop-blur-sm border-b border-border z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Sparkles className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold text-gradient">BeautyHub Pro</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-foreground hover:text-primary smooth-transition">Features</a>
              <a href="#pricing" className="text-foreground hover:text-primary smooth-transition">Pricing</a>
              <a href="#contact" className="text-foreground hover:text-primary smooth-transition">Contact</a>
            </div>
            <div className="flex items-center space-x-4">
              <Link to="/auth">
                <Button variant="ghost" className="hidden md:inline-flex">Sign In</Button>
              </Link>
              <Link to="/auth">
                <Button className="bg-primary hover:bg-primary/90 glow-effect">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 text-center">
        <div className="max-w-6xl mx-auto">
          <Badge className="mb-6 bg-accent text-accent-foreground">
            Trusted by 1000+ Beauty & Spa Businesses
          </Badge>
          
          <h1 className="text-5xl md:text-7xl font-bold mb-8 leading-tight">
            The Complete
            <span className="text-gradient block mt-2">Beauty & Spa</span>
            Management Platform
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-3xl mx-auto leading-relaxed">
            Streamline appointments, manage clients, boost revenue, and grow your beauty business with our all-in-one platform designed specifically for spas, salons, and beauty professionals.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <Link to="/auth">
              <Button size="lg" className="text-lg px-8 py-6 bg-primary hover:bg-primary/90 glow-effect group">
                Start Free Trial
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-primary text-primary hover:bg-primary/5">
              Watch Demo
            </Button>
          </div>

          {/* Feature Preview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20">
            <Card className="p-6 card-elegant hover:glow-effect smooth-transition">
              <Calendar className="h-12 w-12 text-primary mb-4 mx-auto" />
              <h3 className="text-xl font-semibold mb-2">Smart Booking</h3>
              <p className="text-muted-foreground">24/7 online booking with automated confirmations and reminders</p>
            </Card>
            
            <Card className="p-6 card-elegant hover:glow-effect smooth-transition">
              <Users className="h-12 w-12 text-primary mb-4 mx-auto" />
              <h3 className="text-xl font-semibold mb-2">Client Management</h3>
              <p className="text-muted-foreground">Complete client profiles with history, preferences, and notes</p>
            </Card>
            
            <Card className="p-6 card-elegant hover:glow-effect smooth-transition">
              <BarChart3 className="h-12 w-12 text-primary mb-4 mx-auto" />
              <h3 className="text-xl font-semibold mb-2">Business Analytics</h3>
              <p className="text-muted-foreground">Track revenue, performance, and growth with detailed insights</p>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 subtle-gradient">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Everything You Need to 
              <span className="text-gradient block mt-2">Grow Your Business</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              From appointment scheduling to client management, our platform handles every aspect of your beauty business so you can focus on what you do best.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Calendar,
                title: "Advanced Scheduling",
                description: "Intelligent booking system with staff availability, service durations, and conflict prevention"
              },
              {
                icon: Users,
                title: "Client Profiles",
                description: "Detailed client management with treatment history, preferences, and communication logs"
              },
              {
                icon: BarChart3,
                title: "Revenue Analytics",
                description: "Real-time insights into your business performance with detailed financial reporting"
              },
              {
                icon: Shield,
                title: "Secure & Compliant",
                description: "Bank-level security with GDPR compliance and encrypted data protection"
              },
              {
                icon: Sparkles,
                title: "Package Management",
                description: "Create and manage treatment packages, memberships, and loyalty programs"
              },
              {
                icon: Star,
                title: "Multi-Location",
                description: "Manage multiple locations with centralized control and location-specific settings"
              }
            ].map((feature, index) => (
              <Card key={index} className="p-6 card-elegant hover:glow-effect smooth-transition group">
                <feature.icon className="h-12 w-12 text-primary mb-4 group-hover:scale-110 smooth-transition" />
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                Transform Your 
                <span className="text-gradient">Beauty Business</span>
              </h2>
              <p className="text-xl text-muted-foreground mb-8">
                Join thousands of beauty professionals who have revolutionized their operations with our comprehensive platform.
              </p>
              
              <div className="space-y-4">
                {[
                  "Increase bookings by 40% with 24/7 online scheduling",
                  "Reduce no-shows by 60% with automated reminders",
                  "Save 10+ hours per week on administrative tasks",
                  "Boost client retention with personalized communication"
                ].map((benefit, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <CheckCircle className="h-6 w-6 text-primary flex-shrink-0" />
                    <span className="text-lg">{benefit}</span>
                  </div>
                ))}
              </div>
              
              <Link to="/auth" className="inline-block mt-8">
                <Button size="lg" className="text-lg px-8 py-6 bg-primary hover:bg-primary/90 glow-effect">
                  Start Your Free Trial Today
                </Button>
              </Link>
            </div>
            
            <div className="relative">
              <div className="bg-gradient-to-br from-primary/20 to-accent/20 rounded-3xl p-8 card-elegant">
                <div className="space-y-6">
                  <div className="bg-white rounded-xl p-4 shadow-sm">
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
                      {['Facial Treatment - Sarah M.', 'Massage Therapy - Emma K.', 'Hair Styling - Lisa P.'].map((appointment, i) => (
                        <div key={i} className="text-sm bg-accent/30 rounded-lg p-2">{appointment}</div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-semibold">Monthly Revenue</p>
                      <BarChart3 className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-2xl font-bold text-primary">$24,560</p>
                    <p className="text-sm text-green-600">↗ 18% from last month</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 subtle-gradient">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Simple, Transparent 
              <span className="text-gradient block mt-2">Pricing</span>
            </h2>
            <p className="text-xl text-muted-foreground">
              Choose the perfect plan for your business size and needs
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                name: "Starter",
                price: "$29",
                period: "/month",
                description: "Perfect for small salons and solo practitioners",
                features: ["Up to 100 appointments/month", "Basic client management", "Online booking", "Email support"],
                popular: false
              },
              {
                name: "Professional",
                price: "$79",
                period: "/month", 
                description: "Ideal for growing beauty businesses",
                features: ["Unlimited appointments", "Advanced analytics", "Package management", "SMS notifications", "Priority support"],
                popular: true
              },
              {
                name: "Enterprise",
                price: "$149",
                period: "/month",
                description: "For large salons and spa chains",
                features: ["Multi-location support", "Custom integrations", "Advanced reporting", "Dedicated account manager", "Phone support"],
                popular: false
              }
            ].map((plan, index) => (
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
                    <li key={i} className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <Link to="/auth" className="block">
                  <Button 
                    className={`w-full ${plan.popular ? 'bg-primary hover:bg-primary/90 glow-effect' : ''}`}
                    variant={plan.popular ? 'default' : 'outline'}
                  >
                    Start Free Trial
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Ready to Transform Your 
            <span className="text-gradient">Beauty Business?</span>
          </h2>
          <p className="text-xl text-muted-foreground mb-8">
            Join thousands of beauty professionals who trust BeautyHub Pro to manage and grow their business.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/auth">
              <Button size="lg" className="text-lg px-8 py-6 bg-primary hover:bg-primary/90 glow-effect group">
                Start Your Free Trial
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="text-lg px-8 py-6">
              Schedule a Demo
            </Button>
          </div>
          
          <p className="text-sm text-muted-foreground mt-6">
            No credit card required • 14-day free trial • Cancel anytime
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="bg-muted/30 py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-2">
              <div className="flex items-center space-x-2 mb-4">
                <Sparkles className="h-8 w-8 text-primary" />
                <span className="text-2xl font-bold text-gradient">BeautyHub Pro</span>
              </div>
              <p className="text-muted-foreground mb-4 max-w-md">
                The complete beauty and spa management platform trusted by thousands of professionals worldwide.
              </p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>📧 hello@beautyhubpro.com</p>
                <p>📞 +1 (555) 123-4567</p>
                <p>🏢 123 Beauty Street, Wellness City</p>
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-primary smooth-transition">Features</a></li>
                <li><a href="#pricing" className="hover:text-primary smooth-transition">Pricing</a></li>
                <li><a href="#" className="hover:text-primary smooth-transition">Integrations</a></li>
                <li><a href="#" className="hover:text-primary smooth-transition">API</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Support</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary smooth-transition">Help Center</a></li>
                <li><a href="#" className="hover:text-primary smooth-transition">Documentation</a></li>
                <li><a href="#" className="hover:text-primary smooth-transition">Community</a></li>
                <li><a href="#" className="hover:text-primary smooth-transition">Contact Us</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-border mt-12 pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2024 BeautyHub Pro. All rights reserved. Built with ❤️ for beauty professionals.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};