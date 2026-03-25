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
  stockQuantity: number;
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
