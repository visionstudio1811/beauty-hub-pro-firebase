import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Package, Calendar, Clock, Save, Trash2, Plus, Sparkles, ShoppingBag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Client } from '@/hooks/useClients';
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  where,
  getDoc,
  serverTimestamp,
  deleteField,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { ClientPackage } from '@/hooks/useClientPackages';
import { syncMembershipStatus, logMembershipEvent } from '@/hooks/useMembershipSync';
import { useSupabaseTreatments } from '@/hooks/useSupabaseTreatments';

interface PurchaseManagementModalProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

interface SessionSlot {
  treatment_id: string;
  total: number;
  remaining: number;
}

interface ProductSnapshot {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
}

interface EditableClientPackage extends ClientPackage {
  description_override?: string | null;
  is_custom?: boolean;
  template_description?: string;
  total_amount?: number;
}

interface EditState {
  description: string;
  aggregateSessions: number;
  expiry: string;
  slots: SessionSlot[];
  products: ProductSnapshot[];
}

interface ProductOption {
  id: string;
  name: string;
  price: number;
}

export const PurchaseManagementModal: React.FC<PurchaseManagementModalProps> = ({
  client,
  isOpen,
  onClose,
  onUpdate,
}) => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { treatments: treatmentsList } = useSupabaseTreatments();
  const [packages, setPackages] = useState<EditableClientPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingPackage, setEditingPackage] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, EditState>>({});
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);

  const fetchClientPackages = useCallback(async () => {
    if (!client || !currentOrganization?.id) return;

    setLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'purchases'),
          where('client_id', '==', client.id),
          where('payment_status', '==', 'active'),
        ),
      );

      const activeDocs = snap.docs.filter(d => !d.data().deleted_at);

      const transformed: EditableClientPackage[] = await Promise.all(
        activeDocs.map(async (d) => {
          const purchase = d.data();
          let pkgData: Record<string, unknown> = {};
          if (purchase.package_id) {
            const pkgSnap = await getDoc(doc(db, 'organizations', currentOrganization.id!, 'packages', purchase.package_id));
            if (pkgSnap.exists()) pkgData = pkgSnap.data() as Record<string, unknown>;
          }
          const overrideRaw = purchase.description_override;
          const description_override = typeof overrideRaw === 'string' ? overrideRaw : null;
          const templateDescription = typeof pkgData.description === 'string' ? (pkgData.description as string) : '';
          return {
            id: d.id,
            package_id: purchase.package_id || '',
            package_name: (pkgData.name as string) || '',
            package_description: description_override ?? templateDescription ?? '',
            template_description: templateDescription,
            description_override,
            sessions_remaining: purchase.sessions_remaining || 0,
            total_sessions: (pkgData.total_sessions as number) || 0,
            expiry_date: purchase.expiry_date || null,
            payment_status: purchase.payment_status || '',
            treatments: (pkgData.treatments as string[]) || [],
            sessions_by_treatment: Array.isArray(purchase.sessions_by_treatment)
              ? (purchase.sessions_by_treatment as SessionSlot[])
              : undefined,
            product_snapshot: Array.isArray(purchase.product_snapshot)
              ? (purchase.product_snapshot as ProductSnapshot[])
              : undefined,
            price: (pkgData.price as number) || 0,
            is_custom: Boolean(pkgData.is_custom),
            total_amount: Number(purchase.total_amount || 0),
          };
        }),
      );

      setPackages(transformed);

      const initial: Record<string, EditState> = {};
      transformed.forEach(pkg => {
        initial[pkg.id] = {
          description: pkg.description_override ?? pkg.template_description ?? '',
          aggregateSessions: pkg.sessions_remaining,
          expiry: pkg.expiry_date || '',
          slots: (pkg.sessions_by_treatment ?? []).map(s => ({ ...s })),
          products: (pkg.product_snapshot ?? []).map(p => ({ ...p })),
        };
      });
      setEditValues(initial);
    } catch (error) {
      console.error('Error fetching client packages:', error);
      toast({
        title: 'Error',
        description: 'Failed to load client packages',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [client, currentOrganization?.id, toast]);

  useEffect(() => {
    if (isOpen && client) {
      fetchClientPackages();
    }
  }, [isOpen, client, fetchClientPackages]);

  // Load product options for the "Add product" picker. Cheap re-fetch each open.
  useEffect(() => {
    if (!isOpen || !currentOrganization?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'organizations', currentOrganization.id, 'products'),
            where('is_active', '==', true),
          ),
        );
        if (cancelled) return;
        const opts: ProductOption[] = snap.docs
          .map(d => {
            const data = d.data();
            return {
              id: d.id,
              name: (data.name as string) || '',
              price: Number(data.price ?? 0),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        setProductOptions(opts);
      } catch (err) {
        console.error('Failed to load products', err);
        setProductOptions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, currentOrganization?.id]);

  const updateEditState = (pkgId: string, patch: Partial<EditState>) =>
    setEditValues(prev => ({
      ...prev,
      [pkgId]: { ...prev[pkgId], ...patch },
    }));

  const beginEdit = (pkg: EditableClientPackage) => {
    // Reset to current persisted values before opening edit mode.
    setEditValues(prev => ({
      ...prev,
      [pkg.id]: {
        description: pkg.description_override ?? pkg.template_description ?? '',
        aggregateSessions: pkg.sessions_remaining,
        expiry: pkg.expiry_date || '',
        slots: (pkg.sessions_by_treatment ?? []).map(s => ({ ...s })),
        products: (pkg.product_snapshot ?? []).map(p => ({ ...p })),
      },
    }));
    setEditingPackage(pkg.id);
  };

  const cancelEdit = () => {
    setEditingPackage(null);
  };

  const addSlot = (pkgId: string) => {
    updateEditState(pkgId, {
      slots: [...(editValues[pkgId]?.slots ?? []), { treatment_id: '', total: 1, remaining: 1 }],
    });
  };

  const updateSlot = (pkgId: string, idx: number, patch: Partial<SessionSlot>) => {
    const slots = [...(editValues[pkgId]?.slots ?? [])];
    slots[idx] = { ...slots[idx], ...patch };
    updateEditState(pkgId, { slots });
  };

  const removeSlot = (pkgId: string, idx: number) => {
    const slots = (editValues[pkgId]?.slots ?? []).filter((_, i) => i !== idx);
    updateEditState(pkgId, { slots });
  };

  const addProduct = (pkgId: string, productId: string) => {
    const product = productOptions.find(p => p.id === productId);
    if (!product) return;
    const products = [
      ...(editValues[pkgId]?.products ?? []),
      { product_id: product.id, product_name: product.name, quantity: 1, price: product.price },
    ];
    updateEditState(pkgId, { products });
  };

  const updateProduct = (pkgId: string, idx: number, patch: Partial<ProductSnapshot>) => {
    const products = [...(editValues[pkgId]?.products ?? [])];
    products[idx] = { ...products[idx], ...patch };
    updateEditState(pkgId, { products });
  };

  const removeProduct = (pkgId: string, idx: number) => {
    const products = (editValues[pkgId]?.products ?? []).filter((_, i) => i !== idx);
    updateEditState(pkgId, { products });
  };

  const handleUpdatePackage = async (packageId: string) => {
    if (!currentOrganization?.id || !client) return;
    const edit = editValues[packageId];
    if (!edit) return;

    try {
      const slotsClean: SessionSlot[] = edit.slots
        .filter(s => s.treatment_id)
        .map(s => ({
          treatment_id: s.treatment_id,
          total: Math.max(0, Math.floor(s.total)),
          remaining: Math.floor(s.remaining),
        }));

      const productsClean: ProductSnapshot[] = edit.products
        .filter(p => p.product_id)
        .map(p => ({
          product_id: p.product_id,
          product_name: p.product_name,
          quantity: Math.max(0, Math.floor(p.quantity)),
          price: Number(p.price) || 0,
        }));

      // If per-treatment slots are present, derive aggregate sessions from the sum.
      const aggregate = slotsClean.length > 0
        ? slotsClean.reduce((sum, s) => sum + s.remaining, 0)
        : Math.max(0, Math.floor(edit.aggregateSessions));

      const updateData: Record<string, unknown> = {
        sessions_remaining: aggregate,
        description_override: edit.description.trim() || null,
        product_snapshot: productsClean,
        updated_at: serverTimestamp(),
      };
      if (slotsClean.length > 0) {
        updateData.sessions_by_treatment = slotsClean;
      } else {
        // All per-treatment slots were removed. Clear the persisted array so it
        // doesn't leave stale slots that desync from the aggregate
        // `sessions_remaining` we just computed from the manual field.
        updateData.sessions_by_treatment = deleteField();
      }
      if (edit.expiry) {
        updateData.expiry_date = edit.expiry;
      } else {
        updateData.expiry_date = null;
      }

      await updateDoc(doc(db, 'organizations', currentOrganization.id, 'purchases', packageId), updateData);

      await syncMembershipStatus(currentOrganization.id, client.id, 'sessions_edited');
      await logMembershipEvent(currentOrganization.id, client.id, 'sessions_edited', {
        purchaseId: packageId,
        newSessions: aggregate,
        newExpiry: edit.expiry || null,
      });

      toast({ title: 'Package Updated', description: 'Changes saved.' });
      setEditingPackage(null);
      await fetchClientPackages();
      onUpdate();
    } catch (error) {
      console.error('Error updating package:', error);
      toast({
        title: 'Error',
        description: 'Failed to update package',
        variant: 'destructive',
      });
    }
  };

  const handleDeletePackage = async (packageId: string, packageName: string) => {
    if (!confirm(`Are you sure you want to remove the ${packageName} package?`)) return;
    if (!currentOrganization?.id || !client) return;
    try {
      await updateDoc(doc(db, 'organizations', currentOrganization.id, 'purchases', packageId), {
        payment_status: 'cancelled',
        deleted_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      await syncMembershipStatus(currentOrganization.id, client.id, 'package_removed');
      await logMembershipEvent(currentOrganization.id, client.id, 'package_removed', {
        purchaseId: packageId,
        packageName,
      });

      toast({ title: 'Package Removed', description: `${packageName} has been removed from ${client.name}.` });
      fetchClientPackages();
      onUpdate();
    } catch (error) {
      console.error('Error deleting package:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove package',
        variant: 'destructive',
      });
    }
  };

  const formatExpiryDate = (dateString: string | null) => {
    if (!dateString) return 'No expiry';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const treatmentNameFor = (id: string) =>
    treatmentsList.find(t => t.id === id)?.name ?? 'Pick a treatment';

  if (!client) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Package className="h-5 w-5" />
            <span>Manage {client.name}'s Packages</span>
          </DialogTitle>
          <DialogDescription>
            Edit description, sessions, expiry, and included products. Changes apply to this client's purchase only — the catalog package stays untouched.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded animate-pulse"></div>
            ))}
          </div>
        ) : packages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No active packages for this client</p>
          </div>
        ) : (
          <div className="space-y-4">
            {packages.map((pkg) => {
              const isEditing = editingPackage === pkg.id;
              const edit = editValues[pkg.id];
              return (
                <Card key={pkg.id} className="relative">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-3 gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-semibold">{pkg.package_name || 'Package'}</h3>
                          {pkg.is_custom && (
                            <Badge variant="outline" className="border-purple-300 text-purple-700 bg-purple-50 text-xs">
                              <Sparkles className="h-3 w-3 mr-0.5" />
                              Custom
                            </Badge>
                          )}
                          <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50 text-xs">
                            Active
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <span>${pkg.total_amount ?? pkg.price ?? 0}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {!isEditing && (
                          <Button onClick={() => beginEdit(pkg)} variant="outline" size="sm">
                            Edit
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeletePackage(pkg.id, pkg.package_name)}
                          className="text-red-600 hover:text-red-700"
                          title="Remove package"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Description */}
                    <div className="mb-4">
                      <label className="text-sm font-medium text-gray-700 mb-1 block">
                        Description
                        {pkg.description_override && !isEditing && (
                          <span className="ml-2 text-xs text-purple-700">(per-client override)</span>
                        )}
                      </label>
                      {isEditing ? (
                        <Textarea
                          rows={2}
                          placeholder="Describe what's in this package…"
                          value={edit?.description ?? ''}
                          onChange={(e) => updateEditState(pkg.id, { description: e.target.value })}
                        />
                      ) : (
                        <p className="text-sm text-gray-600 whitespace-pre-wrap">
                          {pkg.description_override || pkg.template_description || (
                            <span className="text-muted-foreground italic">No description</span>
                          )}
                        </p>
                      )}
                    </div>

                    {/* Sessions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">
                          Sessions Remaining
                          {edit?.slots && edit.slots.length > 0 && isEditing && (
                            <span className="ml-2 text-xs text-muted-foreground">(auto = sum of slots)</span>
                          )}
                        </label>
                        {isEditing ? (
                          <Input
                            type="number"
                            min="0"
                            value={
                              edit?.slots && edit.slots.length > 0
                                ? edit.slots.reduce((s, x) => s + (Number(x.remaining) || 0), 0)
                                : edit?.aggregateSessions ?? 0
                            }
                            disabled={!!edit?.slots && edit.slots.length > 0}
                            onChange={(e) => updateEditState(pkg.id, { aggregateSessions: parseInt(e.target.value) || 0 })}
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-gray-400" />
                            <span>{pkg.sessions_remaining} remaining{pkg.total_sessions ? ` of ${pkg.total_sessions}` : ''}</span>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">Expiry Date</label>
                        {isEditing ? (
                          <Input
                            type="date"
                            value={edit?.expiry ?? ''}
                            onChange={(e) => updateEditState(pkg.id, { expiry: e.target.value })}
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            <span>{formatExpiryDate(pkg.expiry_date)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Per-treatment slot editor */}
                    {(isEditing || (pkg.sessions_by_treatment && pkg.sessions_by_treatment.length > 0)) && (
                      <div className="mb-4">
                        <label className="text-sm font-medium text-gray-700 mb-1 block">
                          Sessions by treatment
                        </label>
                        {isEditing ? (
                          <div className="space-y-2">
                            {(edit?.slots ?? []).map((slot, idx) => (
                              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                                <div className="col-span-12 md:col-span-6">
                                  <Select
                                    value={slot.treatment_id}
                                    onValueChange={(v) => updateSlot(pkg.id, idx, { treatment_id: v })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Choose a treatment" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {treatmentsList.map(t => (
                                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="col-span-5 md:col-span-2">
                                  <label className="text-xs text-muted-foreground">Total</label>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={slot.total}
                                    onChange={(e) => updateSlot(pkg.id, idx, { total: parseInt(e.target.value) || 0 })}
                                  />
                                </div>
                                <div className="col-span-5 md:col-span-3">
                                  <label className="text-xs text-muted-foreground">Remaining</label>
                                  <Input
                                    type="number"
                                    value={slot.remaining}
                                    onChange={(e) => updateSlot(pkg.id, idx, { remaining: parseInt(e.target.value) || 0 })}
                                  />
                                </div>
                                <div className="col-span-2 md:col-span-1 flex justify-end">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => removeSlot(pkg.id, idx)}
                                    title="Remove slot"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                            <Button type="button" variant="outline" size="sm" onClick={() => addSlot(pkg.id)}>
                              <Plus className="h-4 w-4 mr-1" />
                              Add treatment
                            </Button>
                          </div>
                        ) : (
                          <ul className="space-y-1 text-sm">
                            {pkg.sessions_by_treatment?.map((slot, i) => {
                              const used = slot.total - slot.remaining;
                              return (
                                <li key={slot.treatment_id || i} className="flex justify-between border rounded p-2 bg-purple-50/50">
                                  <span>{treatmentNameFor(slot.treatment_id)}</span>
                                  <span className="text-purple-900">
                                    {used} used / {slot.remaining} remaining (of {slot.total})
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* Included products */}
                    {(isEditing || (pkg.product_snapshot && pkg.product_snapshot.length > 0)) && (
                      <div className="mb-2">
                        <label className="text-sm font-medium text-gray-700 mb-1 block flex items-center gap-1">
                          <ShoppingBag className="h-4 w-4" />
                          Included products
                        </label>
                        {isEditing ? (
                          <div className="space-y-2">
                            {(edit?.products ?? []).map((p, idx) => (
                              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                                <div className="col-span-12 md:col-span-5">
                                  <Input
                                    value={p.product_name}
                                    onChange={(e) => updateProduct(pkg.id, idx, { product_name: e.target.value })}
                                  />
                                </div>
                                <div className="col-span-4 md:col-span-2">
                                  <label className="text-xs text-muted-foreground">Qty</label>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={p.quantity}
                                    onChange={(e) => updateProduct(pkg.id, idx, { quantity: parseInt(e.target.value) || 0 })}
                                  />
                                </div>
                                <div className="col-span-6 md:col-span-3">
                                  <label className="text-xs text-muted-foreground">Price ($)</label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={p.price}
                                    onChange={(e) => updateProduct(pkg.id, idx, { price: parseFloat(e.target.value) || 0 })}
                                  />
                                </div>
                                <div className="col-span-2 md:col-span-2 flex justify-end">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => removeProduct(pkg.id, idx)}
                                    title="Remove product"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                            <div>
                              <Select
                                value=""
                                onValueChange={(v) => addProduct(pkg.id, v)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Add a product…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {productOptions.map(opt => (
                                    <SelectItem key={opt.id} value={opt.id}>
                                      {opt.name} — ${opt.price.toFixed(2)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ) : (
                          <ul className="space-y-1 text-sm">
                            {pkg.product_snapshot?.map((p, i) => (
                              <li key={i} className="flex justify-between border rounded p-2 bg-blue-50/50">
                                <span>{p.product_name} × {p.quantity}</span>
                                <span className="text-blue-900">${p.price.toFixed(2)}/ea</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* Edit / Save / Cancel */}
                    {isEditing && (
                      <div className="flex gap-2 mt-4 pt-3 border-t">
                        <Button onClick={() => handleUpdatePackage(pkg.id)} size="sm">
                          <Save className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                        <Button onClick={cancelEdit} variant="outline" size="sm">
                          Cancel
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
