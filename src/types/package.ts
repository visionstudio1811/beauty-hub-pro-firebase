
export interface TreatmentItem {
  treatment_id: string;
  quantity: number;
}

export interface PackageFormData {
  name: string;
  description: string;
  treatment_items: TreatmentItem[];
  price: number;
  validity_months: number;
}
