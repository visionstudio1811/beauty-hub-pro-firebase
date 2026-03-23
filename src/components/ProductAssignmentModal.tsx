
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Package, DollarSign } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
}

interface Client {
  id: string;
  name: string;
  email?: string;
  phone: string;
}

interface ProductAssignmentModalProps {
  product: Product | null;
  clients: Client[];
  isOpen: boolean;
  onClose: () => void;
  onAssign: () => void;
}

export const ProductAssignmentModal: React.FC<ProductAssignmentModalProps> = ({
  product,
  clients,
  isOpen,
  onClose,
  onAssign
}) => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [selectedClientId, setSelectedClientId] = useState('');
  const [assignedPrice, setAssignedPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (product && isOpen) {
      setAssignedPrice(product.price.toString());
      setQuantity('1');
      setNotes('');
      setSelectedClientId('');
    }
  }, [product, isOpen]);

  const handleAssign = async () => {
    if (!product || !selectedClientId || !assignedPrice) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    if (!currentOrganization?.id) {
      toast({ title: "Error", description: "No organization selected", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);

      await addDoc(
        collection(db, 'organizations', currentOrganization.id, 'productAssignments'),
        {
          product_id: product.id,
          client_id: selectedClientId,
          assigned_price: parseFloat(assignedPrice),
          quantity: parseInt(quantity),
          notes: notes.trim() || null,
          status: 'assigned',
          organization_id: currentOrganization.id,
          assigned_at: new Date().toISOString(),
          assigned_at_ts: serverTimestamp(),
        }
      );

      const selectedClient = clients.find(c => c.id === selectedClientId);
      toast({
        title: "Assignment Successful",
        description: `${product.name} has been assigned to ${selectedClient?.name}`
      });

      onAssign();
      onClose();
    } catch (error) {
      console.error('Error assigning product:', error);
      toast({
        title: "Error",
        description: "Failed to assign product",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!product) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Product to Client</DialogTitle>
          <DialogDescription>
            Assign "{product.name}" to a client with custom pricing
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Product Preview */}
          <div className="flex items-center space-x-3 p-3 bg-muted rounded-lg">
            <div className="w-12 h-12 bg-background rounded flex items-center justify-center overflow-hidden">
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <Package className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <h4 className="font-medium">{product.name}</h4>
              <p className="text-sm text-muted-foreground">Base Price: ${product.price}</p>
            </div>
          </div>

          {/* Client Selection */}
          <div>
            <label className="text-sm font-medium">Select Client *</label>
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    <div>
                      <div className="font-medium">{client.name}</div>
                      <div className="text-xs text-muted-foreground">{client.phone}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Assigned Price *</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  value={assignedPrice}
                  onChange={(e) => setAssignedPrice(e.target.value)}
                  placeholder="0.00"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Quantity</label>
              <Input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="1"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium">Notes (Optional)</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this assignment..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={loading}>
            {loading ? 'Assigning...' : 'Assign Product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
