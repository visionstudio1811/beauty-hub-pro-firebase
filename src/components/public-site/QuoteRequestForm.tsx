import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface FormState {
  name: string;
  business: string;
  email: string;
  phone: string;
  tier: string;
  message: string;
  website: string;
}

const initialState: FormState = {
  name: '',
  business: '',
  email: '',
  phone: '',
  tier: 'unsure',
  message: '',
  website: '',
};

export const QuoteRequestForm: React.FC = () => {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const validate = (): string | null => {
    if (!form.name.trim()) return 'Please enter your name.';
    if (!form.business.trim()) return 'Please enter your business name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Please enter a valid email.';
    if (!form.phone.trim()) return 'Please enter a phone number.';
    if (!form.message.trim()) return 'Tell us a little about what you need.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast({ title: 'Please check the form', description: err, variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const submit = httpsCallable(functions, 'submitQuoteRequest');
      await submit({
        name: form.name.trim(),
        business: form.business.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        tier: form.tier,
        message: form.message.trim(),
        website: form.website,
      });
      toast({
        title: 'Request received',
        description: 'A Golden Circle consultant will reach out within one business day.',
      });
      setForm(initialState);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Please try again in a moment.';
      toast({ title: "Couldn't send your request", description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <Label htmlFor="quote-name">Your name</Label>
          <Input
            id="quote-name"
            value={form.name}
            onChange={(e) => update('name')(e.target.value)}
            placeholder="Jane Doe"
            autoComplete="name"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quote-business">Business name</Label>
          <Input
            id="quote-business"
            value={form.business}
            onChange={(e) => update('business')(e.target.value)}
            placeholder="The Golden Spa"
            autoComplete="organization"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quote-email">Email</Label>
          <Input
            id="quote-email"
            type="email"
            value={form.email}
            onChange={(e) => update('email')(e.target.value)}
            placeholder="you@yourbusiness.com"
            autoComplete="email"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quote-phone">Phone</Label>
          <Input
            id="quote-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => update('phone')(e.target.value)}
            placeholder="(555) 123-4567"
            autoComplete="tel"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="quote-tier">Plan you're interested in</Label>
        <Select value={form.tier} onValueChange={update('tier')}>
          <SelectTrigger id="quote-tier">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="essentials">Essentials — $99/mo</SelectItem>
            <SelectItem value="signature">Signature — $149/mo</SelectItem>
            <SelectItem value="suite">Suite — $259/mo</SelectItem>
            <SelectItem value="unsure">Not sure yet</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="quote-message">What should we know about your business?</Label>
        <Textarea
          id="quote-message"
          value={form.message}
          onChange={(e) => update('message')(e.target.value)}
          placeholder="Team size, current software, biggest pain point, timeline…"
          rows={5}
          required
        />
      </div>

      {/* Honeypot — real users never see this */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-5000px', top: 'auto', width: '1px', height: '1px', overflow: 'hidden' }}>
        <Label htmlFor="quote-website">Website</Label>
        <Input
          id="quote-website"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(e) => update('website')(e.target.value)}
        />
      </div>

      <Button type="submit" size="lg" className="w-full glow-effect" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending…
          </>
        ) : (
          'Request My Quote'
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        By submitting you agree to be contacted by The Golden Circle Consulting. We never share your information.
      </p>
    </form>
  );
};
