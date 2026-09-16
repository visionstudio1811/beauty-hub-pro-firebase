
import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Package as PackageIcon, Calendar, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Client } from '@/hooks/useClients';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSupabaseTreatments } from '@/hooks/useSupabaseTreatments';
import { syncMembershipStatus, logMembershipEvent } from '@/hooks/useMembershipSync';
import { TreatmentItem, ProductItem } from '@/types/package';
import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { SendAgreementDialog } from '@/components/agreements/SendAgreementDialog';
import { useTranslation } from 'react-i18next';

interface CatalogPackage {
  id: string;
  name: string;
  description: string;
  price: number;
  total_sessions: number;
  validity_months: number;
  treatments: string[];
  treatment_items?: TreatmentItem[];
  product_items?: ProductItem[];
  is_active: boolean;
}

interface PackageAssignmentModalProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onAssign: (client: Client, packageData: any) => void;
}

// Produce a TreatmentItem[] for display/edit, preferring the package's own
// treatment_items and falling back to an even split of total_sessions across
// the legacy treatments[] array (remainder on the first slots).
const deriveInitialItems = (pkg: CatalogPackage): TreatmentItem[] => {
  if (pkg.treatment_items && pkg.treatment_items.length > 0) {
    return pkg.treatment_items.map(i => ({ treatment_id: i.treatment_id, quantity: i.quantity }));
  }
  const n = pkg.treatments?.length || 0;
  if (n === 0) return [];
  const base = Math.floor((pkg.total_sessions || 0) / n);
  const extra = (pkg.total_sessions || 0) - base * n;
  return pkg.treatments.map((tid, idx) => ({
    treatment_id: tid,
    quantity: base + (idx < extra ? 1 : 0),
  }));
};

interface EditState {
  price: number;
  validity_months: number;
  items: TreatmentItem[];
  alreadyUsed: Record<string, number>;
  product_items: ProductItem[];
}

