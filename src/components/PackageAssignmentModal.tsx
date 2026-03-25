
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, Clock, Calendar, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Client } from '@/hooks/useClients';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSupabaseTreatments } from '@/hooks/useSupabaseTreatments';
import { syncMembershipStatus, logMembershipEvent } from '@/hooks/useMembershipSync';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Package {
  id: string;
  name: string;
  description: string;
  price: number;
  total_sessions: number;
  validity_months: number;
  treatments: string[];
  is_active: boolean;
}

interface PackageAssignmentModalProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onAssign: (client: Client, packageData: any) => void;
}

export const PackageAssignmentModal: React.FC<PackageAssignmentModalProps> = ({
  client,
  isOpen,
  onClose,
  onAssign
}) => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { treatments } = useSupabaseTreatments();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchPackages();
    }
  }, [isOpen, currentOrganization?.id]);

  const fetchPackages = async () => {
    if (!currentOrganization?.id) {
      setPackages([]);
      return;
    }
    setLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'packages'),
          where('is_active', '==', true),
          orderBy('name')
        )
      );
      setPackages(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name ?? '',
          description: data.description ?? '',
          price: data.price ?? 0,
          total_sessions: data.total_sessions ?? 0,
          validity_months: data.validity_months ?? 1,
          treatments: data.treatments ?? [],
          is_active: data.is_active ?? true,
        };
      }));
    } catch (error) {
      console.error('Error fetching packages:', error);
      toast({ title: "Error", description: "Failed to load packages", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleAssignPackage = async (packageData: Package) => {
    if (!client) return;
    if (!currentOrganization?.id) {
      toast({
        title: "Error",
        description: "No organization selected.",
        variant: "destructive"
      });
      return;
    }

    setAssigning(packageData.id);
    
    try {
      // Calculate expiry date
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + packageData.validity_months);

      console.log('Assigning package with data:', {
        client_id: client.id,
        package_id: packageData.id,
        total_amount: packageData.price,
        sessions_remaining: packageData.total_sessions,
        expiry_date: expiryDate.toISOString().split('T')[0],
        payment_status: 'active'
      });

      const now = new Date().toISOString();
      const purchaseRef = await addDoc(
        collection(db, 'organizations', currentOrganization.id, 'purchases'),
        {
          client_id: client.id,
          package_id: packageData.id,
          organization_id: currentOrganization.id,
          total_amount: packageData.price,
          sessions_remaining: packageData.total_sessions,
          expiry_date: expiryDate.toISOString().split('T')[0],
          payment_status: 'active',
          purchase_date: now.split('T')[0],
          created_at: now,
          created_at_ts: serverTimestamp(),
        }
      );
      const purchase = { id: purchaseRef.id };

      // Update membership status + log assignment event
      await syncMembershipStatus(currentOrganization.id, client.id, 'package_assigned');
      await logMembershipEvent(currentOrganization.id, client.id, 'package_assigned', {
        packageName: packageData.name,
        packageId: packageData.id,
        purchaseId: purchaseRef.id,
        totalSessions: packageData.total_sessions,
        price: packageData.price,
        expiryDate: expiryDate.toISOString().split('T')[0],
      });

      toast({
        title: "Package Assigned",
        description: `${packageData.name} has been assigned to ${client.name}. Package is now active and can be used for bookings.`
      });

      onAssign(client, { package: packageData, purchase });
      onClose();
    } catch (error) {
      console.error('Error assigning package:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Error",
        description: `Failed to assign package: ${msg}`,
        variant: "destructive"
      });
    } finally {
      setAssigning(null);
    }
  };

  if (!client) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Package className="h-5 w-5" />
            <span>Assign Package to {client.name}</span>
          </DialogTitle>
          <DialogDescription>
            Select a package to assign to this client. The package will be immediately available for booking appointments.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded animate-pulse"></div>
            ))}
          </div>
        ) : packages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No active packages available</p>
            <p className="text-sm">Create packages in Settings to assign them to clients.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {packages.map((pkg) => (
              <Card key={pkg.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{pkg.name}</span>
                    <Badge variant="secondary">${pkg.price}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {pkg.description && (
                    <p className="text-sm text-gray-600">{pkg.description}</p>
                  )}
                  
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{pkg.total_sessions} sessions</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{pkg.validity_months} months</span>
                    </div>
                  </div>

                  {pkg.treatments && pkg.treatments.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Includes:</p>
                      <div className="flex flex-wrap gap-1">
                        {pkg.treatments.slice(0, 3).map((treatmentId, index) => {
                          const name = treatments.find(t => t.id === treatmentId)?.name ?? treatmentId;
                          return (
                            <Badge key={index} variant="outline" className="text-xs">
                              {name}
                            </Badge>
                          );
                        })}
                        {pkg.treatments.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{pkg.treatments.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  <Button 
                    onClick={() => handleAssignPackage(pkg)}
                    className="w-full"
                    disabled={assigning === pkg.id}
                  >
                    {assigning === pkg.id ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Assigning...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Assign Package
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
