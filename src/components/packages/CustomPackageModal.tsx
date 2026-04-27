
import React from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/contexts/OrganizationContext';
import { PackageForm } from '@/components/PackageForm';
import { Client } from '@/hooks/useClients';
import { syncMembershipStatus, logMembershipEvent } from '@/hooks/useMembershipSync';

interface CustomPackageModalProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

// Creates a per-client custom package in one step:
//   1. Writes a `packages` doc marked is_custom + client_id (hidden from the catalog).
//   2. Writes a `purchases` doc pointing at it with sessions_by_treatment derived
//      from the treatment quantities.
//   3. Syncs membership status and logs a package_assigned event so the history
//      tab reflects the assignment.
export const CustomPackageModal: React.FC<CustomPackageModalProps> = ({
  client,
  isOpen,
  onClose,
  onCreated,
}) => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  if (!client) return null;

  const handleSave = async (data: {
    name: string;
    description: string;
    treatment_items: { treatment_id: string; quantity: number }[];
    price: number;
    validity_months: number;
    total_sessions: number;
  }) => {
    if (!currentOrganization?.id) {
      toast({ title: 'Error', description: 'No organization selected.', variant: 'destructive' });
      throw new Error('No organization selected');
    }

    try {
      const pkgRef = await addDoc(
        collection(db, 'organizations', currentOrganization.id, 'packages'),
        {
          name: data.name,
          description: data.description,
          treatments: data.treatment_items.map(i => i.treatment_id),
          treatment_items: data.treatment_items,
          price: data.price,
          total_sessions: data.total_sessions,
          validity_months: data.validity_months,
          is_active: true,
          is_custom: true,
          client_id: client.id,
          organization_id: currentOrganization.id,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        },
      );

      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + data.validity_months);

      const now = new Date().toISOString();
      const purchaseRef = await addDoc(
        collection(db, 'organizations', currentOrganization.id, 'purchases'),
        {
          client_id: client.id,
          package_id: pkgRef.id,
          organization_id: currentOrganization.id,
          total_amount: data.price,
          sessions_remaining: data.total_sessions,
          sessions_by_treatment: data.treatment_items.map(i => ({
            treatment_id: i.treatment_id,
            remaining: i.quantity,
            total: i.quantity,
          })),
          expiry_date: expiryDate.toISOString().split('T')[0],
          payment_status: 'active',
          purchase_date: now.split('T')[0],
          created_at: now,
          created_at_ts: serverTimestamp(),
          is_custom: true,
        },
      );

      await syncMembershipStatus(currentOrganization.id, client.id, 'package_assigned');
      await logMembershipEvent(currentOrganization.id, client.id, 'package_assigned', {
        packageName: data.name,
        packageId: pkgRef.id,
        purchaseId: purchaseRef.id,
        totalSessions: data.total_sessions,
        price: data.price,
        expiryDate: expiryDate.toISOString().split('T')[0],
        isCustom: true,
      });

      toast({
        title: 'Custom Package Created',
        description: `${data.name} has been assigned to ${client.name}.`,
      });

      onCreated?.();
    } catch (err) {
      console.error('Error creating custom package:', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({
        title: 'Error',
        description: `Failed to create custom package: ${msg}`,
        variant: 'destructive',
      });
      throw err;
    }
  };

  return (
    <PackageForm
      isOpen={isOpen}
      onClose={onClose}
      editingPackage={null}
      onSave={handleSave}
      titleOverride={`Custom Package for ${client.name}`}
      submitLabelOverride="Create & Assign"
    />
  );
};
