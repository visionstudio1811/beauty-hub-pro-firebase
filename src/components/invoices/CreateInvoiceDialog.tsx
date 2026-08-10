import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Receipt, ArrowLeft, FileText, Save, Folder, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useClients } from '@/hooks/useClients';
import { buildInvoicePdf } from '@/lib/invoicePdf';
import type { Invoice, InvoiceDraftLine, InvoiceLineItem } from '@/types/firestore';
import { useInvoiceDrafts } from '@/hooks/useInvoiceDrafts';

type LineKind = 'product' | 'treatment' | 'addon';

interface CatalogItem {
  id: string;
  name: string;
  price: number;
  // Kept optional so we can show a hint in the dropdown.
  brand?: string;
  category?: string;
  duration?: number;
}

interface LineRow {
  uid: string;
  kind: LineKind;
  item_id: string;
  quantity: number;
  unit_price: number;
}

interface CreateInvoiceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialClientId?: string;
  // If provided, prefills a product line from an existing assignment row.
  initialProduct?: {
    product_id: string;
    quantity: number;
    unit_price: number;
  };
  // If provided, the dialog opens in edit mode prefilled from the named draft.
  initialDraftId?: string;
  onCreated?: (invoiceId: string) => void;
}

type DialogMode = 'edit' | 'preview' | 'issuing';

interface BusinessInfoSnapshot {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
  tax_id: string;
  payment_terms: string;
  notes: string;
  timezone: string;
  invoice_template?: string;
  tax_rate: number;
  currency: string;
}

const PAYMENT_METHODS = [
  'Zelle', 'Cherry', 'Affirm', 'Cash', 'Credit Card', 'Check', 'Venmo', 'Other',
];

let lineCounter = 0;
const newRow = (defaults: Partial<LineRow> = {}): LineRow => ({
  uid: `row-${++lineCounter}`,
  kind: 'product',
  item_id: '',
  quantity: 1,
  unit_price: 0,
  ...defaults,
});

