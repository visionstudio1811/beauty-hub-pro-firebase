
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Package, ShoppingBag, Trash2 } from 'lucide-react';
import { usePackages } from '@/contexts/PackageContext';
import { useDropdownData } from '@/contexts/DropdownDataContext';
import { useTranslation } from 'react-i18next';

interface Purchase {
  id: number;
  type: 'package' | 'product';
  name: string;
  price: number;
  date: string;
  status: string;
  sessions?: {
    total: number;
    used: number;
    remaining: number;
  };
}

interface PurchaseEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchases: Purchase[];
  onUpdatePurchases: (purchases: Purchase[]) => void;
}

export const PurchaseEditModal: React.FC<PurchaseEditModalProps> = ({
  isOpen,
  onClose,
  purchases,
  onUpdatePurchases
}) => {
  const { t } = useTranslation('packages');
  const { packages } = usePackages();
  const { dropdownData } = useDropdownData();
  // Callers pass free-form status strings (e.g. 'Completed'); normalise to a
  // lowercase key and resolve via common:status.* then common:labels.*,
  // falling back to the raw value if neither has a translation.
  const statusLabel = (status: string) => {
    const key = String(status ?? '').trim().toLowerCase();
    if (!key) return status;
    return t(`common:status.${key}`, {
      defaultValue: t(`common:labels.${key}`, { defaultValue: status }),
    });
  };
  const [newPurchase, setNewPurchase] = useState({
    type: 'package' as 'package' | 'product',
    name: '',
    price: 0,
    sessions: 5
  });

  // Filter only active packages
  const activePackages = packages.filter(pkg => pkg.is_active);
  
  // Get products from dropdown data (we'll filter by 'products' category)
  const products = dropdownData.referralSources.filter(item => 
    item.toLowerCase().includes('serum') || 
    item.toLowerCase().includes('cream') || 
    item.toLowerCase().includes('cleanser') ||
    item.toLowerCase().includes('moisturizer') ||
    item.toLowerCase().includes('product')
  );

  // Create mock product prices for now (in a real app, you'd have a products table)
  const getProductPrice = (productName: string) => {
    const productPrices: { [key: string]: number } = {
      'Vitamin C Serum': 89,
      'Moisturizer': 65,
      'Cleanser': 45,
      'Anti-Aging Cream': 120,
      'Hydrating Serum': 75,
      'Facial Oil': 95
    };
    return productPrices[productName] || 50;
  };

  const handleAddPurchase = () => {
    if (!newPurchase.name || newPurchase.price <= 0) return;

    const purchase: Purchase = {
      id: Date.now(),
      type: newPurchase.type,
      name: newPurchase.name,
      price: newPurchase.price,
      date: new Date().toISOString().split('T')[0],
      status: 'active',
      ...(newPurchase.type === 'package' && {
        sessions: {
          total: newPurchase.sessions,
          used: 0,
          remaining: newPurchase.sessions
        }
      })
    };

    onUpdatePurchases([...purchases, purchase]);
    setNewPurchase({ type: 'package', name: '', price: 0, sessions: 5 });
  };

  const handleRemovePurchase = (purchaseId: number) => {
    onUpdatePurchases(purchases.filter(p => p.id !== purchaseId));
  };

  const handleItemSelect = (itemName: string) => {
    if (newPurchase.type === 'package') {
      const selectedPackage = activePackages.find(p => p.name === itemName);
      if (selectedPackage) {
        setNewPurchase({
          type: 'package',
          name: selectedPackage.name,
          price: Number(selectedPackage.price),
          sessions: selectedPackage.total_sessions
        });
      }
    } else {
      // Handle product selection
      const productPrice = getProductPrice(itemName);
      setNewPurchase({
        type: 'product',
        name: itemName,
        price: productPrice,
        sessions: 0
      });
    }
  };

  const availableItems = newPurchase.type === 'package' ? activePackages : products;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('purchaseEditModal.title')}</DialogTitle>
          <DialogDescription>
            {t('purchaseEditModal.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add New Purchase */}
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-medium">{t('purchaseEditModal.addNew')}</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{t('purchaseEditModal.type')}</label>
                <Select value={newPurchase.type} onValueChange={(value: 'package' | 'product') => setNewPurchase({...newPurchase, type: value, name: '', price: 0})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="package">{t('purchaseEditModal.package')}</SelectItem>
                    <SelectItem value="product">{t('purchaseEditModal.product')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">{t('purchaseEditModal.item')}</label>
                <Select value={newPurchase.name} onValueChange={handleItemSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('purchaseEditModal.selectItem')} />
                  </SelectTrigger>
                  <SelectContent>
                    {newPurchase.type === 'package' ? (
                      activePackages.map((pkg) => (
                        <SelectItem key={pkg.id} value={pkg.name}>
                          {t('purchaseEditModal.packageOption', { name: pkg.name, price: pkg.price, count: pkg.total_sessions })}
                        </SelectItem>
                      ))
                    ) : (
                      products.map((product) => (
                        <SelectItem key={product} value={product}>
                          {t('purchaseEditModal.productOption', { name: product, price: getProductPrice(product) })}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">{t('purchaseEditModal.price')}</label>
                <Input
                  type="number"
                  value={newPurchase.price}
                  onChange={(e) => setNewPurchase({...newPurchase, price: Number(e.target.value)})}
                />
              </div>

              {newPurchase.type === 'package' && (
                <div>
                  <label className="text-sm font-medium">{t('purchaseEditModal.sessions')}</label>
                  <Input
                    type="number"
                    value={newPurchase.sessions}
                    onChange={(e) => setNewPurchase({...newPurchase, sessions: Number(e.target.value)})}
                  />
                </div>
              )}
            </div>

            <Button onClick={handleAddPurchase} disabled={!newPurchase.name || newPurchase.price <= 0}>
              {t('purchaseEditModal.addPurchase')}
            </Button>
          </div>

          {/* Existing Purchases */}
          <div className="space-y-4">
            <h3 className="font-medium">{t('purchaseEditModal.current')}</h3>
            {purchases.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">{t('purchaseEditModal.empty')}</p>
            ) : (
              purchases.map((purchase) => (
                <div key={purchase.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-2 rtl:space-x-reverse">
                      {purchase.type === 'package' ? 
                        <Package className="h-4 w-4 text-purple-600" /> : 
                        <ShoppingBag className="h-4 w-4 text-green-600" />
                      }
                      <div>
                        <h4 className="font-medium">{purchase.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {purchase.type === 'package' ? t('purchaseEditModal.package') : t('purchaseEditModal.product')} • ${purchase.price}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 rtl:space-x-reverse">
                      <Badge>{statusLabel(purchase.status)}</Badge>
                      <p className="text-sm text-muted-foreground">{purchase.date}</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleRemovePurchase(purchase.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {purchase.sessions && (
                    <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                      {t('purchaseEditModal.sessionsUsed', { used: purchase.sessions.used, total: purchase.sessions.total, remaining: purchase.sessions.remaining })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-2 rtl:space-x-reverse pt-4 border-t">
          <Button onClick={onClose}>{t('common:actions.close')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
