
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Package as PackageIcon, Loader2 } from 'lucide-react';
import { usePackages, Package } from '@/contexts/PackageContext';
import { PackageCard } from './PackageCard';
import { PackageForm } from './PackageForm';

export const PackageManagement: React.FC = () => {
  const { packages, loading, error, deletePackage, togglePackageStatus } = usePackages();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);

  const openAddModal = () => {
    setEditingPackage(null);
    setIsModalOpen(true);
  };

  const openEditModal = (pkg: Package) => {
    setEditingPackage(pkg);
    setIsModalOpen(true);
  };

  const handleDelete = async (pkg: Package) => {
    try {
      await deletePackage(pkg.id);
    } catch (error) {
      console.error('Package deletion error:', error);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPackage(null);
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PackageIcon className="h-5 w-5 text-purple-600" />
            Package Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2 text-sm">Loading packages...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PackageIcon className="h-5 w-5 text-purple-600" />
            Package Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-600">
            <p className="text-sm">Error loading packages: {error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col space-y-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <CardTitle className="flex items-center gap-2 min-w-0 flex-1 text-lg">
            <PackageIcon className="h-5 w-5 text-purple-600 flex-shrink-0" />
            <span className="truncate">Package Management</span>
          </CardTitle>
          <Button onClick={openAddModal} className="w-full sm:w-auto shrink-0">
            <Plus className="h-4 w-4 mr-2" />
            Add Package
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {packages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <PackageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">No packages found. Create your first package to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {packages.map((pkg) => (
              <PackageCard
                key={pkg.id}
                package={pkg}
                onEdit={openEditModal}
                onDelete={handleDelete}
                onToggleStatus={togglePackageStatus}
              />
            ))}
          </div>
        )}

        <PackageForm
          isOpen={isModalOpen}
          onClose={closeModal}
          editingPackage={editingPackage}
        />
      </CardContent>
    </Card>
  );
};
