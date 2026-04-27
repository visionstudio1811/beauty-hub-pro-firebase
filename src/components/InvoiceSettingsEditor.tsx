import React, { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useToast } from '@/hooks/use-toast';
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
import { Pencil, Receipt, Eye } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { buildInvoicePdf } from '@/lib/invoicePdf';
import { INVOICE_THEME_LIST } from '@/lib/invoiceThemes';
import type { Invoice } from '@/types/firestore';

const CURRENCIES = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'NZD', label: 'NZD — New Zealand Dollar' },
  { value: 'ILS', label: 'ILS — Israeli Shekel' },
  { value: 'AED', label: 'AED — UAE Dirham' },
];

interface FormState {
  tax_id: string;
  tax_rate: string;
  currency: string;
  invoice_prefix: string;
  invoice_payment_terms: string;
  invoice_notes: string;
  invoice_template: string;
}

const DEFAULTS: FormState = {
  tax_id: '',
  tax_rate: '0',
  currency: 'USD',
  invoice_prefix: 'INV',
  invoice_payment_terms: '',
  invoice_notes: '',
  invoice_template: 'classic',
};

export const InvoiceSettingsEditor: React.FC = () => {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [initial, setInitial] = useState<FormState>(DEFAULTS);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nextNumber, setNextNumber] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [businessContact, setBusinessContact] = useState({
    address: '',
    phone: '',
    email: '',
    website: '',
  });

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!currentOrganization?.id) return;
    const infoRef = doc(
      db,
      'organizations',
      currentOrganization.id,
      'config',
      'businessInfo',
    );
    (async () => {
      setLoading(true);
      const snap = await getDoc(infoRef);
      const d = snap.exists() ? (snap.data() as any) : {};
      const next: FormState = {
        tax_id: d.tax_id ?? '',
        tax_rate: d.tax_rate != null ? String(d.tax_rate) : '0',
        currency: d.currency ?? 'USD',
        invoice_prefix: d.invoice_prefix ?? 'INV',
        invoice_payment_terms: d.invoice_payment_terms ?? '',
        invoice_notes: d.invoice_notes ?? '',
        invoice_template: d.invoice_template ?? 'classic',
      };
      setForm(next);
      setInitial(next);
      setBusinessName(d.name ?? currentOrganization?.name ?? '');
      setBusinessContact({
        address: d.address ?? '',
        phone: d.phone ?? '',
        email: d.email ?? '',
        website: d.website ?? '',
      });
      setLoading(false);
    })();
  }, [currentOrganization?.id]);

  useEffect(() => {
    if (!currentOrganization?.id) return;
    const ref = doc(
      db,
      'organizations',
      currentOrganization.id,
      'config',
      'invoiceCounter',
    );
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const n = (snap.data() as any).next_number;
          setNextNumber(typeof n === 'number' ? n : null);
        } else {
          setNextNumber(1);
        }
      },
      () => setNextNumber(null),
    );
    return () => unsub();
  }, [currentOrganization?.id]);

  const handleField = (field: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!currentOrganization?.id) return;
    const rate = Number(form.tax_rate);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      toast({
        title: 'Invalid tax rate',
        description: 'Enter a number between 0 and 100.',
        variant: 'destructive',
      });
      return;
    }
    if (!form.invoice_prefix.trim()) {
      toast({
        title: 'Missing prefix',
        description: 'Invoice prefix cannot be empty.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const ref = doc(
        db,
        'organizations',
        currentOrganization.id,
        'config',
        'businessInfo',
      );
      await setDoc(
        ref,
        {
          tax_id: form.tax_id.trim(),
          tax_rate: rate,
          currency: form.currency,
          invoice_prefix: form.invoice_prefix.trim().toUpperCase(),
          invoice_payment_terms: form.invoice_payment_terms,
          invoice_notes: form.invoice_notes,
          invoice_template: form.invoice_template,
          updated_at: serverTimestamp(),
        },
        { merge: true },
      );
      setInitial(form);
      setEditing(false);
      toast({
        title: 'Saved',
        description: 'Invoice settings updated.',
      });
    } catch (err: any) {
      toast({
        title: 'Save failed',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(initial);
    setEditing(false);
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const rate = Number(form.tax_rate) || 0;
      const unit = 100000; // $1,000 sample package
      const subtotal = unit;
      const taxAmount = Math.round((subtotal * rate) / 100);
      const total = subtotal + taxAmount;

      const sampleInvoice: Invoice = {
        id: 'sample-preview',
        invoice_number: `${form.invoice_prefix || 'INV'}-${String(nextNumber ?? 1).padStart(5, '0')}`,
        invoice_number_int: nextNumber ?? 1,
        issued_at: Timestamp.now(),
        purchase_id: 'sample-purchase',
        client_id: 'sample-client',
        client_snapshot: {
          name: 'Sample Client',
          email: 'sample@example.com',
          phone: '+1 (555) 000-0000',
          address: '456 Client Ave, Customertown, NY 10002',
        },
        business_snapshot: {
          name: businessName || currentOrganization?.name || 'Your Business',
          address: businessContact.address,
          phone: businessContact.phone,
          email: businessContact.email,
          website: businessContact.website,
          logo_url: (currentOrganization as any)?.logoUrl || '',
          tax_id: form.tax_id,
          payment_terms: form.invoice_payment_terms,
          notes: form.invoice_notes,
          timezone: (currentOrganization as any)?.timezone || 'UTC',
          invoice_template: form.invoice_template,
        },
        line_items: [
          {
            type: 'package',
            name: 'Sample Wellness Package',
            description: '5-session package combining facials and massages.',
            package_id: null,
            treatments: [
              { treatment_id: 'sample-t1', name: 'Signature Facial', quantity: 3, unit_price_cents: 10000 },
              { treatment_id: 'sample-t2', name: 'Swedish Massage', quantity: 2, unit_price_cents: 15000 },
            ],
            quantity: 1,
            unit_price_cents: unit,
            subtotal_cents: subtotal,
          },
        ],
        subtotal_cents: subtotal,
        tax_rate: rate,
        tax_amount_cents: taxAmount,
        total_cents: total,
        currency: form.currency || 'USD',
        pdf_url: null,
        pdf_storage_path: null,
        status: 'issued',
        created_at: Timestamp.now(),
        created_by: '',
      };

      const blob = await buildInvoicePdf(sampleInvoice, form.invoice_template);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (err: any) {
      toast({
        title: 'Preview failed',
        description: err?.message ?? 'Could not render preview.',
        variant: 'destructive',
      });
    } finally {
      setPreviewing(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm text-gray-500">Loading invoice settings…</div>
        </CardContent>
      </Card>
    );
  }

  const nextInvoicePreview = `${form.invoice_prefix || 'INV'}-${String(
    nextNumber ?? 1,
  ).padStart(5, '0')}`;

  return (
    <Card className="w-full overflow-hidden">
      <CardHeader>
        <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div className="flex items-center space-x-2 min-w-0">
            <Receipt className="h-5 w-5 text-purple-600 flex-shrink-0" />
            <CardTitle className="truncate">Invoice Settings</CardTitle>
          </div>
          <div className="flex gap-2 self-start sm:self-center">
            <Button
              onClick={handlePreview}
              size="sm"
              variant="outline"
              disabled={previewing}
            >
              <Eye className="h-4 w-4 mr-2" />
              {previewing ? 'Rendering…' : 'Preview PDF'}
            </Button>
            {!editing && (
              <Button
                onClick={() => setEditing(true)}
                size="sm"
                variant="ghost"
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
          </div>
        </div>
        <CardDescription>
          Branding and tax info that appear on every invoice PDF.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="invoice-tax-id">Tax ID / VAT</Label>
            <Input
              id="invoice-tax-id"
              value={form.tax_id}
              onChange={(e) => handleField('tax_id', e.target.value)}
              readOnly={!editing}
              className={!editing ? 'bg-gray-50 dark:bg-gray-800' : ''}
              placeholder="optional"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invoice-tax-rate">Tax rate (%)</Label>
            <Input
              id="invoice-tax-rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={form.tax_rate}
              onChange={(e) => handleField('tax_rate', e.target.value)}
              readOnly={!editing}
              className={!editing ? 'bg-gray-50 dark:bg-gray-800' : ''}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="invoice-currency">Currency</Label>
            {editing ? (
              <Select
                value={form.currency}
                onValueChange={(v) => handleField('currency', v)}
              >
                <SelectTrigger id="invoice-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={
                  CURRENCIES.find((c) => c.value === form.currency)?.label ??
                  form.currency
                }
                readOnly
                className="bg-gray-50 dark:bg-gray-800"
              />
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invoice-prefix">Invoice number prefix</Label>
            <Input
              id="invoice-prefix"
              value={form.invoice_prefix}
              onChange={(e) => handleField('invoice_prefix', e.target.value)}
              readOnly={!editing}
              className={!editing ? 'bg-gray-50 dark:bg-gray-800' : ''}
              maxLength={10}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Next invoice number (preview)</Label>
          <Input
            value={nextInvoicePreview}
            readOnly
            className="bg-gray-50 dark:bg-gray-800 font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Sequential per organization. Voided invoices never reuse numbers.
          </p>
        </div>

        <div className="grid gap-2">
          <Label>Design template</Label>
          <p className="text-xs text-muted-foreground">
            Pick a look for your PDFs. Applied to every invoice issued after
            saving — existing invoices keep the template they were issued with.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {INVOICE_THEME_LIST.map((theme) => {
              const active = form.invoice_template === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  disabled={!editing}
                  onClick={() => handleField('invoice_template', theme.id)}
                  className={[
                    'text-left rounded-lg border-2 p-2 transition-colors',
                    active
                      ? 'border-purple-600 ring-2 ring-purple-200'
                      : 'border-border hover:border-purple-300',
                    !editing ? 'opacity-75 cursor-not-allowed' : 'cursor-pointer',
                  ].join(' ')}
                >
                  <div
                    className="h-12 rounded-md mb-2 relative overflow-hidden flex items-center justify-end px-2"
                    style={{ backgroundColor: theme.swatch.bg }}
                  >
                    <div
                      className="absolute inset-y-0 left-0 w-1"
                      style={{ backgroundColor: theme.swatch.accent }}
                    />
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: theme.swatch.ink }}
                    >
                      Sample
                    </span>
                  </div>
                  <div className="text-sm font-medium">{theme.label}</div>
                  <div className="text-[11px] text-muted-foreground leading-tight">
                    {theme.tagline}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="invoice-terms">Payment terms</Label>
          <Textarea
            id="invoice-terms"
            value={form.invoice_payment_terms}
            onChange={(e) => handleField('invoice_payment_terms', e.target.value)}
            readOnly={!editing}
            className={!editing ? 'bg-gray-50 dark:bg-gray-800' : ''}
            rows={2}
            placeholder="e.g. Net 30 — due within 30 days of issue"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="invoice-notes">Footer notes</Label>
          <Textarea
            id="invoice-notes"
            value={form.invoice_notes}
            onChange={(e) => handleField('invoice_notes', e.target.value)}
            readOnly={!editing}
            className={!editing ? 'bg-gray-50 dark:bg-gray-800' : ''}
            rows={2}
            placeholder="e.g. Thank you for your business!"
          />
        </div>

        {editing && (
          <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full sm:flex-1"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
            <Button
              onClick={handleCancel}
              variant="outline"
              disabled={saving}
              className="w-full sm:flex-1"
            >
              Cancel
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={!!previewUrl} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Invoice preview
            </DialogTitle>
            <DialogDescription>
              Sample invoice rendered with your current settings and sample data.
              Actual client invoices use real client + purchase info.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-muted/30 border-t">
            {previewUrl && (
              <iframe
                src={previewUrl}
                title="Invoice preview"
                className="w-full h-full"
                style={{ border: 'none' }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
