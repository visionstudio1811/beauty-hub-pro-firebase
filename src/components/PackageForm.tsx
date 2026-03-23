
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { useSupabaseTreatments } from '@/hooks/useSupabaseTreatments';
import { usePackageForm } from '@/hooks/usePackageForm';
import { Package, usePackages } from '@/contexts/PackageContext';

interface PackageFormProps {
  isOpen: boolean;
  onClose: () => void;
  editingPackage: Package | null;
}

export const PackageForm: React.FC<PackageFormProps> = ({
  isOpen,
  onClose,
  editingPackage
}) => {
  const { treatments, loading: treatmentsLoading } = useSupabaseTreatments();
  const { addPackage, updatePackage } = usePackages();
  const {
    formData,
    setFormData,
    isSubmitting,
    setIsSubmitting,
    resetForm,
    loadPackageData,
    validateForm,
    toggleTreatment
  } = usePackageForm();

  React.useEffect(() => {
    if (editingPackage) {
      loadPackageData(editingPackage);
    } else {
      resetForm();
    }
  }, [editingPackage]);

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const packageData = {
        ...formData,
        name: formData.name.trim(),
        description: formData.description.trim(),
        price: Number(formData.price),
        total_sessions: Number(formData.total_sessions),
        validity_months: Number(formData.validity_months)
      };

      if (editingPackage) {
        await updatePackage(editingPackage.id, packageData);
      } else {
        await addPackage({
          ...packageData,
          is_active: true
        });
      }

      onClose();
      resetForm();
    } catch (error) {
      console.error('Package submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeModal = () => {
    onClose();
    resetForm();
    setIsSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={closeModal}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {editingPackage ? 'Edit Package' : 'Create New Package'}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {editingPackage ? 'Update package details' : 'Create a new treatment package for clients'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium">Package Name *</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="e.g., 6 Facials Package"
              disabled={isSubmitting}
              className="w-full mt-1 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Description</label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Brief description of the package"
              disabled={isSubmitting}
              className="w-full mt-1 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-sm font-medium">Total Price ($) *</label>
              <Input
                type="number"
                value={formData.price || ''}
                onChange={(e) => setFormData({...formData, price: parseFloat(e.target.value) || 0})}
                min="0"
                step="0.01"
                placeholder="0.00"
                disabled={isSubmitting}
                className="w-full mt-1 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Sessions *</label>
              <Input
                type="number"
                value={formData.total_sessions || ''}
                onChange={(e) => setFormData({...formData, total_sessions: parseInt(e.target.value) || 1})}
                min="1"
                placeholder="1"
                disabled={isSubmitting}
                className="w-full mt-1 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Validity (months) *</label>
              <Input
                type="number"
                value={formData.validity_months || ''}
                onChange={(e) => setFormData({...formData, validity_months: parseInt(e.target.value) || 1})}
                min="1"
                placeholder="12"
                disabled={isSubmitting}
                className="w-full mt-1 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Included Treatments *</label>
            {treatmentsLoading ? (
              <div className="flex items-center justify-center p-4 border border-dashed rounded text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-gray-500">Loading treatments...</span>
              </div>
            ) : treatments.length === 0 ? (
              <div className="text-sm text-gray-500 p-4 border border-dashed rounded">
                No treatments available. Please add treatments first in the Settings page.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-1 max-h-32 overflow-y-auto border rounded p-2">
                {treatments.map((treatment) => (
                  <label key={treatment.id} className="flex items-center space-x-2 p-2 border rounded cursor-pointer hover:bg-gray-50 w-full">
                    <input
                      type="checkbox"
                      checked={formData.treatments.includes(treatment.id)}
                      onChange={() => toggleTreatment(treatment.id)}
                      disabled={isSubmitting}
                      className="flex-shrink-0"
                    />
                    <span className="text-sm break-words min-w-0 flex-1">{treatment.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-4">
            <Button 
              onClick={handleSubmit} 
              className="w-full text-sm h-9"
              disabled={isSubmitting || treatmentsLoading}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {editingPackage ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                editingPackage ? 'Update Package' : 'Create Package'
              )}
            </Button>
            <Button 
              variant="outline" 
              onClick={closeModal} 
              className="w-full text-sm h-9"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
