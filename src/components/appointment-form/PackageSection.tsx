
import React from 'react';
import { Label } from '@/components/ui/label';
import { ClientPackageSelector } from '@/components/ClientPackageSelector';
import { Package } from 'lucide-react';
import { ClientPackage } from '@/hooks/useClientPackages';
import { Client } from '@/hooks/useClients';

interface PackageSectionProps {
  selectedClient: Client | null;
  clientPackages: ClientPackage[];
  selectedPackage: ClientPackage | null;
  onSelectPackage: (packageItem: ClientPackage | null) => void;
  loading: boolean;
}

export const PackageSection: React.FC<PackageSectionProps> = ({
  selectedClient,
  clientPackages,
  selectedPackage,
  onSelectPackage,
  loading
}) => {
  if (!selectedClient) return null;

  return (
    <div className="border rounded-lg p-4 bg-gray-50">
      <div className="flex items-center gap-2 mb-3">
        <Package className="h-4 w-4" />
        <Label>Client Packages</Label>
      </div>
      <ClientPackageSelector
        packages={clientPackages}
        selectedPackage={selectedPackage}
        onSelectPackage={onSelectPackage}
        loading={loading}
      />
    </div>
  );
};
