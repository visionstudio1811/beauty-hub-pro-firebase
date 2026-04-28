
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { useSupabaseTreatments } from '@/hooks/useSupabaseTreatments';
import { usePackageForm } from '@/hooks/usePackageForm';
import { Package, usePackages } from '@/contexts/PackageContext';
import { PackageFormData } from '@/types/package';
import { useToast } from '@/hooks/use-toast';

interface PackageFormProps {
  isOpen: boolean;
  onClose: () => void;
  editingPackage: Package | null;
  // When provided, this replaces the default catalog save. Used by the
  // per-client custom-package flow to persist a hidden package + purchase
  // in one step instead of hitting the shared catalog path.
  onSave?: (data: PackageFormData & { total_sessions: number }) => Promise<void>;
  titleOverride?: string;
  submitLabelOverride?: string;
}

export const PackageForm: React.FC<PackageFormProps> = ({
  isOpen,
  onClose,
  editingPackage,
  onSave,
  titleOverride,
  submitLabelOverride,
}) => {
  const { treatments, loading: treatmentsLoading } = useSupabaseTreatments();
  const { addPackage, updatePackage } = usePackages();
  const { toast } = useToast();
  const {
    formData,
    setFormData,
    isSubmitting,
    setIsSubmitting,
    totalSessions,
    resetForm,
    loadPackageData,
    validateForm,
    toggleTreatment,
    setTreatmentQuantity,
  } = usePackageForm();

  React.useEffect(() => {
    if (editingPackage) {
      loadPackageData(editingPackage);
    } else {
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingPackage, isOpen]);

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setIsSubmitting(true);

    try {
      const payload = {
        ...formData,
        name: formData.name.trim(),
        description: formData.description.trim(),
        price: Number(formData.price),
        validity_months: Number(formData.validity_months),
        total_sessions: totalSessions,
      };

      if (onSave) {
        await onSave(payload);
      } else if (editingPackage) {
        await updatePackage(editingPackage.id, {
          name: payload.name,
          description: payload.description,
          treatment_items: payload.treatment_items,
          price: payload.price,
          validity_months: payload.validity_months,
        });
      } else {
        await addPackage({
          name: payload.name,
          description: payload.description,
          treatments: payload.treatment_items.map(i => i.treatment_id),
          treatment_items: payload.treatment_items,
          price: payload.price,
          total_sessions: payload.total_sessions,
          validity_months: payload.validity_months,
          is_active: true,
        });
      }

      onClose();
      resetForm();
    } catch (error) {
      console.error('Package submission error:', error);
      toast({
        title: editingPackage ? 'Failed to update package' : 'Failed to create package',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeModal = () => {
    onClose();
    resetForm();
    setIsSubmitting(false);
  };

  const quantityFor = (treatmentId: string) =>
    formData.treatment_items.find(i => i.treatment_id === treatmentId)?.quantity ?? 0;

  return (
    <Dialog open={isOpen} onOpenChange={closeModal}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {titleOverride ?? (editingPackage ? 'Edit Package' : 'Create New Package')}
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
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., 6 Facials Package"
              disabled={isSubmitting}
              className="w-full mt-1 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Description</label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                min="0"
                step="0.01"
                placeholder="0.00"
                disabled={isSubmitting}
                className="w-full mt-1 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Validity (months) *</label>
              <Input
                type="number"
                value={formData.validity_months || ''}
                onChange={(e) => setFormData({ ...formData, validity_months: parseInt(e.target.value) || 1 })}
                min="1"
                placeholder="12"
                disabled={isSubmitting}
                className="w-full mt-1 text-sm"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Included Treatments *</label>
              <span className="text-xs text-muted-foreground">
                Total sessions: <span className="font-semibold text-foreground">{totalSessions}</span>
              </span>
            </div>
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
              <div className="grid grid-cols-1 gap-1 max-h-64 overflow-y-auto border rounded p-2">
                {treatments.map((treatment) => {
                  const qty = quantityFor(treatment.id);
                  const included = qty > 0;
                  return (
                    <div
                      key={treatment.id}
                      className="flex items-center gap-3 p-2 border rounded w-full"
                    >
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={() => toggleTreatment(treatment.id)}
                        disabled={isSubmitting}
                        className="flex-shrink-0"
                        aria-label={`Include ${treatment.name}`}
                      />
                      <span className="text-sm break-words min-w-0 flex-1">{treatment.name}</span>
                      <Input
                        type="number"
                        min="0"
                        value={included ? qty : ''}
                        placeholder="0"
                        onChange={(e) => {
                          const next = parseInt(e.target.value, 10);
                          setTreatmentQuantity(treatment.id, Number.isFinite(next) ? next : 0);
                        }}
                        disabled={isSubmitting || !included}
                        className="w-20 text-sm h-8"
                        aria-label={`Sessions of ${treatment.name}`}
                      />
                    </div>
                  );
                })}
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
                submitLabelOverride ?? (editingPackage ? 'Update Package' : 'Create Package')
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
