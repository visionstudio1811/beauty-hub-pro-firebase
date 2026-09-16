import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Tag, GripVertical } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

interface ProductBrand {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const ProductBrandManagement: React.FC = () => {
  const { t } = useTranslation('products');
  const [brands, setBrands] = useState<ProductBrand[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<ProductBrand | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_active: true,
    sort_order: 0,
  });

  useEffect(() => {
    if (currentOrganization?.id) fetchBrands();
  }, [currentOrganization?.id]);

  const fetchBrands = async () => {
    if (!currentOrganization?.id) return;
    try {
      setLoading(true);
      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'productBrands'),
          orderBy('sort_order')
        )
      );
      setBrands(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name ?? '',
          description: data.description ?? undefined,
          is_active: data.is_active ?? true,
          sort_order: data.sort_order ?? 0,
          created_at: data.created_at ?? '',
          updated_at: data.updated_at ?? '',
        };
      }));
    } catch (error) {
      console.error('Error fetching brands:', error);
      toast({ title: t('common:status.error'), description: t('brandManagement.toasts.loadFailed'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      is_active: true,
      sort_order: brands.length,
    });
    setEditingBrand(null);
  };

  const handleAdd = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleEdit = (brand: ProductBrand) => {
    setFormData({
      name: brand.name,
      description: brand.description || '',
      is_active: brand.is_active,
      sort_order: brand.sort_order,
    });
    setEditingBrand(brand);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({ title: t('brandManagement.toasts.validationTitle'), description: t('brandManagement.toasts.enterName'), variant: 'destructive' });
      return;
    }

    if (!currentOrganization?.id) {
      toast({ title: t('common:status.error'), description: t('brandManagement.toasts.noOrganization'), variant: 'destructive' });
      return;
    }

    try {
      const now = new Date().toISOString();
      const brandData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        is_active: formData.is_active,
        sort_order: formData.sort_order,
        organization_id: currentOrganization.id,
        updated_at: now,
      };

      if (editingBrand) {
        await updateDoc(doc(db, 'organizations', currentOrganization.id, 'productBrands', editingBrand.id), brandData);
        toast({ title: t('common:status.success'), description: t('brandManagement.toasts.updated') });
      } else {
        await addDoc(collection(db, 'organizations', currentOrganization.id, 'productBrands'), {
          ...brandData,
          created_at: now,
          created_at_ts: serverTimestamp(),
        });
        toast({ title: t('common:status.success'), description: t('brandManagement.toasts.created') });
      }

      setIsModalOpen(false);
      resetForm();
      fetchBrands();
    } catch (error) {
      console.error('Error saving brand:', error);
      toast({ title: t('common:status.error'), description: t('brandManagement.toasts.saveFailed'), variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('brandManagement.confirmDelete'))) return;
    if (!currentOrganization?.id) return;

    try {
      await deleteDoc(doc(db, 'organizations', currentOrganization.id, 'productBrands', id));
      toast({ title: t('common:status.success'), description: t('brandManagement.toasts.deleted') });
      fetchBrands();
    } catch (error) {
      console.error('Error deleting brand:', error);
      toast({ title: t('common:status.error'), description: t('brandManagement.toasts.deleteFailed'), variant: 'destructive' });
    }
  };

  const toggleStatus = async (brand: ProductBrand) => {
    if (!currentOrganization?.id) return;
    try {
      await updateDoc(doc(db, 'organizations', currentOrganization.id, 'productBrands', brand.id), {
        is_active: !brand.is_active,
        updated_at: new Date().toISOString(),
      });
      toast({
        title: t('common:status.success'),
        description: !brand.is_active
          ? t('brandManagement.toasts.activated')
          : t('brandManagement.toasts.deactivated'),
      });
      fetchBrands();
    } catch (error) {
      console.error('Error updating brand status:', error);
      toast({ title: t('common:status.error'), description: t('brandManagement.toasts.statusFailed'), variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">{t('brandManagement.loading')}</div>;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-purple-600" />
            {t('brandManagement.title')}
          </CardTitle>
          <Button onClick={handleAdd} size="sm">
            <Plus className="h-4 w-4 me-2" />
            {t('brandManagement.addBrand')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {brands.map((brand) => (
            <div
              key={brand.id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
            >
              <div className="flex items-center space-x-3 rtl:space-x-reverse">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <span className="font-medium">{brand.name}</span>
                    <Badge variant={brand.is_active ? 'default' : 'secondary'}>
                      {brand.is_active ? t('common:labels.active') : t('common:labels.inactive')}
                    </Badge>
                  </div>
                  {brand.description && (
                    <p className="text-sm text-muted-foreground">{brand.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <Switch
                  checked={brand.is_active}
                  onCheckedChange={() => toggleStatus(brand)}
                />
                <Button variant="ghost" size="sm" onClick={() => handleEdit(brand)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(brand.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {brands.length === 0 && (
            <div className="text-center py-8">
              <Tag className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">{t('brandManagement.emptyTitle')}</h3>
              <p className="text-muted-foreground mb-4">{t('brandManagement.emptyDescription')}</p>
              <Button onClick={handleAdd}>
                <Plus className="h-4 w-4 me-2" />
                {t('brandManagement.addBrand')}
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBrand ? t('brandManagement.editBrand') : t('brandManagement.addNewBrand')}</DialogTitle>
            <DialogDescription>
              {editingBrand ? t('brandManagement.updateDescription') : t('brandManagement.createDescription')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t('brandManagement.fields.name')}</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('brandManagement.fields.namePlaceholder')}
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium">{t('brandManagement.fields.description')}</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('brandManagement.fields.descriptionPlaceholder')}
                rows={3}
              />
            </div>

            <div>
              <label className="text-sm font-medium">{t('brandManagement.fields.sortOrder')}</label>
              <Input
                type="number"
                value={formData.sort_order}
                onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                placeholder={t('brandManagement.fields.sortOrderPlaceholder')}
              />
            </div>

            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <label className="text-sm font-medium">{t('brandManagement.fields.active')}</label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit">
                {editingBrand ? t('brandManagement.updateBrand') : t('brandManagement.addBrand')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
