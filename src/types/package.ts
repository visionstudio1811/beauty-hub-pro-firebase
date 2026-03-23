
export interface PackageFormData {
  name: string;
  description: string;
  treatments: string[]; // These will be treatment UUIDs, not names
  price: number;
  total_sessions: number;
  validity_months: number;
}
