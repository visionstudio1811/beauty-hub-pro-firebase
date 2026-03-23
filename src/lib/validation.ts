
import { z } from 'zod';

// Client validation schema
export const clientSchema = z.object({
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters')
    .regex(/^[a-zA-Z\s\-'\.]+$/, 'Name contains invalid characters'),
  email: z.string()
    .email('Please enter a valid email address')
    .max(255, 'Email cannot exceed 255 characters')
    .optional()
    .or(z.literal('')),
  phone: z.string()
    .min(10, 'Phone number must be at least 10 digits')
    .max(20, 'Phone number cannot exceed 20 characters')
    .regex(/^[\+]?[\d\s\-\(\)]+$/, 'Please enter a valid phone number'),
  address: z.string()
    .max(500, 'Address cannot exceed 500 characters')
    .optional()
    .or(z.literal('')),
  city: z.string()
    .max(100, 'City cannot exceed 100 characters')
    .optional()
    .or(z.literal('')),
  date_of_birth: z.string()
    .optional()
    .or(z.literal('')),
  referral_source: z.string()
    .max(200, 'Referral source cannot exceed 200 characters')
    .optional()
    .or(z.literal('')),
  allergies: z.string()
    .max(1000, 'Allergies field cannot exceed 1000 characters')
    .optional()
    .or(z.literal('')),
  notes: z.string()
    .max(2000, 'Notes cannot exceed 2000 characters')
    .optional()
    .or(z.literal(''))
});

// Appointment validation schema
export const appointmentSchema = z.object({
  client_name: z.string()
    .min(2, 'Client name must be at least 2 characters')
    .max(100, 'Client name cannot exceed 100 characters')
    .regex(/^[a-zA-Z\s\-'\.]+$/, 'Client name contains invalid characters'),
  client_email: z.string()
    .email('Please enter a valid email address')
    .max(255, 'Email cannot exceed 255 characters'),
  client_phone: z.string()
    .min(10, 'Phone number must be at least 10 digits')
    .max(20, 'Phone number cannot exceed 20 characters')
    .regex(/^[\+]?[\d\s\-\(\)]+$/, 'Please enter a valid phone number'),
  treatment_name: z.string()
    .min(2, 'Treatment name must be at least 2 characters')
    .max(200, 'Treatment name cannot exceed 200 characters'),
  staff_name: z.string()
    .min(2, 'Staff name must be at least 2 characters')
    .max(100, 'Staff name cannot exceed 100 characters'),
  appointment_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Please enter a valid date (YYYY-MM-DD)'),
  appointment_time: z.string()
    .regex(/^\d{2}:\d{2}$/, 'Please enter a valid time (HH:MM)'),
  duration: z.number()
    .min(15, 'Duration must be at least 15 minutes')
    .max(480, 'Duration cannot exceed 8 hours'),
  status: z.enum(['scheduled', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show']),
  notes: z.string()
    .max(2000, 'Notes cannot exceed 2000 characters')
    .optional()
    .or(z.literal(''))
});

// Treatment validation schema
export const treatmentSchema = z.object({
  name: z.string()
    .min(2, 'Treatment name must be at least 2 characters')
    .max(200, 'Treatment name cannot exceed 200 characters')
    .regex(/^[a-zA-Z0-9\s\-&]+$/, 'Treatment name contains invalid characters'),
  description: z.string()
    .max(1000, 'Description cannot exceed 1000 characters')
    .optional()
    .or(z.literal('')),
  duration: z.number()
    .min(15, 'Duration must be at least 15 minutes')
    .max(480, 'Duration cannot exceed 8 hours'),
  price: z.number()
    .min(0, 'Price cannot be negative')
    .max(10000, 'Price cannot exceed $10,000')
    .optional(),
  category: z.string()
    .max(100, 'Category cannot exceed 100 characters')
    .optional()
    .or(z.literal(''))
});

// Staff validation schema
export const staffSchema = z.object({
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters')
    .regex(/^[a-zA-Z\s\-'\.]+$/, 'Name contains invalid characters'),
  email: z.string()
    .email('Please enter a valid email address')
    .max(255, 'Email cannot exceed 255 characters')
    .optional()
    .or(z.literal('')),
  phone: z.string()
    .min(10, 'Phone number must be at least 10 digits')
    .max(20, 'Phone number cannot exceed 20 characters')
    .regex(/^[\+]?[\d\s\-\(\)]+$/, 'Please enter a valid phone number')
    .optional()
    .or(z.literal('')),
  specialties: z.array(z.string().max(100)).optional()
});

// User creation validation schema
export const userCreationSchema = z.object({
  full_name: z.string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name cannot exceed 100 characters')
    .regex(/^[a-zA-Z\s\-'\.]+$/, 'Full name contains invalid characters'),
  email: z.string()
    .email('Please enter a valid email address')
    .max(255, 'Email cannot exceed 255 characters'),
  phone: z.string()
    .min(10, 'Phone number must be at least 10 digits')
    .max(20, 'Phone number cannot exceed 20 characters')
    .regex(/^[\+]?[\d\s\-\(\)]+$/, 'Please enter a valid phone number')
    .optional()
    .or(z.literal('')),
  role: z.enum(['staff', 'reception', 'beautician'], {
    errorMap: () => ({ message: 'Role must be staff, reception, or beautician' })
  })
});

// Text sanitization function
export const sanitizeText = (text: string): string => {
  if (!text) return '';
  
  // Remove HTML tags and potentially dangerous characters
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

// Validate and sanitize input
export const validateAndSanitize = <T>(schema: z.ZodSchema<T>, data: any): T => {
  // First sanitize string fields
  const sanitized = Object.keys(data).reduce((acc, key) => {
    const value = data[key];
    if (typeof value === 'string') {
      acc[key] = sanitizeText(value);
    } else {
      acc[key] = value;
    }
    return acc;
  }, {} as any);

  // Then validate
  return schema.parse(sanitized);
};
