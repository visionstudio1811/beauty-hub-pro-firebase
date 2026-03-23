
import { useState } from 'react';
import { Package } from '@/contexts/PackageContext';
import { PackageFormData } from '@/types/package';
import { useToast } from '@/hooks/use-toast';

export const usePackageForm = () => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<PackageFormData>({
    name: '',
    description: '',
    treatments: [], // Now stores treatment UUIDs
    price: 0,
    total_sessions: 1,
    validity_months: 12
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      treatments: [],
      price: 0,
      total_sessions: 1,
      validity_months: 12
    });
  };

  const loadPackageData = (pkg: Package) => {
    setFormData({
      name: pkg.name,
      description: pkg.description,
      treatments: pkg.treatments, // These are already UUIDs from the database
      price: pkg.price,
      total_sessions: pkg.total_sessions,
      validity_months: pkg.validity_months
    });
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Package name is required.",
        variant: "destructive"
      });
      return false;
    }

    if (formData.treatments.length === 0) {
      toast({
        title: "Validation Error", 
        description: "Please select at least one treatment.",
        variant: "destructive"
      });
      return false;
    }

    if (formData.price <= 0) {
      toast({
        title: "Validation Error",
        description: "Price must be greater than 0.",
        variant: "destructive"
      });
      return false;
    }

    if (formData.total_sessions <= 0) {
      toast({
        title: "Validation Error",
        description: "Sessions must be greater than 0.",
        variant: "destructive"
      });
      return false;
    }

    if (formData.validity_months <= 0) {
      toast({
        title: "Validation Error",
        description: "Validity period must be greater than 0.",
        variant: "destructive"
      });
      return false;
    }

    return true;
  };

  const toggleTreatment = (treatmentId: string) => {
    setFormData(prev => ({
      ...prev,
      treatments: prev.treatments.includes(treatmentId)
        ? prev.treatments.filter(id => id !== treatmentId)
        : [...prev.treatments, treatmentId]
    }));
  };

  return {
    formData,
    setFormData,
    isSubmitting,
    setIsSubmitting,
    resetForm,
    loadPackageData,
    validateForm,
    toggleTreatment
  };
};
