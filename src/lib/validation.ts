
import { z } from 'zod';

// NOTE: schemas carry no inline messages on purpose. Every issue is rendered in
// the active UI language by the global error map in src/i18n/zodErrorMap.ts
// (namespace `validation`, with per-field overrides under `fieldMessages`).
// Name/treatment regexes are Unicode-aware so Hebrew input is accepted.

// Client validation schema
export const clientSchema = z.object({
  name: z.string()
    .min(2)
    .max(100)
    .regex(/^[\p{L}\p{M}\s\-'.]+$/u),
  email: z.string()
    .email()
    .max(255)
    .optional()
    .or(z.literal('')),
  phone: z.string()
    .min(10)
    .max(20)
    .regex(/^[\+]?[\d\s\-\(\)]+$/),
  address: z.string()
    .max(500)
    .optional()
    .or(z.literal('')),
  city: z.string()
    .max(100)
    .optional()
    .or(z.literal('')),
  date_of_birth: z.string()
    .optional()
    .or(z.literal('')),
  referral_source: z.string()
    .max(200)
    .optional()
    .or(z.literal('')),
  allergies: z.string()
    .max(1000)
    .optional()
    .or(z.literal('')),
  notes: z.string()
    .max(2000)
    .optional()
    .or(z.literal(''))
});

// Appointment validation schema
export const appointmentSchema = z.object({
  client_name: z.string()
    .min(2)
    .max(100)
    .regex(/^[\p{L}\p{M}\s\-'.]+$/u),
  client_email: z.string()
    .email()
    .max(255),
  client_phone: z.string()
    .min(10)
    .max(20)
    .regex(/^[\+]?[\d\s\-\(\)]+$/),
  treatment_name: z.string()
    .min(2)
    .max(200),
  staff_name: z.string()
    .min(2)
    .max(100),
  appointment_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/),
  appointment_time: z.string()
    .regex(/^\d{2}:\d{2}$/),
  duration: z.number()
    .min(15)
    .max(480),
  status: z.enum(['scheduled', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show']),
  notes: z.string()
    .max(2000)
    .optional()
    .or(z.literal(''))
});

// Treatment validation schema
export const treatmentSchema = z.object({
  name: z.string()
    .min(2)
    .max(200)
    .regex(/^[\p{L}\p{M}\p{N}\s\-&]+$/u),
  description: z.string()
    .max(1000)
    .optional()
    .or(z.literal('')),
  duration: z.number()
    .min(15)
    .max(480),
  price: z.number()
    .min(0)
    .max(10000)
    .optional(),
  category: z.string()
    .max(100)
    .optional()
    .or(z.literal('')),
  color: z.string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .or(z.literal(''))
});

// Staff validation schema
export const staffSchema = z.object({
  name: z.string()
    .min(2)
    .max(100)
    .regex(/^[\p{L}\p{M}\s\-'.]+$/u),
  email: z.string()
    .email()
    .max(255)
    .optional()
    .or(z.literal('')),
  phone: z.string()
    .min(10)
    .max(20)
    .regex(/^[\+]?[\d\s\-\(\)]+$/)
    .optional()
    .or(z.literal('')),
  specialties: z.array(z.string().max(100)).optional()
});

// User creation validation schema
export const userCreationSchema = z.object({
  full_name: z.string()
    .min(2)
    .max(100)
    .regex(/^[\p{L}\p{M}\s\-'.]+$/u),
  email: z.string()
    .email()
    .max(255),
  phone: z.string()
    .min(10)
    .max(20)
    .regex(/^[\+]?[\d\s\-\(\)]+$/)
    .optional()
    .or(z.literal('')),
  role: z.enum(['staff', 'reception', 'beautician'])
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
