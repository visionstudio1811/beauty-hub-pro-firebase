import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ShoppingBag, Save, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Client } from '@/hooks/useClients';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useClientPackages } from '@/hooks/useClientPackages';

interface ClientProductRow {
  id: string;
  product_id: string;
  product_name: string;
  product_image: string | null;
  base_price: number;
  assigned_price: number;
  quantity: number;
  status: string;
  notes: string;
  purchase_id: string | null;
}

interface ManageClientProductsModalProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

const STATUS_OPTIONS = [
  { value: 'assigned', label: 'Assigned' },
  { value: 'delivered', label: 'Delivered' },
];

export const ManageClientProductsModal: React.FC<ManageClientProductsModalProps> = ({
  client,
  isOpen,
  onClose,
  onUpdate,
}) => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { packages: clientPackages } = useClientPackages(client?.id);
  const [rows, setRows] = useState<ClientProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchRows = async () => {
    if (!client || !currentOrganization?.id) return;
    setLoading(true);
    try {
      const orgId = currentOrganization.id;

      const assignmentsSnap = await getDocs(
        query(
          collection(db, 'organizations', orgId, 'productAssignments'),
          where('client_id', '==', client.id)
        )
      );
      const active = assignmentsSnap.docs.filter(d => !d.data().deleted_at);

      const productIds = Array.from(new Set(active.map(d => d.data().product_id).filter(Boolean)));
      const productMap = new Map<string, { name: string; price: number; image_url?: string }>();
      await Promise.all(
        productIds.map(async (pid) => {
          const snap = await getDocs(
            query(collection(db, 'organizations', orgId, 'products'), where('__name__', '==', pid))
          );
          snap.docs.forEach(d => {
            const data = d.data();
            productMap.set(d.id, {
              name: data.name || '',
              price: Number(data.price || 0),
              image_url: data.image_url,
            });
          });
        })
      );

      const result: ClientProductRow[] = active.map(d => {
        const data = d.data();
        const product = productMap.get(data.product_id);
        return {
          id: d.id,
          product_id: data.product_id || '',
          product_name: product?.name || 'Unknown product',
          product_image: product?.image_url ?? null,
          base_price: product?.price ?? 0,
          assigned_price: Number(data.assigned_price || 0),
          quantity: Number(data.quantity || 1),
          status: data.status || 'assigned',
          notes: data.notes || '',
          purchase_id: data.purchase_id ?? null,
        };
      });

      result.sort((a, b) => a.product_name.localeCompare(b.product_name));
      setRows(result);
    } catch (err) {
      console.error('Failed to load assigned products', err);
      toast({ title: 'Error', description: 'Failed to load assigned products', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setEditingId(null);
      fetchRows();
    }
  }, [isOpen, client?.id, currentOrganization?.id]);

  const updateRow = (id: string, patch: Partial<ClientProductRow>) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleSave = async (row: ClientProductRow) => {
    if (!currentOrganization?.id) return;
    if (row.assigned_price < 0 || row.quantity < 1) {
      toast({ title: 'Invalid values', description: 'Price must be ≥ 0 and quantity ≥ 1.', variant: 'destructive' });
      return;
    }
    setSavingId(row.id);
    try {
      await updateDoc(
        doc(db, 'organizations', currentOrganization.id, 'productAssignments', row.id),
        {
          assigned_price: row.assigned_price,
          quantity: row.quantity,
          status: row.status,
          notes: row.notes?.trim() || null,
          purchase_id: row.purchase_id || null,
          updated_at: serverTimestamp(),
        }
      );
      toast({ title: 'Saved', description: `${row.product_name} updated.` });
      setEditingId(null);
      onUpdate();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to save product', variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (row: ClientProductRow) => {
    if (!currentOrganization?.id) return;
    if (!confirm(`Remove "${row.product_name}" from ${client?.name}?`)) return;
    setDeletingId(row.id);
    try {
      // Soft delete keeps the row out of revenue aggregates while preserving
      // the audit trail. Hard delete would also work (productAssignments allow
      // delete for admins), but soft-delete is safer if the row was used to
      // back an issued invoice.
      await updateDoc(
        doc(db, 'organizations', currentOrganization.id, 'productAssignments', row.id),
        {
          deleted_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        }
      );
      toast({ title: 'Removed', description: `${row.product_name} removed from ${client?.name}.` });
      await fetchRows();
      onUpdate();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to remove product', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  if (!client) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            <span>Manage {client.name}'s Products</span>
          </DialogTitle>
          <DialogDescription>
            Edit assigned price, quantity, status, or remove products from this client.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-24 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No products assigned to this client</p>
            <p className="text-sm">Use "Assign Product" to add one.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map(row => {
              const isEditing = editingId === row.id;
              return (
                <Card key={row.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                          {row.product_image ? (
                            <img src={row.product_image} alt={row.product_name} className="w-full h-full object-cover" />
                          ) : (
                            <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{row.product_name}</div>
                          <div className="text-xs text-muted-foreground">
                            Base price: ${row.base_price.toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {row.purchase_id && !isEditing && (() => {
                          const pkg = clientPackages.find(p => p.id === row.purchase_id);
                          return (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs">
                              From {pkg?.package_name || 'Package'}
                            </Badge>
                          );
                        })()}
                        <Badge variant={row.status === 'delivered' ? 'default' : 'secondary'}>
                          {row.status}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">From package</label>
                      <Select
                        value={row.purchase_id ?? 'standalone'}
                        onValueChange={v => updateRow(row.id, { purchase_id: v === 'standalone' ? null : v })}
                        disabled={!isEditing}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Standalone (not from a package)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standalone">Standalone (not from a package)</SelectItem>
                          {[...clientPackages]
                            .sort((a, b) => {
                              const aHas = (a.product_snapshot || []).some(p => p.product_id === row.product_id) ? 1 : 0;
                              const bHas = (b.product_snapshot || []).some(p => p.product_id === row.product_id) ? 1 : 0;
                              return bHas - aHas;
                            })
                            .map(pkg => {
                              const inPackage = (pkg.product_snapshot || []).find(p => p.product_id === row.product_id);
                              return (
                                <SelectItem key={pkg.id} value={pkg.id}>
                                  {pkg.package_name}
                                  {inPackage ? ` — includes ${inPackage.quantity}` : ' (does not include this product)'}
                                </SelectItem>
                              );
                            })}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Price ($)</label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.assigned_price}
                          disabled={!isEditing}
                          onChange={e => updateRow(row.id, { assigned_price: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Quantity</label>
                        <Input
                          type="number"
                          min="1"
                          value={row.quantity}
                          disabled={!isEditing}
                          onChange={e => updateRow(row.id, { quantity: parseInt(e.target.value) || 1 })}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                        <Select
                          value={row.status}
                          onValueChange={v => updateRow(row.id, { status: v })}
                          disabled={!isEditing}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-end gap-2">
                        {isEditing ? (
                          <>
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() => handleSave(row)}
                              disabled={savingId === row.id}
                            >
                              <Save className="h-4 w-4 mr-1" />
                              {savingId === row.id ? 'Saving…' : 'Save'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingId(null);
                                fetchRows();
                              }}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => setEditingId(row.id)}
                          >
                            Edit
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(row)}
                          disabled={deletingId === row.id}
                          title="Remove product"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
                      <Textarea
                        rows={2}
                        value={row.notes}
                        disabled={!isEditing}
                        placeholder="Optional notes"
                        onChange={e => updateRow(row.id, { notes: e.target.value })}
                      />
                    </div>
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