export const CreateInvoiceDialog: React.FC<CreateInvoiceDialogProps> = ({
  isOpen,
  onClose,
  initialClientId,
  initialProduct,
  initialDraftId,
  onCreated,
}) => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { clients } = useClients();
  const { drafts, saveDraft, loadDraft, deleteDraft } = useInvoiceDrafts(initialClientId ?? null);

  const [mode, setMode] = useState<DialogMode>('edit');
  const [clientId, setClientId] = useState<string>('');
  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [treatments, setTreatments] = useState<CatalogItem[]>([]);
  const [addons, setAddons] = useState<CatalogItem[]>([]);
  const [rows, setRows] = useState<LineRow[]>([newRow()]);
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [showDrafts, setShowDrafts] = useState(false);
  const [businessInfo, setBusinessInfo] = useState<BusinessInfoSnapshot | null>(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [building, setBuilding] = useState(false);
  // Idempotency key for the createInvoice call. Kept in a ref (not state) and
  // regenerated at the START of each issue attempt so a second, distinct issue
  // never reuses the first invoice's number/PDF. A retry of the *same* failed
  // attempt reuses the same key because we only regenerate on a fresh Issue click.
  const idempotencyKeyRef = useRef<string>(
    `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMode('edit');
    setShowDrafts(false);
    setPreviewInvoice(null);
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPreviewPdfUrl(null);

    // If we were handed a draft to continue, load it. Otherwise reset.
    if (initialDraftId) {
      setCurrentDraftId(initialDraftId);
      (async () => {
        const d = await loadDraft(initialDraftId);
        if (!d) {
          toast({ title: 'Draft not found', description: 'It may have been deleted.', variant: 'destructive' });
          setCurrentDraftId(null);
          return;
        }
        setClientId(d.client_id ?? initialClientId ?? '');
        setPaymentMethod(d.payment_method ?? '');
        setNotes(d.notes ?? '');
        setRows(
          d.lines.length > 0
            ? d.lines.map(l => newRow({ kind: l.kind, item_id: l.item_id, quantity: l.quantity, unit_price: l.unit_price }))
            : [newRow()],
        );
      })();
      return;
    }

    setCurrentDraftId(null);
    setClientId(initialClientId ?? '');
    setPaymentMethod('');
    setNotes('');
    if (initialProduct) {
      setRows([newRow({
        kind: 'product',
        item_id: initialProduct.product_id,
        quantity: initialProduct.quantity,
        unit_price: initialProduct.unit_price,
      })]);
    } else {
      setRows([newRow()]);
    }
    // loadDraft is stable via useCallback; safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialClientId, initialProduct, initialDraftId]);

  // Load businessInfo once when the dialog opens — used for client-side
  // preview totals + business_snapshot. Server is still the source of truth.
  useEffect(() => {
    if (!isOpen || !currentOrganization?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(
          doc(db, 'organizations', currentOrganization.id, 'config', 'businessInfo'),
        );
        if (cancelled) return;
        const data: Record<string, unknown> = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
        setBusinessInfo({
          name: String(data.name ?? currentOrganization.name ?? 'Business'),
          address: String(data.address ?? ''),
          phone: String(data.phone ?? ''),
          email: String(data.email ?? ''),
          website: String(data.website ?? ''),
          logo_url: String(data.logo_url ?? ''),
          tax_id: String(data.tax_id ?? ''),
          payment_terms: String(data.payment_terms ?? ''),
          notes: String(data.notes ?? ''),
          timezone: String(data.timezone ?? 'UTC'),
          invoice_template: typeof data.invoice_template === 'string' ? data.invoice_template : undefined,
          tax_rate: Number(data.tax_rate ?? 0) || 0,
          currency: String(data.currency ?? 'USD'),
        });
      } catch (err) {
        console.error('Failed to load businessInfo for preview', err);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, currentOrganization?.id, currentOrganization?.name]);

  // Revoke any outstanding object URL when the dialog closes / unmounts.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !currentOrganization?.id) return;
    const orgId = currentOrganization.id;
    const sortByName = (a: CatalogItem, b: CatalogItem) =>
      a.name.localeCompare(b.name);

    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'organizations', orgId, 'products'),
          where('is_active', '==', true),
        ));
        setProducts(
          snap.docs
            .map(d => {
              const data = d.data();
              return {
                id: d.id,
                name: data.name || '',
                price: Number(data.price || 0),
                brand: data.brand || undefined,
                category: data.category || undefined,
              } as CatalogItem;
            })
            .sort(sortByName),
        );
      } catch (err) {
        console.error('Failed to load products', err);
        setProducts([]);
      }
    })();

    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'organizations', orgId, 'treatments'),
          where('is_active', '==', true),
        ));
        setTreatments(
          snap.docs
            .map(d => {
              const data = d.data();
              return {
                id: d.id,
                name: data.name || '',
                price: Number(data.price || 0),
                category: data.category || undefined,
                duration: Number(data.duration || 0) || undefined,
              } as CatalogItem;
            })
            .sort(sortByName),
        );
      } catch (err) {
        console.error('Failed to load treatments', err);
        setTreatments([]);
      }
    })();

    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'organizations', orgId, 'addons'),
          where('is_active', '==', true),
        ));
        setAddons(
          snap.docs
            .map(d => {
              const data = d.data();
              return {
                id: d.id,
                name: data.name || '',
                price: Number(data.price || 0),
                category: data.category || undefined,
                duration:
                  data.duration_minutes === null || data.duration_minutes === undefined
                    ? undefined
                    : Number(data.duration_minutes) || undefined,
              } as CatalogItem;
            })
            .sort(sortByName),
        );
      } catch (err) {
        console.error('Failed to load addons', err);
        setAddons([]);
      }
    })();
  }, [isOpen, currentOrganization?.id]);

  const productMap = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    products.forEach(p => map.set(p.id, p));
    return map;
  }, [products]);

  const treatmentMap = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    treatments.forEach(t => map.set(t.id, t));
    return map;
  }, [treatments]);

  const addonMap = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    addons.forEach(a => map.set(a.id, a));
    return map;
  }, [addons]);

  const catalogForKind = (kind: LineKind): CatalogItem[] =>
    kind === 'treatment' ? treatments : kind === 'addon' ? addons : products;
  const mapForKind = (kind: LineKind) =>
    kind === 'treatment' ? treatmentMap : kind === 'addon' ? addonMap : productMap;

  const updateRow = (uid: string, patch: Partial<LineRow>) => {
    setRows(prev => prev.map(r => (r.uid === uid ? { ...r, ...patch } : r)));
  };

  const handleKindChange = (uid: string, kind: LineKind) => {
    // Reset item + price when switching catalog so we don't carry an id
    // into the wrong dropdown.
    updateRow(uid, { kind, item_id: '', unit_price: 0 });
  };

  const handleItemChange = (uid: string, itemId: string) => {
    const row = rows.find(r => r.uid === uid);
    const map = row ? mapForKind(row.kind) : productMap;
    const item = map.get(itemId);
    updateRow(uid, {
      item_id: itemId,
      // Prefill catalog price; user can still edit.
      unit_price: item ? item.price : 0,
    });
  };

  const addRow = (kind: LineKind = 'product') =>
    setRows(prev => [...prev, newRow({ kind })]);

  const removeRow = (uid: string) =>
    setRows(prev => (prev.length > 1 ? prev.filter(r => r.uid !== uid) : prev));

  const subtotalCents = rows.reduce((sum, r) => {
    const cents = Math.round((r.unit_price || 0) * 100) * (r.quantity || 0);
    return sum + cents;
  }, 0);

  const validateForSubmit = (): boolean => {
    if (!clientId) {
      toast({ title: 'Select a client', description: 'Pick a client to bill.', variant: 'destructive' });
      return false;
    }
    const validRows = rows.filter(r => r.item_id && r.quantity > 0 && r.unit_price >= 0);
    if (validRows.length === 0) {
      toast({ title: 'Add at least one line', description: 'Pick a product or facial.', variant: 'destructive' });
      return false;
    }
    return true;
  };

  // Build a synthetic Invoice for client-side preview. Server is still the
  // source of truth at issue time — tax_rate or item prices may shift.
  const buildPreviewInvoice = (): Invoice | null => {
    if (!currentOrganization?.id || !businessInfo) return null;
    const client = clients.find(c => c.id === clientId);
    if (!client) return null;

    const validRows = rows.filter(r => r.item_id && r.quantity > 0 && r.unit_price >= 0);

    const lineItems: InvoiceLineItem[] = validRows.map(r => {
      const item = mapForKind(r.kind).get(r.item_id);
      const unitCents = Math.round(r.unit_price * 100);
      const subCents = unitCents * r.quantity;
      return {
        type: r.kind,
        name: item?.name ?? 'Item',
        description: '',
        package_id: null,
        product_id: r.kind === 'product' ? r.item_id : null,
        treatment_id: r.kind === 'treatment' ? r.item_id : null,
        addon_id: r.kind === 'addon' ? r.item_id : null,
        quantity: r.quantity,
        unit_price_cents: unitCents,
        subtotal_cents: subCents,
      };
    });

    const subtotalC = lineItems.reduce((s, li) => s + li.subtotal_cents, 0);
    // tax_rate is stored as a percent (InvoiceSettingsEditor labels it "Tax rate (%)",
    // max 100). Divide by 100 to match createInvoice's server-side math — otherwise
    // the preview total is inflated 100x for any org with a non-zero tax rate.
    const taxC = Math.round((subtotalC * businessInfo.tax_rate) / 100);
    const totalC = subtotalC + taxC;

    return {
      id: 'preview',
      invoice_number: 'PREVIEW',
      invoice_number_int: 0,
      issued_at: { toDate: () => new Date() } as unknown as Invoice['issued_at'],
      purchase_id: null,
      client_id: client.id,
      client_snapshot: {
        name: client.name || '',
        email: client.email || '',
        phone: client.phone || '',
        address: client.address || '',
      },
      business_snapshot: {
        name: businessInfo.name,
        address: businessInfo.address,
        phone: businessInfo.phone,
        email: businessInfo.email,
        website: businessInfo.website,
        logo_url: businessInfo.logo_url,
        tax_id: businessInfo.tax_id,
        payment_terms: businessInfo.payment_terms,
        notes: businessInfo.notes,
        timezone: businessInfo.timezone,
        invoice_template: businessInfo.invoice_template,
      },
      line_items: lineItems,
      subtotal_cents: subtotalC,
      tax_rate: businessInfo.tax_rate,
      tax_amount_cents: taxC,
      total_cents: totalC,
      currency: businessInfo.currency,
      pdf_url: null,
      pdf_storage_path: null,
      status: 'issued',
      payment_method: paymentMethod || undefined,
      created_at: { toDate: () => new Date() } as unknown as Invoice['created_at'],
      created_by: 'preview',
    };
  };

  const handlePreview = async () => {
    if (!validateForSubmit()) return;
    if (!businessInfo) {
      toast({ title: 'Loading…', description: 'Business info still loading. Try again in a second.', variant: 'destructive' });
      return;
    }
    const synthetic = buildPreviewInvoice();
    if (!synthetic) {
      toast({ title: 'Cannot preview', description: 'Missing client or business info.', variant: 'destructive' });
      return;
    }
    setBuilding(true);
    try {
      const blob = await buildInvoicePdf(synthetic);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setPreviewPdfUrl(url);
      setPreviewInvoice(synthetic);
      setMode('preview');
    } catch (err) {
      console.error('Failed to build preview', err);
      toast({ title: 'Preview failed', description: 'Could not render preview.', variant: 'destructive' });
    } finally {
      setBuilding(false);
    }
  };

  const backToEdit = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPreviewPdfUrl(null);
    setPreviewInvoice(null);
    setMode('edit');
  };

  const rowsToDraftLines = (): InvoiceDraftLine[] =>
    rows
      .filter(r => r.item_id)
      .map(r => {
        const item = mapForKind(r.kind).get(r.item_id);
        return {
          kind: r.kind,
          item_id: r.item_id,
          quantity: r.quantity,
          unit_price: r.unit_price,
          name: item?.name,
        };
      });

  const handleSaveDraft = async () => {
    if (savingDraft) return;
    if (!clientId && (rows.length === 0 || !rows.some(r => r.item_id))) {
      toast({ title: 'Nothing to save', description: 'Pick a client or add at least one line item.', variant: 'destructive' });
      return;
    }
    setSavingDraft(true);
    try {
      const id = await saveDraft(
        {
          client_id: clientId || null,
          lines: rowsToDraftLines(),
          payment_method: paymentMethod || undefined,
          notes: notes.trim() || undefined,
        },
        currentDraftId ?? undefined,
      );
      setCurrentDraftId(id);
      toast({ title: 'Draft saved', description: 'You can finish it later from Drafts.' });
    } catch (err) {
      console.error('Save draft failed', err);
      toast({ title: 'Error', description: 'Failed to save draft.', variant: 'destructive' });
    } finally {
      setSavingDraft(false);
    }
  };

  const handleIssue = async () => {
    if (!currentOrganization?.id) return;
    if (!validateForSubmit()) return;
    const validRows = rows.filter(r => r.item_id && r.quantity > 0 && r.unit_price >= 0);

    const productItems = validRows
      .filter(r => r.kind === 'product')
      .map(r => ({ product_id: r.item_id, quantity: r.quantity, unit_price: r.unit_price }));

    const treatmentItems = validRows
      .filter(r => r.kind === 'treatment')
      .map(r => ({ treatment_id: r.item_id, quantity: r.quantity, unit_price: r.unit_price }));

    const addonItems = validRows
      .filter(r => r.kind === 'addon')
      .map(r => ({ addon_id: r.item_id, quantity: r.quantity, unit_price: r.unit_price }));

    // Fresh key for each distinct issue attempt so re-issuing (e.g. after a
    // successful issue or a new set of line items) never collides with a
    // previously issued invoice's number/PDF via the server idempotency check.
    idempotencyKeyRef.current = `inv-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setSubmitting(true);
    setMode('issuing');
    try {
      const call = httpsCallable<
        {
          organizationId: string;
          clientId: string;
          product_items: { product_id: string; quantity: number; unit_price: number }[];
          treatment_items: { treatment_id: string; quantity: number; unit_price: number }[];
          addon_items: { addon_id: string; quantity: number; unit_price: number }[];
          payment_method?: string;
          notes?: string;
          idempotency_key: string;
        },
        { invoice: Invoice & { id: string }; reused: boolean }
      >(functions, 'createInvoice');

      const res = await call({
        organizationId: currentOrganization.id,
        clientId,
        product_items: productItems,
        treatment_items: treatmentItems,
        addon_items: addonItems,
        payment_method: paymentMethod || undefined,
        notes: notes.trim() || undefined,
        idempotency_key: idempotencyKeyRef.current,
      });

      const invoice = res.data.invoice;

      if (res.data.reused && invoice.pdf_url) {
        window.open(invoice.pdf_url, '_blank');
        toast({ title: 'Invoice', description: `Opened ${invoice.invoice_number}.` });
      } else {
        const blob = await buildInvoicePdf(invoice);
        const pdfBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const comma = result.indexOf(',');
            resolve(comma >= 0 ? result.slice(comma + 1) : result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        const upload = httpsCallable<
          { organizationId: string; invoiceId: string; pdfBase64: string },
          { url: string; path: string; reused: boolean }
        >(functions, 'uploadInvoicePdf');
        const uploadRes = await upload({
          organizationId: currentOrganization.id,
          invoiceId: invoice.id,
          pdfBase64,
        });
        window.open(uploadRes.data.url, '_blank');
        toast({ title: 'Invoice generated', description: `${invoice.invoice_number} is ready.` });
      }

      // If we issued from a draft, clean it up. Don't block success on failure.
      if (currentDraftId) {
        try { await deleteDraft(currentDraftId); } catch (e) { console.warn('Failed to delete draft after issue', e); }
        setCurrentDraftId(null);
      }

      onCreated?.(invoice.id);
      onClose();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to generate invoice';
      const message = errMsg.includes('Daily generateInvoice limit')
        ? 'Daily invoice limit reached for this organization.'
        : errMsg;
      toast({ title: 'Error', description: message, variant: 'destructive' });
      setMode('preview');
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinueDraft = async (draftId: string) => {
    const d = await loadDraft(draftId);
    if (!d) {
      toast({ title: 'Draft not found', description: 'It may have been deleted.', variant: 'destructive' });
      return;
    }
    setCurrentDraftId(draftId);
    setClientId(d.client_id ?? '');
    setPaymentMethod(d.payment_method ?? '');
    setNotes(d.notes ?? '');
    setRows(
      d.lines.length > 0
        ? d.lines.map(l => newRow({ kind: l.kind, item_id: l.item_id, quantity: l.quantity, unit_price: l.unit_price }))
        : [newRow()],
    );
    setShowDrafts(false);
  };

  const handleDeleteDraft = async (draftId: string) => {
    try {
      await deleteDraft(draftId);
      if (currentDraftId === draftId) setCurrentDraftId(null);
      toast({ title: 'Draft deleted' });
    } catch (err) {
      console.error('Delete draft failed', err);
      toast({ title: 'Error', description: 'Failed to delete draft.', variant: 'destructive' });
    }
  };

  const activeClients = useMemo(
    () => clients.filter(c => !c.deleted_at).sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );

  const formatMoney = (cents: number) =>
    `${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={mode === 'preview' ? 'max-w-5xl max-h-[90vh] overflow-y-auto' : 'max-w-3xl max-h-[90vh] overflow-y-auto'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'preview' ? <FileText className="h-5 w-5" /> : <Receipt className="h-5 w-5" />}
            {mode === 'preview' ? 'Invoice Preview' : 'New Invoice'}
            {currentDraftId && mode === 'edit' && (
              <Badge variant="outline" className="ml-1 text-xs">Editing draft</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {mode === 'preview'
              ? 'Preview the invoice before issuing. Numbers and totals will be finalized by the server when you click Issue.'
              : 'Create an invoice for retail products, facials, or any combination — outside of a package.'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'edit' && showDrafts && (
          <div className="border rounded-md p-3 bg-muted/30 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Folder className="h-4 w-4" />
                Drafts ({drafts.length})
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowDrafts(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {drafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved drafts.</p>
            ) : (
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {drafts.map(d => {
                  const client = clients.find(c => c.id === d.client_id);
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-2 text-sm border rounded p-2 bg-background">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{client?.name ?? 'No client'}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {d.lines.length} line{d.lines.length === 1 ? '' : 's'}
                          {d.notes ? ` • ${d.notes}` : ''}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button type="button" size="sm" variant="outline" onClick={() => handleContinueDraft(d.id)}>
                          Continue
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteDraft(d.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {mode === 'preview' && previewInvoice ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Bill to</div>
                <div className="font-medium">{previewInvoice.client_snapshot.name}</div>
                <div className="text-sm text-muted-foreground">
                  {[previewInvoice.client_snapshot.email, previewInvoice.client_snapshot.phone]
                    .filter(Boolean)
                    .join(' • ')}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground mb-1">Line items</div>
                <div className="border rounded-md divide-y">
                  {previewInvoice.line_items.map((li, i) => (
                    <div key={i} className="p-2 flex justify-between items-center text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{li.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {li.quantity} × {formatMoney(li.unit_price_cents)} {previewInvoice.currency}
                        </div>
                      </div>
                      <div className="font-medium tabular-nums">
                        {formatMoney(li.subtotal_cents)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border rounded-md p-3 space-y-1 bg-muted/30">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatMoney(previewInvoice.subtotal_cents)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Tax ({previewInvoice.tax_rate.toFixed(2)}%)</span>
                  <span className="tabular-nums">{formatMoney(previewInvoice.tax_amount_cents)}</span>
                </div>
                <div className="flex justify-between font-semibold text-base pt-1 border-t">
                  <span>Total</span>
                  <span className="tabular-nums">
                    {formatMoney(previewInvoice.total_cents)} {previewInvoice.currency}
                  </span>
                </div>
              </div>
              {previewInvoice.payment_method && (
                <div className="text-sm text-muted-foreground">
                  Payment method: <span className="text-foreground">{previewInvoice.payment_method}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                The invoice number and exact totals are finalized server-side when you click Issue.
              </p>
            </div>
            <div className="min-h-[400px] border rounded-md overflow-hidden bg-muted/20">
              {previewPdfUrl ? (
                <iframe
                  title="Invoice preview"
                  src={previewPdfUrl}
                  className="w-full h-[60vh]"
                />
              ) : (
                <div className="h-[60vh] flex items-center justify-center text-sm text-muted-foreground">
                  Building PDF…
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Client *</label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {activeClients.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Line Items *</label>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => addRow('product')}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add product
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => addRow('treatment')}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add facial
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => addRow('addon')}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add add-on
                </Button>
              </div>
            </div>

            <div className="hidden md:grid grid-cols-12 gap-2 mb-1 text-xs text-muted-foreground">
              <div className="col-span-2">Type</div>
              <div className="col-span-4">Item</div>
              <div className="col-span-2">Qty</div>
              <div className="col-span-3">Unit price ($)</div>
              <div className="col-span-1" />
            </div>

            <div className="space-y-2">
              {rows.map((row, rowIndex) => {
                const catalog = catalogForKind(row.kind);
                const kindLabel = row.kind === 'treatment' ? 'facials' : row.kind === 'addon' ? 'add-ons' : 'products';
                const placeholder = row.kind === 'treatment' ? 'Choose a facial' : row.kind === 'addon' ? 'Choose an add-on' : 'Choose a product';
                // Human-readable handle for this row's a11y labels — the chosen
                // item name when set, otherwise a 1-based row number.
                const rowItemName = mapForKind(row.kind).get(row.item_id)?.name ?? `line ${rowIndex + 1}`;
                return (
                  <div key={row.uid} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 md:col-span-2">
                      <Select value={row.kind} onValueChange={(v) => handleKindChange(row.uid, v as LineKind)}>
                        <SelectTrigger aria-label={`Line type for ${rowItemName}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="product">Product</SelectItem>
                          <SelectItem value="treatment">Facial</SelectItem>
                          <SelectItem value="addon">Add-on</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <Select value={row.item_id} onValueChange={v => handleItemChange(row.uid, v)}>
                        <SelectTrigger aria-label={`Item for ${rowItemName}`}>
                          <SelectValue placeholder={placeholder} />
                        </SelectTrigger>
                        <SelectContent>
                          {catalog.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-muted-foreground">
                              No active {kindLabel} found
                            </div>
                          ) : (
                            catalog.map(item => (
                              <SelectItem key={item.id} value={item.id}>
                                <div className="flex flex-col">
                                  <span>{item.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    ${item.price.toFixed(2)}
                                    {item.brand ? ` · ${item.brand}` : ''}
                                    {item.duration ? ` · ${item.duration} min` : ''}
                                  </span>
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <Input
                        type="number"
                        min="1"
                        value={row.quantity}
                        onChange={e => updateRow(row.uid, { quantity: parseInt(e.target.value) || 1 })}
                        placeholder="Qty"
                        aria-label={`Quantity for ${rowItemName}`}
                      />
                    </div>
                    <div className="col-span-6 md:col-span-3">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.unit_price}
                        onChange={e => updateRow(row.uid, { unit_price: parseFloat(e.target.value) || 0 })}
                        placeholder="Price"
                        aria-label={`Unit price for ${rowItemName}`}
                      />
                    </div>
                    <div className="col-span-2 md:col-span-1 flex justify-end">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeRow(row.uid)}
                        disabled={rows.length <= 1}
                        className="text-destructive hover:text-destructive"
                        aria-label={`Remove ${rowItemName}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Payment method</label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <div className="text-right ml-auto">
                <div className="text-xs text-muted-foreground">Subtotal</div>
                <div className="text-2xl font-bold">${(subtotalCents / 100).toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">Tax is calculated on the server.</div>
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Notes (optional)</label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Internal notes about this invoice"
              rows={2}
            />
          </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {mode === 'preview' ? (
            <>
              <Button type="button" variant="outline" onClick={backToEdit} disabled={submitting}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Edit
              </Button>
              <Button type="button" variant="outline" onClick={handleSaveDraft} disabled={savingDraft || submitting}>
                <Save className="h-4 w-4 mr-1" />
                {savingDraft ? 'Saving…' : currentDraftId ? 'Update Draft' : 'Save as Draft'}
              </Button>
              <Button onClick={handleIssue} disabled={submitting}>
                <Receipt className="h-4 w-4 mr-1" />
                {submitting ? 'Issuing…' : 'Issue Invoice'}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => setShowDrafts(s => !s)} disabled={submitting || savingDraft}>
                <Folder className="h-4 w-4 mr-1" />
                Drafts ({drafts.length})
              </Button>
              <div className="flex-1" />
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="button" variant="outline" onClick={handleSaveDraft} disabled={savingDraft || submitting}>
                <Save className="h-4 w-4 mr-1" />
                {savingDraft ? 'Saving…' : currentDraftId ? 'Update Draft' : 'Save as Draft'}
              </Button>
              <Button onClick={handlePreview} disabled={building || submitting}>
                <FileText className="h-4 w-4 mr-1" />
                {building ? 'Building…' : 'Preview'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
