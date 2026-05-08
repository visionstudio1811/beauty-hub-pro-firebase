import React, { useEffect, useMemo, useState } from 'react';
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
import { Plus, Trash2, Receipt } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useClients } from '@/hooks/useClients';
import { buildInvoicePdf } from '@/lib/invoicePdf';
import type { Invoice } from '@/types/firestore';

type LineKind = 'product' | 'treatment';

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
  onCreated?: (invoiceId: string) => void;
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
  onCreated,
}) => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { clients } = useClients();

  const [clientId, setClientId] = useState<string>('');
  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [treatments, setTreatments] = useState<CatalogItem[]>([]);
  const [rows, setRows] = useState<LineRow[]>([newRow()]);
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(
    () => `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );

  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen, initialClientId, initialProduct]);

  useEffect(() => {
    if (!isOpen || !currentOrganization?.id) return;
    (async () => {
      try {
        const orgId = currentOrganization.id;
        const [productSnap, treatmentSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'organizations', orgId, 'products'),
            where('is_active', '==', true),
            orderBy('name'),
          )),
          getDocs(query(
            collection(db, 'organizations', orgId, 'treatments'),
            where('is_active', '==', true),
            orderBy('name'),
          )),
        ]);

        setProducts(
          productSnap.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              name: data.name || '',
              price: Number(data.price || 0),
              brand: data.brand || undefined,
              category: data.category || undefined,
            } as CatalogItem;
          }),
        );

        setTreatments(
          treatmentSnap.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              name: data.name || '',
              price: Number(data.price || 0),
              category: data.category || undefined,
              duration: Number(data.duration || 0) || undefined,
            } as CatalogItem;
          }),
        );
      } catch (err) {
        console.error('Failed to load catalog', err);
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

  const updateRow = (uid: string, patch: Partial<LineRow>) => {
    setRows(prev => prev.map(r => (r.uid === uid ? { ...r, ...patch } : r)));
  };

  const handleKindChange = (uid: string, kind: LineKind) => {
    // Reset item + price when switching catalog so we don't carry a product id
    // into a treatment dropdown.
    updateRow(uid, { kind, item_id: '', unit_price: 0 });
  };

  const handleItemChange = (uid: string, itemId: string) => {
    const row = rows.find(r => r.uid === uid);
    const map = row?.kind === 'treatment' ? treatmentMap : productMap;
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

  const handleSubmit = async () => {
    if (!currentOrganization?.id) return;
    if (!clientId) {
      toast({ title: 'Select a client', description: 'Pick a client to bill.', variant: 'destructive' });
      return;
    }
    const validRows = rows.filter(r => r.item_id && r.quantity > 0 && r.unit_price >= 0);
    if (validRows.length === 0) {
      toast({ title: 'Add at least one line', description: 'Pick a product or facial.', variant: 'destructive' });
      return;
    }

    const productItems = validRows
      .filter(r => r.kind === 'product')
      .map(r => ({ product_id: r.item_id, quantity: r.quantity, unit_price: r.unit_price }));

    const treatmentItems = validRows
      .filter(r => r.kind === 'treatment')
      .map(r => ({ treatment_id: r.item_id, quantity: r.quantity, unit_price: r.unit_price }));

    setSubmitting(true);
    try {
      const call = httpsCallable<
        {
          organizationId: string;
          clientId: string;
          product_items: { product_id: string; quantity: number; unit_price: number }[];
          treatment_items: { treatment_id: string; quantity: number; unit_price: number }[];
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
        payment_method: paymentMethod || undefined,
        notes: notes.trim() || undefined,
        idempotency_key: idempotencyKey,
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

      onCreated?.(invoice.id);
      onClose();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to generate invoice';
      const message = errMsg.includes('Daily generateInvoice limit')
        ? 'Daily invoice limit reached for this organization.'
        : errMsg;
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const activeClients = useMemo(
    () => clients.filter(c => !c.deleted_at).sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            New Invoice
          </DialogTitle>
          <DialogDescription>
            Create an invoice for retail products, facials, or any combination — outside of a package.
          </DialogDescription>
        </DialogHeader>

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
              {rows.map(row => {
                const catalog = row.kind === 'treatment' ? treatments : products;
                return (
                  <div key={row.uid} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 md:col-span-2">
                      <Select value={row.kind} onValueChange={(v) => handleKindChange(row.uid, v as LineKind)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="product">Product</SelectItem>
                          <SelectItem value="treatment">Facial</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <Select value={row.item_id} onValueChange={v => handleItemChange(row.uid, v)}>
                        <SelectTrigger>
                          <SelectValue placeholder={row.kind === 'treatment' ? 'Choose a facial' : 'Choose a product'} />
                        </SelectTrigger>
                        <SelectContent>
                          {catalog.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-muted-foreground">
                              No active {row.kind === 'treatment' ? 'facials' : 'products'} found
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

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            <Receipt className="h-4 w-4 mr-1" />
            {submitting ? 'Generating…' : 'Generate Invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
