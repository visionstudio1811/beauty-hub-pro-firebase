
import React, { useState, useEffect } from 'react';
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
const SCOPE_LABELS: Record<CategoryScope, string> = {
  product: 'Products',
  treatment: 'Facials',
};

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
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

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
      toast({ title: "Error", description: "Failed to load categories", variant: "destructive" });
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
        title: "Validation Error",
        description: "Please enter a category name",
        variant: "destructive"
      });
      return;
    }

    if (formData.applies_to.length === 0) {
      toast({
        title: "Validation Error",
        description: "Pick at least one entity (Products or Facials).",
        variant: "destructive"
      });
      return;
    }

    if (!currentOrganization?.id) {
      toast({ title: "Error", description: "No organization selected", variant: "destructive" });
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
        toast({ title: "Success", description: "Category updated successfully" });
      } else {
        await addDoc(collection(db, 'organizations', currentOrganization.id, 'productCategories'), {
          ...categoryData,
          created_at: now,
          created_at_ts: serverTimestamp(),
        });
        toast({ title: "Success", description: "Category created successfully" });
      }

      setIsModalOpen(false);
      resetForm();
      fetchCategories();
    } catch (error) {
      console.error('Error saving category:', error);
      toast({ title: "Error", description: "Failed to save category", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category? Products using this category will have their category removed.')) return;

    try {
      await deleteDoc(doc(db, 'organizations', currentOrganization!.id, 'productCategories', id));
      toast({ title: "Success", description: "Category deleted successfully" });
      fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast({ title: "Error", description: "Failed to delete category", variant: "destructive" });
    }
  };

  const toggleStatus = async (category: ProductCategory) => {
    try {
      await updateDoc(doc(db, 'organizations', currentOrganization!.id, 'productCategories', category.id), { is_active: !category.is_active });
      toast({ title: "Success", description: `Category ${!category.is_active ? 'activated' : 'deactivated'}` });
      fetchCategories();
    } catch (error) {
      console.error('Error updating category status:', error);
      toast({ title: "Error", description: "Failed to update category status", variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading categories...</div>;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-purple-600" />
            Categories
          </CardTitle>
          <Button onClick={handleAdd} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Category
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
              <div className="flex items-center space-x-3">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{category.name}</span>
                    <Badge variant={category.is_active ? "default" : "secondary"}>
                      {category.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {category.applies_to.map(scope => (
                      <Badge key={scope} variant="outline" className="text-xs">
                        {SCOPE_LABELS[scope]}
                      </Badge>
                    ))}
                  </div>
                  {category.description && (
                    <p className="text-sm text-muted-foreground">{category.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-2">
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
              <h3 className="text-lg font-medium mb-2">No categories yet</h3>
              <p className="text-muted-foreground mb-4">Create categories to organize your products and facials.</p>
              <Button onClick={handleAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Add Category
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
              {editingCategory ? 'Edit Category' : 'Add New Category'}
            </DialogTitle>
            <DialogDescription>
              {editingCategory ? 'Update category information' : 'Create a category for products, facials, or both'}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Category Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="Enter category name"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Enter category description (optional)"
                rows={3}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Sort Order</label>
              <Input
                type="number"
                value={formData.sort_order}
                onChange={(e) => setFormData({...formData, sort_order: parseInt(e.target.value) || 0})}
                placeholder="0"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Applies to *</label>
              <p className="text-xs text-muted-foreground mb-2">
                Where this category appears as a dropdown option.
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
                      <span className="text-sm">{SCOPE_LABELS[scope]}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
              />
              <label className="text-sm font-medium">Active</label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingCategory ? 'Update Category' : 'Add Category'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
