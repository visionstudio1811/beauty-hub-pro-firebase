
import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ShoppingBag, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Client } from '@/hooks/useClients';
import { ProductAssignmentModal } from '@/components/ProductAssignmentModal';

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  stock_quantity?: number;
  image_url?: string;
  is_active: boolean;
}

interface AssignmentModalProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onAssign: (client: Client, type: 'package' | 'product', item: any) => void;
}

export const AssignmentModal: React.FC<AssignmentModalProps> = ({
  client,
  isOpen,
  onClose,
  onAssign
}) => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [isProductAssignModalOpen, setIsProductAssignModalOpen] = React.useState(false);
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(null);

  // Fetch real products from Firestore
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'products'),
          where('is_active', '==', true),
          orderBy('name')
        )
      );
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
    },
    enabled: isOpen && !!currentOrganization?.id,
  });

  const handleProductAssign = (product: Product) => {
    setSelectedProduct(product);
    setIsProductAssignModalOpen(true);
  };

  const getStockStatus = (stockQuantity?: number) => {
    if (!stockQuantity || stockQuantity === 0) return 'out-of-stock';
    if (stockQuantity <= 5) return 'low-stock';
    return 'in-stock';
  };

  const getStockBadgeColor = (status: string) => {
    switch (status) {
      case 'in-stock':
        return 'bg-green-100 text-green-800';
      case 'low-stock':
        return 'bg-yellow-100 text-yellow-800';
      case 'out-of-stock':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (!client) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Product</DialogTitle>
            <DialogDescription>
              Assign a product to {client.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="text-muted-foreground">Loading products...</div>
              </div>
            ) : products.length === 0 ? (
              <div className="flex justify-center py-8">
                <div className="text-muted-foreground">No active products found</div>
              </div>
            ) : (
              products.map((product) => {
                const stockStatus = getStockStatus(product.stock_quantity);
                return (
                  <div key={product.id} className="border rounded-lg p-4 flex justify-between items-center">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-muted rounded flex items-center justify-center overflow-hidden">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <ShoppingBag className="h-5 w-5 text-green-600" />
                        )}
                      </div>
                      <div>
                        <h4 className="font-medium">{product.name}</h4>
                        <p className="text-sm text-gray-600">{product.description}</p>
                        <div className="flex space-x-2 text-sm text-gray-500 mt-1">
                          <span>${product.price}</span>
                          {product.category && (
                            <>
                              <span>•</span>
                              <span>{product.category}</span>
                            </>
                          )}
                          <span>•</span>
                          <Badge className={getStockBadgeColor(stockStatus)}>
                            {product.stock_quantity || 0} in stock
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <Button 
                      onClick={() => handleProductAssign(product)}
                      disabled={stockStatus === 'out-of-stock'}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Assign
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Assignment Modal */}
      {selectedProduct && (
        <ProductAssignmentModal
          product={selectedProduct}
          clients={[client]}
          isOpen={isProductAssignModalOpen}
          onClose={() => {
            setIsProductAssignModalOpen(false);
            setSelectedProduct(null);
          }}
          onAssign={() => {
            setIsProductAssignModalOpen(false);
            setSelectedProduct(null);
            onClose();
            toast({
              title: "Product Assigned",
              description: `${selectedProduct?.name} has been assigned to ${client.name}`
            });
          }}
        />
      )}
    </>
  );
};
