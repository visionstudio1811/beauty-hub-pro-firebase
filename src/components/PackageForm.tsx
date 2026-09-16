
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { useSupabaseTreatments } from '@/hooks/useSupabaseTreatments';
import { usePackageForm } from '@/hooks/usePackageForm';
import { Package, usePackages } from '@/contexts/PackageContext';
import { PackageFormData } from '@/types/package';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/contexts/OrganizationContext';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useTranslation } from 'react-i18next';

interface OrgProduct {
  id: string;
  name: string;
  price: number;
}

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
  // Optional extra UI rendered inside the form (e.g. a purchase-date picker
  // for the per-client custom-package flow).
  extraFields?: React.ReactNode;
}

export const PackageForm: React.FC<PackageFormProps> = ({
  isOpen,
  onClose,
  editingPackage,
  onSave,
  titleOverride,
  submitLabelOverride,
  extraFields,
}) => {
  const { t } = useTranslation('packages');
  const { treatments, loading: treatmentsLoading } = useSupabaseTreatments();
  const { addPackage, updatePackage } = usePackages();
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [orgProducts, setOrgProducts] = useState<OrgProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
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
    toggleProduct,
    setProductQuantity,
    setProductPrice,
  } = usePackageForm();

  React.useEffect(() => {
    if (editingPackage) {
      loadPackageData(editingPackage);
    } else {
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingPackage, isOpen]);

  useEffect(() => {
    if (!isOpen || !currentOrganization?.id) return;
    setProductsLoading(true);
    getDocs(query(collection(db, 'organizations', currentOrganization.id, 'products'), orderBy('name')))
      .then(snap => setOrgProducts(snap.docs.map(d => ({ id: d.id, name: d.data().name || '', price: d.data().price ?? 0 }))))
      .catch(() => {})
      .finally(() => setProductsLoading(false));
  }, [isOpen, currentOrganization?.id]);

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
          product_items: payload.product_items,
          price: payload.price,
          validity_months: payload.validity_months,
        });
      } else {
        await addPackage({
          name: payload.name,
          description: payload.description,
          treatments: payload.treatment_items.map(i => i.treatment_id),
          treatment_items: payload.treatment_items,
          product_items: payload.product_items,
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
        title: editingPackage ? t('packageForm.toast.updateFailed') : t('packageForm.toast.createFailed'),
        description: t('packageForm.toast.tryAgain'),
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
            {titleOverride ?? (editingPackage ? t('packageForm.editTitle') : t('packageForm.createTitle'))}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {editingPackage ? t('packageForm.editDescription') : t('packageForm.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium">{t('packageForm.fields.name')}</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('packageForm.fields.namePlaceholder')}
              disabled={isSubmitting}
              className="w-full mt-1 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium">{t('packageForm.fields.description')}</label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={t('packageForm.fields.descriptionPlaceholder')}
              disabled={isSubmitting}
              className="w-full mt-1 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-sm font-medium">{t('packageForm.fields.price')}</label>
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
              <label className="text-sm font-medium">{t('packageForm.fields.validity')}</label>
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

          {extraFields}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">{t('packageForm.fields.includedTreatments')}</label>
              <span className="text-xs text-muted-foreground">
                {t('packageForm.fields.totalSessions')} <span className="font-semibold text-foreground">{totalSessions}</span>
              </span>
            </div>
            {treatmentsLoading ? (
              <div className="flex items-center justify-center p-4 border border-dashed rounded text-sm">
                <Loader2 className="h-4 w-4 animate-spin me-2" />
                <span className="text-gray-500">{t('packageForm.loadingTreatments')}</span>
              </div>
            ) : treatments.length === 0 ? (
              <div className="text-sm text-gray-500 p-4 border border-dashed rounded">
                {t('packageForm.noTreatments')}
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
                        aria-label={t('packageForm.aria.include', { name: treatment.name })}
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
                        aria-label={t('packageForm.aria.sessionsOf', { name: treatment.name })}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">{t('packageForm.fields.includedProducts')}</label>
              <span className="text-xs text-muted-foreground">{t('packageForm.fields.optional')}</span>
            </div>
            {productsLoading ? (
              <div className="flex items-center p-4 border border-dashed rounded text-sm">
                <Loader2 className="h-4 w-4 animate-spin me-2" />
                <span className="text-gray-500">{t('packageForm.loadingProducts')}</span>
              </div>
            ) : orgProducts.length === 0 ? (
              <div className="text-sm text-gray-500 p-3 border border-dashed rounded">
                {t('packageForm.noProducts')}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto border rounded p-2">
                {orgProducts.map(product => {
                  const included = formData.product_items.find(i => i.product_id === product.id);
                  return (
                    <div key={product.id} className="flex items-center gap-2 p-1.5 border rounded">
                      <input
                        type="checkbox"
                        checked={!!included}
                        onChange={() => toggleProduct(product.id, product.price)}
                        disabled={isSubmitting}
                        className="flex-shrink-0"
                        aria-label={t('packageForm.aria.include', { name: product.name })}
                      />
                      <span className="text-sm flex-1 truncate">{product.name}</span>
                      <Input
                        type="number"
                        min="1"
                        value={included ? included.quantity : ''}
                        placeholder={t('packageForm.fields.qtyPlaceholder')}
                        onChange={e => setProductQuantity(product.id, parseInt(e.target.value, 10) || 1)}
                        disabled={isSubmitting || !included}
                        className="w-16 text-xs h-7"
                        aria-label={t('packageForm.aria.quantityOf', { name: product.name })}
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={included ? included.price : ''}
                        placeholder="$"
                        onChange={e => setProductPrice(product.id, parseFloat(e.target.value) || 0)}
                        disabled={isSubmitting || !included}
                        className="w-20 text-xs h-7"
                        aria-label={t('packageForm.aria.priceOf', { name: product.name })}
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
                  <Loader2 className="h-4 w-4 me-2 animate-spin" />
                  {editingPackage ? t('packageForm.updating') : t('packageForm.creating')}
                </>
              ) : (
                submitLabelOverride ?? (editingPackage ? t('packageForm.updatePackage') : t('packageForm.createPackage'))
              )}
            </Button>
            <Button
              variant="outline"
              onClick={closeModal}
              className="w-full text-sm h-9"
              disabled={isSubmitting}
            >
              {t('common:actions.cancel')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
