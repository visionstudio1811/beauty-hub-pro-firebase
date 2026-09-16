
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
import { Checkbox } from '@/components/ui/checkbox';

type CategoryScope = 'product' | 'treatment';
const ALL_SCOPES: CategoryScope[] = ['product', 'treatment'];
// Scope labels are translated at render time via t(`categoryManagement.scopes.${scope}`).

interface ProductCategory {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  sort_order: number;
  applies_to: CategoryScope[];
  created_at: string;
  updated_at: string;
}

export const ProductCategoryManagement: React.FC = () => {
  const { t } = useTranslation('products');
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  const scopeLabel = (scope: CategoryScope) => t(`categoryManagement.scopes.${scope}`);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_active: true,
    sort_order: 0,
    applies_to: ['product', 'treatment'] as CategoryScope[],
  });

  useEffect(() => {
    if (currentOrganization?.id) fetchCategories();
  }, [currentOrganization?.id]);

  const fetchCategories = async () => {
    if (!currentOrganization?.id) return;
    try {
      setLoading(true);
      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'productCategories'),
          orderBy('sort_order')
        )
      );
      setCategories(snap.docs.map(d => {
        const data = d.data();
        const appliesTo: CategoryScope[] = Array.isArray(data.applies_to) && data.applies_to.length > 0
          ? data.applies_to.filter((s: any): s is CategoryScope => s === 'product' || s === 'treatment')
          : ['product']; // Legacy categories existed before scope was a thing — default to products only.
        return {
          id: d.id,
          name: data.name ?? '',
          description: data.description ?? undefined,
          is_active: data.is_active ?? true,
          sort_order: data.sort_order ?? 0,
          applies_to: appliesTo,
          created_at: data.created_at ?? '',
          updated_at: data.updated_at ?? '',
        };
      }));
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast({ title: t('common:status.error'), description: t('categoryManagement.toasts.loadFailed'), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      is_active: true,
      sort_order: categories.length,
      applies_to: ['product', 'treatment'],
    });
    setEditingCategory(null);
  };

  const handleAdd = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleEdit = (category: ProductCategory) => {
    setFormData({
      name: category.name,
      description: category.description || '',
      is_active: category.is_active,
      sort_order: category.sort_order,
      applies_to: category.applies_to.length > 0 ? category.applies_to : ['product'],
    });
    setEditingCategory(category);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: t('categoryManagement.toasts.validationTitle'),
        description: t('categoryManagement.toasts.enterName'),
        variant: "destructive"
      });
      return;
    }

    if (formData.applies_to.length === 0) {
      toast({
        title: t('categoryManagement.toasts.validationTitle'),
        description: t('categoryManagement.toasts.pickScope'),
        variant: "destructive"
      });
      return;
    }

    if (!currentOrganization?.id) {
      toast({ title: t('common:status.error'), description: t('categoryManagement.toasts.noOrganization'), variant: "destructive" });
      return;
    }

    try {
      const now = new Date().toISOString();
      const categoryData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        is_active: formData.is_active,
        sort_order: formData.sort_order,
        applies_to: formData.applies_to,
        organization_id: currentOrganization.id,
        updated_at: now,
      };

      if (editingCategory) {
        await updateDoc(doc(db, 'organizations', currentOrganization.id, 'productCategories', editingCategory.id), categoryData);
        toast({ title: t('common:status.success'), description: t('categoryManagement.toasts.updated') });
      } else {
        await addDoc(collection(db, 'organizations', currentOrganization.id, 'productCategories'), {
          ...categoryData,
          created_at: now,
          created_at_ts: serverTimestamp(),
        });
        toast({ title: t('common:status.success'), description: t('categoryManagement.toasts.created') });
      }

      setIsModalOpen(false);
      resetForm();
      fetchCategories();
    } catch (error) {
      console.error('Error saving category:', error);
      toast({ title: t('common:status.error'), description: t('categoryManagement.toasts.saveFailed'), variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('categoryManagement.confirmDelete'))) return;

    try {
      await deleteDoc(doc(db, 'organizations', currentOrganization!.id, 'productCategories', id));
      toast({ title: t('common:status.success'), description: t('categoryManagement.toasts.deleted') });
      fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast({ title: t('common:status.error'), description: t('categoryManagement.toasts.deleteFailed'), variant: "destructive" });
    }
  };

  const toggleStatus = async (category: ProductCategory) => {
    try {
      await updateDoc(doc(db, 'organizations', currentOrganization!.id, 'productCategories', category.id), { is_active: !category.is_active });
      toast({
        title: t('common:status.success'),
        description: !category.is_active
          ? t('categoryManagement.toasts.activated')
          : t('categoryManagement.toasts.deactivated'),
      });
      fetchCategories();
    } catch (error) {
      console.error('Error updating category status:', error);
      toast({ title: t('common:status.error'), description: t('categoryManagement.toasts.statusFailed'), variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">{t('categoryManagement.loading')}</div>;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-purple-600" />
            {t('categoryManagement.title')}
          </CardTitle>
          <Button onClick={handleAdd} size="sm">
            <Plus className="h-4 w-4 me-2" />
            {t('categoryManagement.addCategory')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {categories.map((category) => (
            <div
              key={category.id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
            >
              <div className="flex items-center space-x-3 rtl:space-x-reverse">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{category.name}</span>
                    <Badge variant={category.is_active ? "default" : "secondary"}>
                      {category.is_active ? t('common:labels.active') : t('common:labels.inactive')}
                    </Badge>
                    {category.applies_to.map(scope => (
                      <Badge key={scope} variant="outline" className="text-xs">
                        {scopeLabel(scope)}
                      </Badge>
                    ))}
                  </div>
                  {category.description && (
                    <p className="text-sm text-muted-foreground">{category.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <Switch
                  checked={category.is_active}
                  onCheckedChange={() => toggleStatus(category)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEdit(category)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(category.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {categories.length === 0 && (
            <div className="text-center py-8">
              <Tag className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">{t('categoryManagement.emptyTitle')}</h3>
              <p className="text-muted-foreground mb-4">{t('categoryManagement.emptyDescription')}</p>
              <Button onClick={handleAdd}>
                <Plus className="h-4 w-4 me-2" />
                {t('categoryManagement.addCategory')}
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      {/* Category Form Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? t('categoryManagement.editCategory') : t('categoryManagement.addNewCategory')}
            </DialogTitle>
            <DialogDescription>
              {editingCategory ? t('categoryManagement.updateDescription') : t('categoryManagement.createDescription')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t('categoryManagement.fields.name')}</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder={t('categoryManagement.fields.namePlaceholder')}
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium">{t('categoryManagement.fields.description')}</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder={t('categoryManagement.fields.descriptionPlaceholder')}
                rows={3}
              />
            </div>

            <div>
              <label className="text-sm font-medium">{t('categoryManagement.fields.sortOrder')}</label>
              <Input
                type="number"
                value={formData.sort_order}
                onChange={(e) => setFormData({...formData, sort_order: parseInt(e.target.value) || 0})}
                placeholder={t('categoryManagement.fields.sortOrderPlaceholder')}
              />
            </div>

            <div>
              <label className="text-sm font-medium">{t('categoryManagement.fields.appliesTo')}</label>
              <p className="text-xs text-muted-foreground mb-2">
                {t('categoryManagement.fields.appliesToHelp')}
              </p>
              <div className="flex flex-wrap gap-3">
                {ALL_SCOPES.map(scope => {
                  const checked = formData.applies_to.includes(scope);
                  return (
                    <label
                      key={scope}
                      className="flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const next = v
                            ? Array.from(new Set([...formData.applies_to, scope]))
                            : formData.applies_to.filter(s => s !== scope);
                          setFormData({ ...formData, applies_to: next });
                        }}
                      />
                      <span className="text-sm">{scopeLabel(scope)}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
              />
              <label className="text-sm font-medium">{t('categoryManagement.fields.active')}</label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit">
                {editingCategory ? t('categoryManagement.updateCategory') : t('categoryManagement.addCategory')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
