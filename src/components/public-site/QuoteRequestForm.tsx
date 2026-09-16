import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useTranslation } from 'react-i18next';
import { functions } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  const { t } = useTranslation('publicSite');
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const validate = (): string | null => {
    if (!form.name.trim()) return t('quoteForm.validation.name');
    if (!form.business.trim()) return t('quoteForm.validation.business');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return t('quoteForm.validation.email');
    if (!form.phone.trim()) return t('quoteForm.validation.phone');
    if (!form.message.trim()) return t('quoteForm.validation.message');
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast({ title: t('quoteForm.toasts.checkForm'), description: err, variant: 'destructive' });
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
        title: t('quoteForm.toasts.received'),
        description: t('quoteForm.toasts.receivedDescription'),
      });
      setForm(initialState);
    } catch (err) {
      // Log the raw Firebase HttpsError for debugging, but show visitors a translated message.
      console.error('submitQuoteRequest failed', err);
      toast({
        title: t('quoteForm.toasts.sendFailed'),
        description: t('quoteForm.toasts.tryAgain'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <Label htmlFor="quote-name">{t('quoteForm.fields.name')}</Label>
          <Input
            id="quote-name"
            value={form.name}
            onChange={(e) => update('name')(e.target.value)}
            placeholder={t('quoteForm.fields.namePlaceholder')}
            autoComplete="name"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quote-business">{t('quoteForm.fields.business')}</Label>
          <Input
            id="quote-business"
            value={form.business}
            onChange={(e) => update('business')(e.target.value)}
            placeholder={t('quoteForm.fields.businessPlaceholder')}
            autoComplete="organization"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quote-email">{t('quoteForm.fields.email')}</Label>
          <Input
            id="quote-email"
            type="email"
            value={form.email}
            onChange={(e) => update('email')(e.target.value)}
            placeholder={t('quoteForm.fields.emailPlaceholder')}
            autoComplete="email"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quote-phone">{t('quoteForm.fields.phone')}</Label>
          <Input
            id="quote-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => update('phone')(e.target.value)}
            placeholder={t('quoteForm.fields.phonePlaceholder')}
            autoComplete="tel"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="quote-message">{t('quoteForm.fields.message')}</Label>
        <Textarea
          id="quote-message"
          value={form.message}
          onChange={(e) => update('message')(e.target.value)}
          placeholder={t('quoteForm.fields.messagePlaceholder')}
          rows={5}
          required
        />
      </div>

      {/* Honeypot — real users never see this (physical offset keeps it off-screen in both directions) */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-5000px', top: 'auto', width: '1px', height: '1px', overflow: 'hidden' }}>
        <Label htmlFor="quote-website">{t('quoteForm.fields.website')}</Label>
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
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
            {t('quoteForm.sending')}
          </>
        ) : (
          t('quoteForm.submit')
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        {t('quoteForm.disclaimer')}
      </p>
    </form>
  );
};
