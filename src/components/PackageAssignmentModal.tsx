
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
import { TreatmentItem } from '@/types/package';
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

interface CatalogPackage {
  id: string;
  name: string;
  description: string;
  price: number;
  total_sessions: number;
  validity_months: number;
  treatments: string[];
  treatment_items?: TreatmentItem[];
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
}

export const PackageAssignmentModal: React.FC<PackageAssignmentModalProps> = ({
  client,
  isOpen,
  onClose,
  onAssign,
}) => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { treatments } = useSupabaseTreatments();
  const [packages, setPackages] = useState<CatalogPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, EditState>>({});

  useEffect(() => {
    if (isOpen) {
      fetchPackages();
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
        };
      }
      setEdits(initial);
    } catch (error) {
      console.error('Error fetching packages:', error);
      toast({ title: 'Error', description: 'Failed to load packages', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const treatmentName = (id: string) => treatments.find(t => t.id === id)?.name ?? id;

  const updateEdit = (pkgId: string, updater: (prev: EditState) => EditState) => {
    setEdits(prev => ({ ...prev, [pkgId]: updater(prev[pkgId]) }));
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
      toast({ title: 'Error', description: 'No organization selected.', variant: 'destructive' });
      return;
    }

    const edit = edits[pkg.id];
    if (!edit) return;
    if (edit.items.length === 0 || edit.items.some(i => i.quantity < 1)) {
      toast({
        title: 'Invalid package',
        description: 'Each included treatment needs a quantity of at least 1.',
        variant: 'destructive',
      });
      return;
    }
    if (edit.price <= 0 || edit.validity_months <= 0) {
      toast({
        title: 'Invalid package',
        description: 'Price and validity must be greater than 0.',
        variant: 'destructive',
      });
      return;
    }

    setAssigning(pkg.id);

    try {
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + edit.validity_months);

      const totalSessions = edit.items.reduce((sum, i) => sum + i.quantity, 0);
      const sessionsByTreatment = edit.items.map(i => ({
        treatment_id: i.treatment_id,
        remaining: i.quantity,
        total: i.quantity,
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
          payment_status: 'active',
          purchase_date: now.split('T')[0],
          created_at: now,
          created_at_ts: serverTimestamp(),
        },
      );
      const purchase = { id: purchaseRef.id };

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
        title: 'Package Assigned',
        description: `${pkg.name} has been assigned to ${client.name}. Package is now active and can be used for bookings.`,
      });

      onAssign(client, { package: pkg, purchase });
      onClose();
    } catch (error) {
      console.error('Error assigning package:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast({ title: 'Error', description: `Failed to assign package: ${msg}`, variant: 'destructive' });
    } finally {
      setAssigning(null);
    }
  };

  const catalogPackages = useMemo(() => packages, [packages]);

  if (!client) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <PackageIcon className="h-5 w-5" />
            <span>Assign Package to {client.name}</span>
          </DialogTitle>
          <DialogDescription>
            Select a package and adjust price, validity, or per-treatment quantities before assigning.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        ) : catalogPackages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <PackageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No active packages available</p>
            <p className="text-sm">Create packages in Settings to assign them to clients.</p>
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
                        <label className="text-xs font-medium">Price ($)</label>
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
                        <label className="text-xs font-medium">Validity (months)</label>
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
                        <label className="text-xs font-medium">Treatments & quantities</label>
                        <span className="text-xs text-muted-foreground">
                          Total: <span className="font-semibold">{totalSessions}</span>
                        </span>
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto border rounded p-2">
                        {pkg.treatments.map(tid => {
                          const current = edit.items.find(i => i.treatment_id === tid)?.quantity ?? 0;
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
                                className="h-7 w-16 text-xs"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>Expires in {edit.validity_months} month(s)</span>
                    </div>

                    <Button
                      onClick={() => handleAssignPackage(pkg)}
                      className="w-full"
                      disabled={assigning === pkg.id}
                    >
                      {assigning === pkg.id ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                          Assigning...
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-2" />
                          Assign Package
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
