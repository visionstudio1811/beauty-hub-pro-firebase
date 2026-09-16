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
import { useTranslation } from 'react-i18next';

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

const STATUS_OPTIONS = ['assigned', 'delivered'] as const;

export const ManageClientProductsModal: React.FC<ManageClientProductsModalProps> = ({
  client,
  isOpen,
  onClose,
  onUpdate,
}) => {
  const { t } = useTranslation('clientModals');
  const { toast } = useToast();
  const statusLabel = (status: string) =>
    t(`manageClientProductsModal.statusOptions.${status}`, { defaultValue: status });
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
          product_name: product?.name || t('manageClientProductsModal.unknownProduct'),
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
      toast({ title: t('common:status.error'), description: t('manageClientProductsModal.loadFailed'), variant: 'destructive' });
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
      toast({ title: t('manageClientProductsModal.invalidValues'), description: t('manageClientProductsModal.invalidValuesDescription'), variant: 'destructive' });
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
      toast({ title: t('manageClientProductsModal.saved'), description: t('manageClientProductsModal.savedDescription', { product: row.product_name }) });
      setEditingId(null);
      onUpdate();
    } catch (err) {
      console.error(err);
      toast({ title: t('common:status.error'), description: t('manageClientProductsModal.saveFailed'), variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (row: ClientProductRow) => {
    if (!currentOrganization?.id) return;
    if (!confirm(t('manageClientProductsModal.confirmRemove', { product: row.product_name, client: client?.name }))) return;
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
      toast({ title: t('manageClientProductsModal.removed'), description: t('manageClientProductsModal.removedDescription', { product: row.product_name, client: client?.name }) });
      await fetchRows();
      onUpdate();
    } catch (err) {
      console.error(err);
      toast({ title: t('common:status.error'), description: t('manageClientProductsModal.removeFailed'), variant: 'destructive' });
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
            <span>{t('manageClientProductsModal.title', { name: client.name })}</span>
          </DialogTitle>
          <DialogDescription>
            {t('manageClientProductsModal.description')}
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
            <p>{t('manageClientProductsModal.empty')}</p>
            <p className="text-sm">{t('manageClientProductsModal.emptyHint')}</p>
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
                            {t('manageClientProductsModal.basePrice', { price: row.base_price.toFixed(2) })}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {row.purchase_id && !isEditing && (() => {
                          const pkg = clientPackages.find(p => p.id === row.purchase_id);
                          return (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs">
                              {t('manageClientProductsModal.fromPackageBadge', { package: pkg?.package_name || t('manageClientProductsModal.packageFallback') })}
                            </Badge>
                          );
                        })()}
                        <Badge variant={row.status === 'delivered' ? 'default' : 'secondary'}>
                          {statusLabel(row.status)}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('manageClientProductsModal.fromPackageLabel')}</label>
                      <Select
                        value={row.purchase_id ?? 'standalone'}
                        onValueChange={v => updateRow(row.id, { purchase_id: v === 'standalone' ? null : v })}
                        disabled={!isEditing}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('manageClientProductsModal.standalone')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standalone">{t('manageClientProductsModal.standalone')}</SelectItem>
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
                                  {inPackage
                                    ? t('manageClientProductsModal.packageIncludes', { name: pkg.package_name, quantity: inPackage.quantity })
                                    : t('manageClientProductsModal.packageDoesNotInclude', { name: pkg.package_name })}
                                </SelectItem>
                              );
                            })}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('manageClientProductsModal.priceLabel')}</label>
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
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('common:labels.quantity')}</label>
                        <Input
                          type="number"
                          min="1"
                          value={row.quantity}
                          disabled={!isEditing}
                          onChange={e => updateRow(row.id, { quantity: parseInt(e.target.value) || 1 })}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('common:labels.status')}</label>
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
                              <SelectItem key={opt} value={opt}>{statusLabel(opt)}</SelectItem>
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
                              <Save className="h-4 w-4 me-1" />
                              {savingId === row.id ? t('common:actions.saving') : t('common:actions.save')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingId(null);
                                fetchRows();
                              }}
                            >
                              {t('common:actions.cancel')}
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => setEditingId(row.id)}
                          >
                            {t('common:actions.edit')}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(row)}
                          disabled={deletingId === row.id}
                          title={t('manageClientProductsModal.removeProduct')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('common:labels.notes')}</label>
                      <Textarea
                        rows={2}
                        value={row.notes}
                        disabled={!isEditing}
                        placeholder={t('manageClientProductsModal.notesPlaceholder')}
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
          <Button onClick={onClose}>{t('common:actions.close')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
