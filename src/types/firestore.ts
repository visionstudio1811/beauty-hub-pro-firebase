export interface UserProfile {
  uid: string;
  email: string;
  phone: string;
  fullName: string;
  role: 'admin' | 'staff' | 'reception' | 'beautician';
  organizationId: string | null;
  organizationRole: string | null;
  isActive: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  timezone: string; // IANA timezone e.g. "America/New_York"
  settings?: Record<string, any>;
  isActive: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface Client {
  id: string;
  organizationId: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  dateOfBirth?: string;
  gender?: 'female' | 'male' | '';
  age?: number;
  allergies?: string;
  hasMembership: boolean;
  acuityCustomerId?: string;
  notes?: string;
  deletedAt?: any;
  deletedBy?: string;
  createdAt: any;
  updatedAt: any;
}

export interface Appointment {
  id: string;
  organizationId: string;
  clientId: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  staffId: string;
  staffName: string;
  treatmentId: string;
  treatmentName: string;
  appointmentDate: string;
  appointmentTime: string;
  duration: number;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  notes?: string;
  packageId?: string;
  roomId?: string;
  acuityAppointmentId?: string;
  createdAt: any;
  updatedAt: any;
}

export interface Treatment {
  id: string;
  organizationId: string;
  name: string;
  price: number;
  duration: number;
  category?: string;
  color?: string;
  isActive: boolean;
  createdAt: any;
}

export interface Package {
  id: string;
  organizationId: string;
  name: string;
  price: number;
  totalSessions: number;
  validityMonths: number;
  treatments: string[];
  isActive: boolean;
  createdAt: any;
}

export interface Purchase {
  id: string;
  organizationId: string;
  clientId: string;
  packageId: string;
  sessionsRemaining: number;
  totalAmount: number;
  paymentStatus: string;
  expiryDate?: string;
  createdAt: any;
}

export interface StaffMember {
  id: string;
  organizationId: string;
  name: string;
  email?: string;
  phone?: string;
  specialties?: string[];
  isActive: boolean;
  createdAt: any;
}

export interface Product {
  id: string;
  organizationId: string;
  name: string;
  price: number;
  category?: string;
  brand?: string;
  imageUrl?: string;
  isActive: boolean;
  createdAt: any;
}

export interface BusinessHours {
  id: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  breakStart?: string;
  breakEnd?: string;
  isOpen: boolean;
}

export interface WaiverTemplate {
  id: string;
  organizationId: string;
  title: string;
  content: any;
  createdAt: any;
}

export interface ClientWaiver {
  id: string;
  clientId: string;
  templateId: string;
  status: 'pending' | 'signed';
  token: string;
  signedAt?: any;
  signerName?: string;
  signerIp?: string;
  answers?: any;
  pdfUrl?: string;
  createdAt: any;
}

export interface InvoiceTreatmentLine {
  treatment_id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
}

export interface InvoiceBundledProduct {
  product_id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
}

export interface InvoiceLineItem {
  type: 'package' | 'product' | 'treatment' | 'addon';
  name: string;
  description: string;
  // package_id is set when type === 'package', null/absent for standalone products.
  package_id?: string | null;
  // product_id is set when type === 'product'.
  product_id?: string | null;
  // treatment_id is set when type === 'treatment'.
  treatment_id?: string | null;
  // addon_id is set when type === 'addon'.
  addon_id?: string | null;
  treatments?: InvoiceTreatmentLine[];
  bundled_products?: InvoiceBundledProduct[];
  quantity: number;
  unit_price_cents: number;
  subtotal_cents: number;
}

export interface InvoiceClientSnapshot {
  name: string;
  email: string;
  phone: string;
  address: string;
}

export interface InvoiceBusinessSnapshot {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
  tax_id: string;
  payment_terms: string;
  notes: string;
  timezone: string;
  invoice_template?: string;
}

export interface InvoiceDraftLine {
  // 'product', 'treatment', or 'addon' line. Matches the LineKind on CreateInvoiceDialog.
  kind: 'product' | 'treatment' | 'addon';
  // For products: product_id. For treatments: treatment_id. For add-ons: addon_id.
  // The single field name keeps the draft shape uniform; the consumer maps it back.
  item_id: string;
  quantity: number;
  unit_price: number;
  // Optional cached name so the drafts list can render without a catalog read.
  name?: string;
}

export interface InvoiceDraft {
  id: string;
  client_id: string | null;
  purchase_id: string | null;
  lines: InvoiceDraftLine[];
  payment_method?: string;
  notes?: string;
  created_at: any;
  updated_at: any;
  created_by: string;
  updated_by: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  invoice_number_int: number;
  issued_at: any;
  // Null for standalone product-only invoices that aren't tied to a purchase doc.
  purchase_id: string | null;
  client_id: string;
  client_snapshot: InvoiceClientSnapshot;
  business_snapshot: InvoiceBusinessSnapshot;
  line_items: InvoiceLineItem[];
  subtotal_cents: number;
  tax_rate: number;
  tax_amount_cents: number;
  total_cents: number;
  currency: string;
  pdf_url: string | null;
  pdf_storage_path: string | null;
  status: 'issued' | 'void';
  payment_method?: string;
  voided_at?: any;
  voided_by?: string;
  created_at: any;
  created_by: string;
}
