
import { useState } from 'react';
import { Package } from '@/contexts/PackageContext';
import { PackageFormData, TreatmentItem } from '@/types/package';
import { useToast } from '@/hooks/use-toast';

const initialState = (): PackageFormData => ({
  name: '',
  description: '',
  treatment_items: [],
  price: 0,
  validity_months: 12,
});

export const usePackageForm = () => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<PackageFormData>(initialState());

  const resetForm = () => {
    setFormData(initialState());
  };

  const loadPackageData = (pkg: Package) => {
    // Prefer treatment_items when present. For legacy packages, reconstruct from
    // treatments[] + total_sessions by distributing sessions evenly across treatments
    // (remainder goes to the first slots) — admin can edit before saving.
    let items: TreatmentItem[] = [];
    if (pkg.treatment_items && pkg.treatment_items.length > 0) {
      items = pkg.treatment_items.map(i => ({ treatment_id: i.treatment_id, quantity: i.quantity }));
    } else if (pkg.treatments?.length) {
      const n = pkg.treatments.length;
      const base = Math.floor((pkg.total_sessions || 0) / n);
      const extra = (pkg.total_sessions || 0) - base * n;
      items = pkg.treatments.map((tid, idx) => ({
        treatment_id: tid,
        quantity: base + (idx < extra ? 1 : 0),
      }));
    }
    setFormData({
      name: pkg.name,
      description: pkg.description,
      treatment_items: items,
      price: pkg.price,
      validity_months: pkg.validity_months,
    });
  };

  const setTreatmentQuantity = (treatmentId: string, quantity: number) => {
    setFormData(prev => {
      const idx = prev.treatment_items.findIndex(i => i.treatment_id === treatmentId);
      if (quantity <= 0) {
        if (idx === -1) return prev;
        const next = [...prev.treatment_items];
        next.splice(idx, 1);
        return { ...prev, treatment_items: next };
      }
      if (idx === -1) {
        return {
          ...prev,
          treatment_items: [...prev.treatment_items, { treatment_id: treatmentId, quantity }],
        };
      }
      const next = [...prev.treatment_items];
      next[idx] = { ...next[idx], quantity };
      return { ...prev, treatment_items: next };
    });
  };

  const toggleTreatment = (treatmentId: string) => {
    setFormData(prev => {
      const idx = prev.treatment_items.findIndex(i => i.treatment_id === treatmentId);
      if (idx === -1) {
        return {
          ...prev,
          treatment_items: [...prev.treatment_items, { treatment_id: treatmentId, quantity: 1 }],
        };
      }
      const next = [...prev.treatment_items];
      next.splice(idx, 1);
      return { ...prev, treatment_items: next };
    });
  };

  const totalSessions = formData.treatment_items.reduce((sum, i) => sum + (i.quantity || 0), 0);

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      toast({ title: 'Validation Error', description: 'Package name is required.', variant: 'destructive' });
      return false;
    }
    if (formData.treatment_items.length === 0) {
      toast({ title: 'Validation Error', description: 'Please select at least one treatment.', variant: 'destructive' });
      return false;
    }
    if (formData.treatment_items.some(i => !Number.isFinite(i.quantity) || i.quantity < 1)) {
      toast({
        title: 'Validation Error',
        description: 'Each selected treatment must have a quantity of at least 1.',
        variant: 'destructive',
      });
      return false;
    }
    if (formData.price <= 0) {
      toast({ title: 'Validation Error', description: 'Price must be greater than 0.', variant: 'destructive' });
      return false;
    }
    if (formData.validity_months <= 0) {
      toast({
        title: 'Validation Error',
        description: 'Validity period must be greater than 0.',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  return {
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
  };
};
