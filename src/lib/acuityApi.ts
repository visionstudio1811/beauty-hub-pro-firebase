import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

/** Typed wrappers around the admin-only `acuitySync` callable (functions/src/acuitySync.ts). */

export interface AcuityAccount {
  name: string | null;
  email: string | null;
  timezone: string | null;
}

export interface AcuityResolvedRef {
  id: string | null;
  name: string;
  via: 'mapping' | 'portal' | 'name' | 'none';
}

export interface CrmNamedRef {
  id: string;
  name: string;
  active: boolean;
}

export interface AcuityMeta {
  calendars: Array<{ id: string; name: string; staff: AcuityResolvedRef }>;
  appointmentTypes: Array<{ id: string; name: string; active: boolean; treatment: AcuityResolvedRef }>;
  treatments: CrmNamedRef[];
  staff: CrmNamedRef[];
}

export interface AcuityClientRow {
  key: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  crm: { id: string; name: string; by: 'email' | 'phone'; linked: boolean } | null;
  /** Several CRM clients match equally well; the server won't link it automatically. */
  ambiguous: boolean;
  /** Near miss shown to the admin (same phone or same name), never linked automatically. */
  similar: { id: string; name: string; reason: 'phone' | 'name' } | null;
}

export interface AcuityAppointmentRow {
  id: string;
  date: string | null;
  time: string | null;
  duration: number;
  isPast: boolean;
  canceled: boolean;
  clientName: string;
  email: string | null;
  phone: string | null;
  type: string;
  appointmentTypeId: string | null;
  calendar: string;
  calendarId: string | null;
  price: string | null;
  crmClient: { id: string; name: string; by: 'email' | 'phone' } | null;
  clientAmbiguous: boolean;
  /** A CRM appointment (not from Acuity) for the same client on the same day, if any. */
  crmSameDay: { appointmentId: string; time: string } | null;
  treatment: AcuityResolvedRef;
  staff: AcuityResolvedRef;
  imported: { appointmentId: string; status: string } | null;
}

export interface ImportSummary {
  created: number;
  linked: number;
  updated: number;
  skipped: number;
  errors: number;
}

export type ImportItemStatus = 'created' | 'linked' | 'updated' | 'skipped' | 'error';

export interface ClientImportItem {
  key: string;
  status: ImportItemStatus;
  clientId?: string;
  clientName?: string;
  reason?: string;
}

export interface AppointmentImportItem {
  id: string;
  status: ImportItemStatus;
  appointmentId?: string;
  clientId?: string | null;
  clientCreated?: boolean;
  reason?: string | null;
}

export interface ListAppointmentsParams {
  minDate: string;
  maxDate: string;
  calendarId?: string;
  appointmentTypeId?: string;
  includeCanceled?: boolean;
}

const acuitySync = httpsCallable(functions, 'acuitySync', { timeout: 300_000 });

async function call<R>(organizationId: string, action: string, payload: Record<string, unknown> = {}): Promise<R> {
  const result = await acuitySync({ organizationId, action, ...payload });
  return result.data as R;
}

export const acuityApi = {
  saveCredentials: (organizationId: string, acuityUserId: string, apiKey?: string) =>
    call<{ account: AcuityAccount; apiKeyLast4: string }>(organizationId, 'save_credentials', { acuityUserId, apiKey }),

  testConnection: (organizationId: string) =>
    call<{ account: AcuityAccount }>(organizationId, 'test_connection'),

  listMeta: (organizationId: string) => call<AcuityMeta>(organizationId, 'list_meta'),

  listClients: (organizationId: string, search: string) =>
    call<{ clients: AcuityClientRow[]; total: number; truncated: boolean }>(organizationId, 'list_clients', { search }),

  listAppointments: (organizationId: string, params: ListAppointmentsParams) =>
    call<{ appointments: AcuityAppointmentRow[]; truncated: boolean; timeZone: string }>(
      organizationId,
      'list_appointments',
      { ...params },
    ),

  importClients: (organizationId: string, clients: AcuityClientRow[]) =>
    call<{ results: ClientImportItem[]; summary: ImportSummary }>(organizationId, 'import_clients', {
      clients: clients.map(({ key, firstName, lastName, email, phone, notes }) => ({
        key,
        firstName,
        lastName,
        email,
        phone,
        notes,
      })),
    }),

  importAppointments: (organizationId: string, appointmentIds: string[], createMissingClients: boolean) =>
    call<{ results: AppointmentImportItem[]; summary: ImportSummary }>(organizationId, 'import_appointments', {
      appointmentIds,
      createMissingClients,
    }),
};

/** Server batch limits (acuitySync.ts CLIENT_BATCH / APPOINTMENT_BATCH). */
export const CLIENT_IMPORT_BATCH = 100;
export const APPOINTMENT_IMPORT_BATCH = 25;

export function addSummaries(a: ImportSummary, b: ImportSummary): ImportSummary {
  return {
    created: a.created + b.created,
    linked: a.linked + b.linked,
    updated: a.updated + b.updated,
    skipped: a.skipped + b.skipped,
    errors: a.errors + b.errors,
  };
}

export const EMPTY_SUMMARY: ImportSummary = { created: 0, linked: 0, updated: 0, skipped: 0, errors: 0 };

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
