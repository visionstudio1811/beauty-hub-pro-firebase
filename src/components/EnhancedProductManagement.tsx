
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Package, DollarSign, Users, Filter, Search, Upload, X } from 'lucide-react';
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
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
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
import { Textarea } from '@/components/ui/textarea';
import { ProductAssignmentModal } from '@/components/ProductAssignmentModal';

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  is_active: boolean;
  stock_quantity?: number;
  image_url?: string;
  created_at: string;
  updated_at: string;
}

interface ProductCategory {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
}

interface Client {
  id: string;
  name: string;
  email?: string;
  phone: string;
}

const EnhancedProductManagement = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: '',
    is_active: true,
    stock_quantity: '',
    image_url: ''
  });

  useEffect(() => {
    if (currentOrganization?.id) fetchData();
  }, [currentOrganization?.id]);

  const fetchData = async () => {
    if (!currentOrganization?.id) return;
    try {
      setLoading(true);
      const orgId = currentOrganization.id;

      // Fetch products
      const productsSnap = await getDocs(
        query(collection(db, 'organizations', orgId, 'products'), orderBy('name'))
      );
      setProducts(productsSnap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name ?? '',
          description: data.description ?? undefined,
          price: data.price ?? 0,
          category: data.category ?? undefined,
          is_active: data.is_active ?? true,
          stock_quantity: data.stock_quantity ?? undefined,
          image_url: data.image_url ?? undefined,
          created_at: data.created_at ?? '',
          updated_at: data.updated_at ?? '',
        } as Product;
      }));

      // Fetch categories (active only, ordered by sort_order)
      const categoriesSnap = await getDocs(
        query(
          collection(db, 'organizations', orgId, 'productCategories'),
          where('is_active', '==', true),
          orderBy('sort_order')
        )
      );
      setCategories(categoriesSnap.docs.map(d => ({
        id: d.id,
        name: d.data().name ?? '',
        description: d.data().description ?? undefined,
        is_active: d.data().is_active ?? true,
      } as ProductCategory)));

      // Fetch clients for assignment
      const clientsSnap = await getDocs(
        query(collection(db, 'organizations', orgId, 'clients'), orderBy('name'))
      );
      setClients(clientsSnap.docs
        .filter(d => !d.data().deleted_at)
        .map(d => ({
          id: d.id,
          name: d.data().name ?? '',
          email: d.data().email ?? undefined,
          phone: d.data().phone ?? '',
        } as Client))
      );

    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    try {
      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `product-images/${currentOrganization?.id}/${fileName}`;

      const storageRef = ref(storage, filePath);
      await uploadBytes(storageRef, file);
      const publicUrl = await getDownloadURL(storageRef);

      setFormData(prev => ({ ...prev, image_url: publicUrl }));

      toast({
        title: "Success",
        description: "Image uploaded successfully"
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: "Error",
        description: "Failed to upload image",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      price: '',
      category: '',
      is_active: true,
      stock_quantity: '',
      image_url: ''
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
      stock_quantity: product.stock_quantity?.toString() || '',
      image_url: product.image_url || ''
    });
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleAssign = (product: Product) => {
    setSelectedProduct(product);
    setIsAssignModalOpen(true);
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

    if (!currentOrganization?.id) {
      toast({ title: "Error", description: "No organization selected", variant: "destructive" });
      return;
    }

    try {
      const orgId = currentOrganization.id;
      const now = new Date().toISOString();
      const productData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        price: parseFloat(formData.price),
        category: formData.category || null,
        is_active: formData.is_active,
        stock_quantity: formData.stock_quantity ? parseInt(formData.stock_quantity) : null,
        image_url: formData.image_url || null,
        organization_id: orgId,
        updated_at: now,
      };

      if (editingProduct) {
        await updateDoc(doc(db, 'organizations', orgId, 'products', editingProduct.id), productData);
        toast({
          title: "Success",
          description: "Product updated successfully"
        });
      } else {
        await addDoc(collection(db, 'organizations', orgId, 'products'), {
          ...productData,
          created_at: now,
          created_at_ts: serverTimestamp(),
        });
        toast({
          title: "Success",
          description: "Product created successfully"
        });
      }

      setIsModalOpen(false);
      resetForm();
      fetchData();
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
    if (!confirm('Are you sure you want to delete this product?')) return;
    if (!currentOrganization?.id) return;

    try {
      await deleteDoc(doc(db, 'organizations', currentOrganization.id, 'products', id));
      toast({
        title: "Success",
        description: "Product deleted successfully"
      });
      fetchData();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast({
        title: "Error",
        description: "Failed to delete product",
        variant: "destructive"
      });
    }
  };

  const toggleStatus = async (product: Product) => {
    if (!currentOrganization?.id) return;
    try {
      await updateDoc(doc(db, 'organizations', currentOrganization.id, 'products', product.id), {
        is_active: !product.is_active,
        updated_at: new Date().toISOString(),
      });
      toast({
        title: "Success",
        description: `Product ${!product.is_active ? 'activated' : 'deactivated'}`
      });
      fetchData();
    } catch (error) {
      console.error('Error updating product status:', error);
      toast({
        title: "Error",
        description: "Failed to update product status",
        variant: "destructive"
      });
    }
  };

  // Filter products based on search and filters
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
    
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'active' && product.is_active) ||
                         (statusFilter === 'inactive' && !product.is_active);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading products...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Product Management</h2>
          <p className="text-muted-foreground">Manage your products and inventory</p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add Product
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 p-4 bg-muted/50 rounded-lg">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.name}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProducts.map((product) => (
          <Card key={product.id} className="relative group hover:shadow-lg transition-shadow">
            {/* Product Image */}
            <div className="aspect-square relative overflow-hidden rounded-t-lg bg-muted">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
              {!product.is_active && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Badge variant="secondary">Inactive</Badge>
                </div>
              )}
            </div>

            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-lg line-clamp-1">{product.name}</CardTitle>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                <CardDescription className="line-clamp-2">{product.description}</CardDescription>
              )}
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">${product.price}</span>
                {product.category && (
                  <Badge variant="outline">{product.category}</Badge>
                )}
              </div>
              
              {product.stock_quantity !== null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Stock:</span>
                  <span className={product.stock_quantity <= 5 ? 'text-red-500 font-medium' : ''}>
                    {product.stock_quantity} units
                  </span>
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <Switch
                  checked={product.is_active}
                  onCheckedChange={() => toggleStatus(product)}
                />
                <Button
                  size="sm"
                  onClick={() => handleAssign(product)}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Users className="h-4 w-4 mr-1" />
                  Assign
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredProducts.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">
              {products.length === 0 ? 'No products yet' : 'No products match your filters'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {products.length === 0 
                ? 'Get started by adding your first product.' 
                : 'Try adjusting your search or filter criteria.'
              }
            </p>
            {products.length === 0 && (
              <Button onClick={handleAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Product Form Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? 'Edit Product' : 'Add New Product'}
            </DialogTitle>
            <DialogDescription>
              {editingProduct ? 'Update product information' : 'Enter product details'}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Image Upload */}
            <div>
              <label className="text-sm font-medium">Product Image</label>
              <div className="mt-2">
                {formData.image_url ? (
                  <div className="relative w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg overflow-hidden">
                    <img
                      src={formData.image_url}
                      alt="Product preview"
                      className="w-full h-full object-cover"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-1 right-1"
                      onClick={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file);
                        }}
                        className="hidden"
                        id="image-upload"
                        disabled={uploading}
                      />
                      <label
                        htmlFor="image-upload"
                        className="text-sm text-gray-500 cursor-pointer hover:text-gray-700"
                      >
                        {uploading ? 'Uploading...' : 'Upload Image'}
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Enter product description"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Category</label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({...formData, category: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.name}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <Button type="submit" disabled={uploading}>
                {editingProduct ? 'Update Product' : 'Add Product'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Product Assignment Modal */}
      {selectedProduct && (
        <ProductAssignmentModal
          product={selectedProduct}
          clients={clients}
          isOpen={isAssignModalOpen}
          onClose={() => {
            setIsAssignModalOpen(false);
            setSelectedProduct(null);
          }}
          onAssign={() => {
            setIsAssignModalOpen(false);
            setSelectedProduct(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
};

export default EnhancedProductManagement;
