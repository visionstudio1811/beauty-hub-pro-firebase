
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Package, DollarSign } from 'lucide-react';
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
  is_active: boolean;
  stock_quantity?: number;
  created_at: string;
  updated_at: string;
}

const ProductManagement = () => {
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
    is_active: true,
    stock_quantity: ''
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
          is_active: data.is_active ?? true,
          stock_quantity: data.stock_quantity ?? undefined,
          created_at: data.created_at ?? '',
          updated_at: data.updated_at ?? '',
        };
      }));
    } catch (error) {
      console.error('Error fetching products:', error);
      toast({ title: "Error", description: "Failed to load products", variant: "destructive" });
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
      is_active: true,
      stock_quantity: ''
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
      is_active: product.is_active,
      stock_quantity: product.stock_quantity?.toString() || ''
    });
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.price) {
      toast({
        title: "Validation Error",
        description: "Please fill in name and price",
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
        stock_quantity: formData.stock_quantity ? parseInt(formData.stock_quantity) : null,
        updated_at: now,
      };

      if (editingProduct) {
        await updateDoc(doc(db, 'organizations', currentOrganization.id, 'products', editingProduct.id), productData);
        toast({ title: "Success", description: "Product updated successfully" });
      } else {
        await addDoc(collection(db, 'organizations', currentOrganization.id, 'products'), {
          ...productData,
          created_at: now,
          created_at_ts: serverTimestamp(),
        });
        toast({ title: "Success", description: "Product created successfully" });
      }

      setIsModalOpen(false);
      resetForm();
      fetchProducts();
    } catch (error) {
      console.error('Error saving product:', error);
      toast({
        title: "Error",
        description: "Failed to save product",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?') || !currentOrganization?.id) return;

    try {
      await deleteDoc(doc(db, 'organizations', currentOrganization.id, 'products', id));
      toast({ title: "Success", description: "Product deleted successfully" });
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast({ title: "Error", description: "Failed to delete product", variant: "destructive" });
    }
  };

  const toggleStatus = async (product: Product) => {
    if (!currentOrganization?.id) return;
    try {
      await updateDoc(doc(db, 'organizations', currentOrganization.id, 'products', product.id), { is_active: !product.is_active });
      toast({ title: "Success", description: `Product ${!product.is_active ? 'activated' : 'deactivated'}` });
      fetchProducts();
    } catch (error) {
      console.error('Error updating product status:', error);
      toast({ title: "Error", description: "Failed to update product status", variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading products...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Product Management</h2>
          <p className="text-muted-foreground">Manage your products and inventory</p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add Product
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
                  <span className="text-sm text-muted-foreground">Price:</span>
                  <div className="flex items-center">
                    <DollarSign className="h-4 w-4" />
                    <span className="font-medium">{product.price}</span>
                  </div>
                </div>
                
                {product.category && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Category:</span>
                    <Badge variant="outline">{product.category}</Badge>
                  </div>
                )}
                
                {product.stock_quantity !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Stock:</span>
                    <div className="flex items-center">
                      <Package className="h-4 w-4 mr-1" />
                      <span>{product.stock_quantity}</span>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status:</span>
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
            <h3 className="text-lg font-medium mb-2">No products yet</h3>
            <p className="text-muted-foreground mb-4">Get started by adding your first product.</p>
            <Button onClick={handleAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? 'Edit Product' : 'Add New Product'}
            </DialogTitle>
            <DialogDescription>
              {editingProduct ? 'Update product information' : 'Enter product details'}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Product Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="Enter product name"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Enter product description"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Price *</label>
              <Input
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({...formData, price: e.target.value})}
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium">Category</label>
              <Input
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                placeholder="Enter category"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Stock Quantity</label>
              <Input
                type="number"
                value={formData.stock_quantity}
                onChange={(e) => setFormData({...formData, stock_quantity: e.target.value})}
                placeholder="Enter stock quantity"
              />
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
                {editingProduct ? 'Update Product' : 'Add Product'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductManagement;