export const PackageAssignmentModal: React.FC<PackageAssignmentModalProps> = ({
  client,
  isOpen,
  onClose,
  onAssign,
}) => {
  const { t } = useTranslation('packages');
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { treatments } = useSupabaseTreatments();
  const [packages, setPackages] = useState<CatalogPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [pendingAgreement, setPendingAgreement] = useState<
    { purchaseId: string; packageName: string } | null
  >(null);
  const [purchaseDate, setPurchaseDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [productNames, setProductNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && currentOrganization?.id) {
      fetchPackages();
      setPurchaseDate(new Date().toISOString().split('T')[0]);
      // Fetch all product names for display
      getDocs(query(collection(db, 'organizations', currentOrganization.id, 'products'), orderBy('name')))
        .then(snap => {
          const names: Record<string, string> = {};
          snap.docs.forEach(d => { names[d.id] = d.data().name || d.id; });
          setProductNames(names);
        })
        .catch(() => {});
    }
  }, [isOpen, currentOrganization?.id]);

  const fetchPackages = async () => {
    if (!currentOrganization?.id) {
      setPackages([]);
      return;
    }
    setLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'packages'),
          where('is_active', '==', true),
          orderBy('name'),
        ),
      );
      const loaded = snap.docs
        .map(d => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? '',
            description: data.description ?? '',
            price: data.price ?? 0,
            total_sessions: data.total_sessions ?? 0,
            validity_months: data.validity_months ?? 1,
            treatments: data.treatments ?? [],
            treatment_items: Array.isArray(data.treatment_items) ? data.treatment_items : undefined,
            product_items: Array.isArray(data.product_items) ? data.product_items : undefined,
            is_active: data.is_active ?? true,
            is_custom: data.is_custom ?? false,
          };
        })
        // Don't show custom (per-client) packages in the catalog assignment list.
        .filter(p => !(p as any).is_custom) as CatalogPackage[];
      setPackages(loaded);
      const initial: Record<string, EditState> = {};
      for (const p of loaded) {
        initial[p.id] = {
          price: p.price,
          validity_months: p.validity_months,
          items: deriveInitialItems(p),
          alreadyUsed: {},
          product_items: Array.isArray(p.product_items) ? p.product_items.map(i => ({ ...i })) : [],
        };
      }
      setEdits(initial);
    } catch (error) {
      console.error('Error fetching packages:', error);
      toast({ title: t('common:status.error'), description: t('assignmentModal.loadFailed'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const treatmentName = (id: string) => treatments.find(t => t.id === id)?.name ?? id;

  const updateEdit = (pkgId: string, updater: (prev: EditState) => EditState) => {
    setEdits(prev => ({ ...prev, [pkgId]: updater(prev[pkgId]) }));
  };

  const setItemAlreadyUsed = (pkgId: string, treatmentId: string, used: number) => {
    updateEdit(pkgId, prev => ({
      ...prev,
      alreadyUsed: { ...prev.alreadyUsed, [treatmentId]: Math.max(0, used) },
    }));
  };

  const setProductItemField = (pkgId: string, productId: string, field: 'quantity' | 'price', value: number) => {
    updateEdit(pkgId, prev => {
      const items = [...prev.product_items];
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx === -1) return prev;
      items[idx] = { ...items[idx], [field]: value };
      return { ...prev, product_items: items };
    });
  };

  const setItemQuantity = (pkgId: string, treatmentId: string, qty: number) => {
    updateEdit(pkgId, prev => {
      const items = [...prev.items];
      const idx = items.findIndex(i => i.treatment_id === treatmentId);
      if (qty <= 0) {
        if (idx !== -1) items.splice(idx, 1);
      } else if (idx === -1) {
        items.push({ treatment_id: treatmentId, quantity: qty });
      } else {
        items[idx] = { ...items[idx], quantity: qty };
      }
      return { ...prev, items };
    });
  };

  const handleAssignPackage = async (pkg: CatalogPackage) => {
    if (!client) return;
    if (!currentOrganization?.id) {
      toast({ title: t('common:status.error'), description: t('assignmentModal.noOrg'), variant: 'destructive' });
      return;
    }

    const edit = edits[pkg.id];
    if (!edit) return;
    if (edit.items.length === 0 || edit.items.some(i => i.quantity < 1)) {
      toast({
        title: t('assignmentModal.invalidTitle'),
        description: t('assignmentModal.invalidQuantity'),
        variant: 'destructive',
      });
      return;
    }
    if (edit.price <= 0 || edit.validity_months <= 0) {
      toast({
        title: t('assignmentModal.invalidTitle'),
        description: t('assignmentModal.invalidPriceValidity'),
        variant: 'destructive',
      });
      return;
    }

    setAssigning(pkg.id);

    try {
      // Use purchaseDate so retroactive assignments get the right start/expiry
      const purchaseDateObj = new Date(purchaseDate + 'T12:00:00');
      const expiryDate = new Date(purchaseDateObj);
      expiryDate.setMonth(expiryDate.getMonth() + edit.validity_months);

      const sessionsByTreatment = edit.items.map(i => {
        const used = edit.alreadyUsed[i.treatment_id] ?? 0;
        return {
          treatment_id: i.treatment_id,
          remaining: Math.max(0, i.quantity - used),
          total: i.quantity,
        };
      });
      const totalSessions = sessionsByTreatment.reduce((sum, s) => sum + s.remaining, 0);

      const productSnapshot = edit.product_items.map(i => ({
        product_id: i.product_id,
        product_name: productNames[i.product_id] || i.product_id,
        quantity: i.quantity,
        price: i.price,
      }));

      const now = new Date().toISOString();
      const purchaseRef = await addDoc(
        collection(db, 'organizations', currentOrganization.id, 'purchases'),
        {
          client_id: client.id,
          package_id: pkg.id,
          organization_id: currentOrganization.id,
          total_amount: edit.price,
          sessions_remaining: totalSessions,
          sessions_by_treatment: sessionsByTreatment,
          expiry_date: expiryDate.toISOString().split('T')[0],
          payment_status: totalSessions > 0 ? 'active' : 'completed',
          purchase_date: purchaseDate,
          ...(productSnapshot.length > 0 ? { product_snapshot: productSnapshot } : {}),
          created_at: now,
          created_at_ts: serverTimestamp(),
        },
      );
      const purchase = { id: purchaseRef.id };

      // Create completed appointment records for already-used sessions
      const apptWrites: Promise<unknown>[] = [];
      for (const item of edit.items) {
        const used = edit.alreadyUsed[item.treatment_id] ?? 0;
        if (used <= 0) continue;
        const tName = treatmentName(item.treatment_id);
        for (let i = 0; i < used; i++) {
          apptWrites.push(
            addDoc(collection(db, 'organizations', currentOrganization.id, 'appointments'), {
              client_id: client.id,
              client_name: client.name,
              client_phone: client.phone ?? '',
              client_email: client.email ?? '',
              treatment_id: item.treatment_id,
              treatment_name: tName,
              staff_id: '',
              staff_name: '',
              appointment_date: purchaseDate,
              appointment_time: '00:00',
              duration: 60,
              status: 'completed',
              session_used: true,
              is_manual_entry: true,
              package_id: pkg.id,
              purchase_id: purchaseRef.id,
              organization_id: currentOrganization.id,
              // Persisted marker: always written in English so stored data does not
              // depend on the writer's UI language (matches the pre-i18n constant).
              notes: t('assignmentModal.retroNote', { lng: 'en' }),
              created_at: now,
              created_at_ts: serverTimestamp(),
            })
          );
        }
      }
      if (apptWrites.length > 0) await Promise.all(apptWrites);

      await syncMembershipStatus(currentOrganization.id, client.id, 'package_assigned');
      await logMembershipEvent(currentOrganization.id, client.id, 'package_assigned', {
        packageName: pkg.name,
        packageId: pkg.id,
        purchaseId: purchaseRef.id,
        totalSessions,
        price: edit.price,
        expiryDate: expiryDate.toISOString().split('T')[0],
      });

      toast({
        title: t('assignmentModal.assignedTitle'),
        description: t('assignmentModal.assignedDescription', { packageName: pkg.name, clientName: client.name }),
      });

      onAssign(client, { package: pkg, purchase });
      setPendingAgreement({ purchaseId: purchaseRef.id, packageName: pkg.name });
    } catch (error) {
      console.error('Error assigning package:', error);
      const msg = error instanceof Error ? error.message : t('assignmentModal.unknownError');
      toast({ title: t('common:status.error'), description: t('assignmentModal.assignFailed', { error: msg }), variant: 'destructive' });
    } finally {
      setAssigning(null);
    }
  };

  const catalogPackages = useMemo(() => packages, [packages]);

  if (!client) return null;

  if (pendingAgreement) {
    return (
      <SendAgreementDialog
        client={client}
        purchaseId={pendingAgreement.purchaseId}
        packageName={pendingAgreement.packageName}
        isOpen={true}
        onClose={() => { setPendingAgreement(null); onClose(); }}
      />
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 rtl:space-x-reverse">
            <PackageIcon className="h-5 w-5" />
            <span>{t('assignmentModal.title', { name: client.name })}</span>
          </DialogTitle>
          <DialogDescription>
            {t('assignmentModal.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2 border-b">
          <label className="text-sm font-medium whitespace-nowrap">{t('assignmentModal.purchaseDate')}</label>
          <Input
            type="date"
            value={purchaseDate}
            onChange={e => setPurchaseDate(e.target.value)}
            className="w-44 h-8 text-sm"
            max={new Date().toISOString().split('T')[0]}
          />
          <span className="text-xs text-muted-foreground">
            {t('assignmentModal.purchaseDateHelp')}
          </span>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        ) : catalogPackages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <PackageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t('assignmentModal.emptyTitle')}</p>
            <p className="text-sm">{t('assignmentModal.emptyDescription')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {catalogPackages.map(pkg => {
              const edit = edits[pkg.id];
              if (!edit) return null;
              const totalSessions = edit.items.reduce((sum, i) => sum + i.quantity, 0);
              return (
                <Card key={pkg.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-sm">
                      <span className="truncate">{pkg.name}</span>
                      <Badge variant="secondary">${edit.price.toFixed(2)}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {pkg.description && (
                      <p className="text-xs text-muted-foreground">{pkg.description}</p>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium">{t('assignmentModal.price')}</label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={edit.price}
                          onChange={e =>
                            updateEdit(pkg.id, prev => ({
                              ...prev,
                              price: parseFloat(e.target.value) || 0,
                            }))
                          }
                          className="h-8 text-sm mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium">{t('assignmentModal.validity')}</label>
                        <Input
                          type="number"
                          min="1"
                          value={edit.validity_months}
                          onChange={e =>
                            updateEdit(pkg.id, prev => ({
                              ...prev,
                              validity_months: parseInt(e.target.value, 10) || 1,
                            }))
                          }
                          className="h-8 text-sm mt-1"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium">{t('assignmentModal.treatmentsAndQuantities')}</label>
                        <span className="text-xs text-muted-foreground">
                          {t('assignmentModal.total')} <span className="font-semibold">{totalSessions}</span>
                        </span>
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto border rounded p-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-muted-foreground flex-1">{t('assignmentModal.colTreatment')}</span>
                          <span className="text-xs text-muted-foreground w-14 text-center">{t('assignmentModal.colTotal')}</span>
                          <span className="text-xs text-muted-foreground w-14 text-center">{t('assignmentModal.colUsed')}</span>
                        </div>
                        {pkg.treatments.map(tid => {
                          const current = edit.items.find(i => i.treatment_id === tid)?.quantity ?? 0;
                          const used = edit.alreadyUsed[tid] ?? 0;
                          return (
                            <div key={tid} className="flex items-center gap-2">
                              <span className="text-xs flex-1 truncate">{treatmentName(tid)}</span>
                              <Input
                                type="number"
                                min="0"
                                value={current}
                                onChange={e => {
                                  const v = parseInt(e.target.value, 10);
                                  setItemQuantity(pkg.id, tid, Number.isFinite(v) ? v : 0);
                                }}
                                className="h-7 w-14 text-xs"
                              />
                              <Input
                                type="number"
                                min="0"
                                max={current}
                                value={used}
                                onChange={e => {
                                  const v = parseInt(e.target.value, 10);
                                  setItemAlreadyUsed(pkg.id, tid, Number.isFinite(v) ? v : 0);
                                }}
                                className="h-7 w-14 text-xs"
                                placeholder="0"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {edit.product_items.length > 0 && (
                      <div>
                        <label className="text-xs font-medium">{t('assignmentModal.includedProducts')}</label>
                        <div className="space-y-1 mt-1 border rounded p-2">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-muted-foreground flex-1">{t('assignmentModal.colProduct')}</span>
                            <span className="text-xs text-muted-foreground w-14 text-center">{t('assignmentModal.colQty')}</span>
                            <span className="text-xs text-muted-foreground w-20 text-center">{t('assignmentModal.colPrice')}</span>
                          </div>
                          {edit.product_items.map(item => (
                            <div key={item.product_id} className="flex items-center gap-2">
                              <span className="text-xs flex-1 truncate">{productNames[item.product_id] || item.product_id}</span>
                              <Input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={e => setProductItemField(pkg.id, item.product_id, 'quantity', parseInt(e.target.value, 10) || 1)}
                                className="h-7 w-14 text-xs"
                              />
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.price}
                                onChange={e => setProductItemField(pkg.id, item.product_id, 'price', parseFloat(e.target.value) || 0)}
                                className="h-7 w-20 text-xs"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{t('assignmentModal.expiresIn', { count: edit.validity_months })}</span>
                    </div>

                    <Button
                      onClick={() => handleAssignPackage(pkg)}
                      className="w-full"
                      disabled={assigning === pkg.id}
                    >
                      {assigning === pkg.id ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white me-2" />
                          {t('assignmentModal.assigning')}
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4 me-2" />
                          {t('assignmentModal.assignPackage')}
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
