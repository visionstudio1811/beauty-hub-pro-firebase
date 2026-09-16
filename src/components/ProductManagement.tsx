
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Package, DollarSign } from 'lucide-react'; // Package kept for empty-state icon
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  brand?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const ProductManagement = () => {
  const { t } = useTranslation('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: '',
    is_active: true
  });

  useEffect(() => {
    if (currentOrganization?.id) fetchProducts();
  }, [currentOrganization?.id]);

  const fetchProducts = async () => {
    if (!currentOrganization?.id) return;
    try {
      setLoading(true);
      const snap = await getDocs(
        query(collection(db, 'organizations', currentOrganization.id, 'products'), orderBy('name'))
      );
      setProducts(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name ?? '',
          description: data.description ?? undefined,
          price: data.price ?? 0,
          category: data.category ?? undefined,
          brand: data.brand ?? undefined,
          is_active: data.is_active ?? true,
          created_at: data.created_at ?? '',
          updated_at: data.updated_at ?? '',
        };
      }));
    } catch (error) {
      console.error('Error fetching products:', error);
      toast({ title: t('common:status.error'), description: t('productManagement.toasts.loadFailed'), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      price: '',
      category: '',
      is_active: true
    });
    setEditingProduct(null);
  };

  const handleAdd = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleEdit = (product: Product) => {
    setFormData({
      name: product.name,
      description: product.description || '',
      price: product.price.toString(),
      category: product.category || '',
      is_active: product.is_active
    });
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.price) {
      toast({
        title: t('productManagement.toasts.validationTitle'),
        description: t('productManagement.toasts.fillNameAndPrice'),
        variant: "destructive"
      });
      return;
    }

    if (!currentOrganization?.id) return;
    try {
      const now = new Date().toISOString();
      const productData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        price: parseFloat(formData.price),
        category: formData.category.trim() || null,
        is_active: formData.is_active,
        updated_at: now,
      };

      if (editingProduct) {
        await updateDoc(doc(db, 'organizations', currentOrganization.id, 'products', editingProduct.id), productData);
        toast({ title: t('common:status.success'), description: t('productManagement.toasts.updated') });
      } else {
        await addDoc(collection(db, 'organizations', currentOrganization.id, 'products'), {
          ...productData,
          created_at: now,
          created_at_ts: serverTimestamp(),
        });
        toast({ title: t('common:status.success'), description: t('productManagement.toasts.created') });
      }

      setIsModalOpen(false);
      resetForm();
      fetchProducts();
    } catch (error) {
      console.error('Error saving product:', error);
      toast({
        title: t('common:status.error'),
        description: t('productManagement.toasts.saveFailed'),
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('productManagement.confirmDelete')) || !currentOrganization?.id) return;

    try {
      await deleteDoc(doc(db, 'organizations', currentOrganization.id, 'products', id));
      toast({ title: t('common:status.success'), description: t('productManagement.toasts.deleted') });
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast({ title: t('common:status.error'), description: t('productManagement.toasts.deleteFailed'), variant: "destructive" });
    }
  };

  const toggleStatus = async (product: Product) => {
    if (!currentOrganization?.id) return;
    try {
      await updateDoc(doc(db, 'organizations', currentOrganization.id, 'products', product.id), { is_active: !product.is_active });
      toast({
        title: t('common:status.success'),
        description: !product.is_active
          ? t('productManagement.toasts.activated')
          : t('productManagement.toasts.deactivated'),
      });
      fetchProducts();
    } catch (error) {
      console.error('Error updating product status:', error);
      toast({ title: t('common:status.error'), description: t('productManagement.toasts.statusFailed'), variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">{t('productManagement.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">{t('productManagement.title')}</h2>
          <p className="text-muted-foreground">{t('productManagement.subtitle')}</p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4 me-2" />
          {t('productManagement.addProduct')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((product) => (
          <Card key={product.id} className="relative">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-lg">{product.name}</CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(product)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(product.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {product.description && (
                <CardDescription>{product.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t('productManagement.card.price')}</span>
                  <div className="flex items-center" dir="ltr">
                    <DollarSign className="h-4 w-4" />
                    <span className="font-medium">{product.price}</span>
                  </div>
                </div>

                {product.category && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('productManagement.card.category')}</span>
                    <Badge variant="outline">{product.category}</Badge>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t('productManagement.card.status')}</span>
                  <Switch
                    checked={product.is_active}
                    onCheckedChange={() => toggleStatus(product)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {products.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">{t('productManagement.emptyTitle')}</h3>
            <p className="text-muted-foreground mb-4">{t('productManagement.emptyDescription')}</p>
            <Button onClick={handleAdd}>
              <Plus className="h-4 w-4 me-2" />
              {t('productManagement.addProduct')}
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? t('productManagement.editProduct') : t('productManagement.addNewProduct')}
            </DialogTitle>
            <DialogDescription>
              {editingProduct ? t('productManagement.updateDescription') : t('productManagement.createDescription')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t('productManagement.fields.name')}</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder={t('productManagement.fields.namePlaceholder')}
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium">{t('productManagement.fields.description')}</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder={t('productManagement.fields.descriptionPlaceholder')}
              />
            </div>

            <div>
              <label className="text-sm font-medium">{t('productManagement.fields.price')}</label>
              <Input
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({...formData, price: e.target.value})}
                placeholder={t('productManagement.fields.pricePlaceholder')}
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium">{t('productManagement.fields.category')}</label>
              <Input
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                placeholder={t('productManagement.fields.categoryPlaceholder')}
              />
            </div>

            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
              />
              <label className="text-sm font-medium">{t('productManagement.fields.active')}</label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit">
                {editingProduct ? t('productManagement.updateProduct') : t('productManagement.addProduct')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductManagement;
