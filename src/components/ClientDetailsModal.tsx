import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { User, Package, ShoppingBag, Calendar, Plus, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useDropdownData } from '@/contexts/DropdownDataContext';
import { PurchaseEditModal } from '@/components/PurchaseEditModal';
import { Client } from '@/hooks/useClients';

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

interface Appointment {
  id: number;
  date: string;
  time: string;
  treatment: string;
  staff: string;
  status: string;
  notes?: string;
  duration: number;
  price: number;
}

interface ClientDetailsModalProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (client: Client) => Promise<void>;
  isEditing: boolean;
}

export const ClientDetailsModal: React.FC<ClientDetailsModalProps> = ({
  client,
  isOpen,
  onClose,
  onSave,
  isEditing
}) => {
  const { toast } = useToast();
  const { dropdownData } = useDropdownData();
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    birthday: '',
    address: '',
    notes: '',
    city: '',
    referral_source: ''
  });
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);

  // Update form data when client changes
  useEffect(() => {
    if (client) {
      setFormData({
        name: client.name || '',
        phone: client.phone || '',
        email: client.email || '',
        birthday: client.birthday || '',
        address: client.address || '',
        notes: client.notes || '',
        city: client.city || '',
        referral_source: client.referral_source || ''
      });
      setPurchases(client.purchases || []);
    }
  }, [client]);

  const handleSave = () => {
    if (!client) return;
    
    const totalRevenue = purchases.reduce((sum, purchase) => sum + purchase.price, 0);
    
    const updatedClient = {
      ...client,
      ...formData,
      purchases,
      totalRevenue
    };
    
    onSave(updatedClient);
    toast({
      title: "Client Updated",
      description: "Client information has been updated successfully."
    });
    onClose();
  };

  const handleUpdatePurchases = (newPurchases: Purchase[]) => {
    setPurchases(newPurchases);
  };

  const handleClearHistory = () => {
    if (!client) return;
    
    const updatedClient = {
      ...client,
      ...formData,
      purchases: [],
      appointments: [],
      totalRevenue: 0,
      totalVisits: 0,
      lastVisit: 'Never'
    };
    
    onSave(updatedClient);
    toast({
      title: "History Cleared",
      description: "All appointment and purchase history has been cleared."
    });
    onClose();
  };

  if (!client) return null;

  // Mock appointment history
  const mockAppointments: Appointment[] = [
    {
      id: 1,
      date: '2025-06-01',
      time: '10:00 AM',
      treatment: 'Classic Facial',
      staff: 'Sarah Johnson',
      status: 'Completed',
      notes: 'Client requested extra focus on T-zone',
      duration: 60,
      price: 80
    },
    {
      id: 2,
      date: '2025-05-15',
      time: '2:00 PM',
      treatment: 'Glow Dermaplane Facial',
      staff: 'Maria Garcia',
      status: 'Completed',
      notes: 'First dermaplaning treatment, tolerated well',
      duration: 75,
      price: 120
    },
    {
      id: 3,
      date: '2025-05-01',
      time: '11:30 AM',
      treatment: 'LED Skin Tightening',
      staff: 'Jennifer Kim',
      status: 'Completed',
      duration: 45,
      price: 150
    }
  ];

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>{isEditing ? 'Edit Client' : 'Client Details'}</span>
            </DialogTitle>
            <DialogDescription>
              {isEditing ? 'Update client information' : 'View client details and purchase history'}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="purchases">Purchases</TabsTrigger>
              <TabsTrigger value="appointments">Appointments</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    disabled={!isEditing}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Phone</label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    disabled={!isEditing}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    disabled={!isEditing}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Birthday</label>
                  <Input
                    type="date"
                    value={formData.birthday}
                    onChange={(e) => setFormData({...formData, birthday: e.target.value})}
                    disabled={!isEditing}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">City</label>
                  {isEditing ? (
                    <select
                      value={formData.city}
                      onChange={(e) => setFormData({...formData, city: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Select City</option>
                      {dropdownData.cities.map((city) => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  ) : (
                    <Input value={formData.city} disabled />
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium">How did you hear about us?</label>
                  {isEditing ? (
                    <select
                      value={formData.referral_source}
                      onChange={(e) => setFormData({...formData, referral_source: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Select Source</option>
                      {dropdownData.referralSources.map((source) => (
                        <option key={source} value={source}>{source}</option>
                      ))}
                    </select>
                  ) : (
                    <Input value={formData.referral_source} disabled />
                  )}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Address</label>
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  disabled={!isEditing}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Notes</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  disabled={!isEditing}
                />
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <div>Status: <Badge>{client.status}</Badge></div>
                <div>Total Visits: {client.totalVisits}</div>
                <div>Last Visit: {client.lastVisit}</div>
                <div>Total Revenue: ${purchases.reduce((sum, p) => sum + p.price, 0)}</div>
                <div>Review: <span className={client.reviewReceived ? 'text-green-600' : 'text-yellow-600'}>
                  {client.reviewReceived ? 'Received' : 'Pending'}
                </span></div>
              </div>
            </TabsContent>

            <TabsContent value="purchases" className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">Purchase History</h3>
                <Button onClick={() => setIsPurchaseModalOpen(true)} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Manage Purchases
                </Button>
              </div>
              
              <div className="space-y-4">
                {purchases.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No purchases yet</p>
                  </div>
                ) : (
                  purchases.map((purchase) => (
                    <div key={purchase.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center space-x-2">
                          {purchase.type === 'package' ? 
                            <Package className="h-4 w-4 text-purple-600" /> : 
                            <ShoppingBag className="h-4 w-4 text-green-600" />
                          }
                          <div>
                            <h4 className="font-medium">{purchase.name}</h4>
                            <p className="text-sm text-muted-foreground">
                              {purchase.type === 'package' ? 'Package' : 'Product'} • ${purchase.price}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge>{purchase.status}</Badge>
                          <p className="text-sm text-muted-foreground mt-1">{purchase.date}</p>
                        </div>
                      </div>
                      {purchase.sessions && (
                        <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                          Sessions: {purchase.sessions.used}/{purchase.sessions.total} used 
                          ({purchase.sessions.remaining} remaining)
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="appointments" className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">Appointment History</h3>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-4 w-4 mr-1" />
                      Clear All History
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear All History</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete all appointment and purchase history for this client. 
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearHistory} className="bg-red-600 hover:bg-red-700">
                        Clear History
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div className="space-y-4">
                {mockAppointments.map((appointment) => (
                  <div key={appointment.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-blue-600" />
                        <div>
                          <h4 className="font-medium">{appointment.treatment}</h4>
                          <p className="text-sm text-muted-foreground">
                            {appointment.date} at {appointment.time} • {appointment.duration} min
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Staff: {appointment.staff}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={appointment.status === 'Completed' ? 'default' : 'secondary'}>
                          {appointment.status}
                        </Badge>
                        <p className="text-sm text-muted-foreground mt-1">${appointment.price}</p>
                      </div>
                    </div>
                    {appointment.notes && (
                      <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                        <strong>Notes:</strong> {appointment.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {isEditing && (
              <Button onClick={handleSave}>
                Save Changes
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <PurchaseEditModal
        isOpen={isPurchaseModalOpen}
        onClose={() => setIsPurchaseModalOpen(false)}
        purchases={purchases}
        onUpdatePurchases={handleUpdatePurchases}
      />
    </>
  );
};
