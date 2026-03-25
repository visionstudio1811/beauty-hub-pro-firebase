import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, Calendar, Clock, Save, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Client } from '@/hooks/useClients';
import {
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { ClientPackage } from '@/hooks/useClientPackages';
import { syncMembershipStatus, logMembershipEvent } from '@/hooks/useMembershipSync';

interface PurchaseManagementModalProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export const PurchaseManagementModal: React.FC<PurchaseManagementModalProps> = ({
  client,
  isOpen,
  onClose,
  onUpdate
}) => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [packages, setPackages] = useState<ClientPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingPackage, setEditingPackage] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{[key: string]: {sessions: number, expiry: string}}>({});

  useEffect(() => {
    if (isOpen && client) {
      fetchClientPackages();
    }
  }, [isOpen, client]);

  const fetchClientPackages = async () => {
    if (!client || !currentOrganization?.id) return;

    setLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'purchases'),
          where('client_id', '==', client.id),
          where('payment_status', '==', 'active')
        )
      );

      const transformedPackages: ClientPackage[] = await Promise.all(
        snap.docs.map(async (d) => {
          const purchase = d.data();
          let pkgData: any = {};
          if (purchase.package_id) {
            const pkgSnap = await getDoc(doc(db, 'organizations', currentOrganization.id!, 'packages', purchase.package_id));
            if (pkgSnap.exists()) pkgData = pkgSnap.data();
          }
          return {
            id: d.id,
            package_id: purchase.package_id || '',
            package_name: pkgData.name || '',
            package_description: pkgData.description || '',
            sessions_remaining: purchase.sessions_remaining || 0,
            total_sessions: pkgData.total_sessions || 0,
            expiry_date: purchase.expiry_date || null,
            payment_status: purchase.payment_status || '',
            treatments: pkgData.treatments || [],
            price: pkgData.price || 0,
          };
        })
      );

      setPackages(transformedPackages);
      
      // Initialize edit values
      const initialEditValues: {[key: string]: {sessions: number, expiry: string}} = {};
      transformedPackages.forEach(pkg => {
        initialEditValues[pkg.id] = {
          sessions: pkg.sessions_remaining,
          expiry: pkg.expiry_date || ''
        };
      });
      setEditValues(initialEditValues);
    } catch (error) {
      console.error('Error fetching client packages:', error);
      toast({
        title: "Error",
        description: "Failed to load client packages",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePackage = async (packageId: string) => {
    try {
      const editValue = editValues[packageId];
      if (!editValue) return;

      const updateData: any = {
        sessions_remaining: editValue.sessions,
        updated_at: serverTimestamp(),
      };

      if (editValue.expiry) {
        updateData.expiry_date = editValue.expiry;
      }

      if (!currentOrganization?.id || !client) return;
      await updateDoc(doc(db, 'organizations', currentOrganization.id, 'purchases', packageId), updateData);

      // Re-evaluate membership status after editing sessions/expiry
      await syncMembershipStatus(currentOrganization.id, client.id, 'sessions_edited');
      await logMembershipEvent(currentOrganization.id, client.id, 'sessions_edited', {
        purchaseId: packageId,
        newSessions: editValue.sessions,
        newExpiry: editValue.expiry || null,
      });

      toast({
        title: "Package Updated",
        description: "Package details have been updated successfully."
      });

      setEditingPackage(null);
      fetchClientPackages();
      onUpdate();
    } catch (error) {
      console.error('Error updating package:', error);
      toast({
        title: "Error",
        description: "Failed to update package",
        variant: "destructive"
      });
    }
  };

  const handleDeletePackage = async (packageId: string, packageName: string) => {
    if (!confirm(`Are you sure you want to remove the ${packageName} package?`)) {
      return;
    }

    try {
      if (!currentOrganization?.id || !client) return;
      await deleteDoc(doc(db, 'organizations', currentOrganization.id, 'purchases', packageId));

      // Re-evaluate membership — if this was the last active package, flip to false
      await syncMembershipStatus(currentOrganization.id, client.id, 'package_removed');
      await logMembershipEvent(currentOrganization.id, client.id, 'package_removed', {
        purchaseId: packageId,
        packageName,
      });

      toast({
        title: "Package Removed",
        description: `${packageName} has been removed from ${client.name}.`
      });

      fetchClientPackages();
      onUpdate();
    } catch (error) {
      console.error('Error deleting package:', error);
      toast({
        title: "Error",
        description: "Failed to remove package",
        variant: "destructive"
      });
    }
  };

  const formatExpiryDate = (dateString: string | null) => {
    if (!dateString) return 'No expiry';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  if (!client) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Package className="h-5 w-5" />
            <span>Manage {client.name}'s Packages</span>
          </DialogTitle>
          <DialogDescription>
            Edit sessions remaining, expiry dates, or remove packages for this client.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded animate-pulse"></div>
            ))}
          </div>
        ) : packages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No packages assigned to this client</p>
            <p className="text-sm">Assign packages to manage them here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {packages.map((pkg) => (
              <Card key={pkg.id} className="relative">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">{pkg.package_name}</h3>
                      <p className="text-sm text-gray-600">{pkg.package_description}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        <span>${pkg.price}</span>
                        <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50">
                          Active
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeletePackage(pkg.id, pkg.package_name)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">
                        Sessions Remaining
                      </label>
                      {editingPackage === pkg.id ? (
                        <Input
                          type="number"
                          min="0"
                          max={pkg.total_sessions}
                          value={editValues[pkg.id]?.sessions || 0}
                          onChange={(e) => setEditValues(prev => ({
                            ...prev,
                            [pkg.id]: {
                              ...prev[pkg.id],
                              sessions: parseInt(e.target.value) || 0
                            }
                          }))}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-gray-400" />
                          <span>{pkg.sessions_remaining} of {pkg.total_sessions}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">
                        Expiry Date
                      </label>
                      {editingPackage === pkg.id ? (
                        <Input
                          type="date"
                          value={editValues[pkg.id]?.expiry || ''}
                          onChange={(e) => setEditValues(prev => ({
                            ...prev,
                            [pkg.id]: {
                              ...prev[pkg.id],
                              expiry: e.target.value
                            }
                          }))}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span>{formatExpiryDate(pkg.expiry_date)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-end">
                      {editingPackage === pkg.id ? (
                        <div className="flex gap-2 w-full">
                          <Button
                            onClick={() => handleUpdatePackage(pkg.id)}
                            size="sm"
                            className="flex-1"
                          >
                            <Save className="h-4 w-4 mr-1" />
                            Save
                          </Button>
                          <Button
                            onClick={() => setEditingPackage(null)}
                            variant="outline"
                            size="sm"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          onClick={() => setEditingPackage(pkg.id)}
                          variant="outline"
                          size="sm"
                          className="w-full"
                        >
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
