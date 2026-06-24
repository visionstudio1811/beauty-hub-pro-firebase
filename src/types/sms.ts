/**
 * SMS provider identifiers — kept in sync with the backend `SmsProvider`
 * union in functions/src/lib/smsProviders.ts. These are also the Firestore
 * doc IDs under organizations/{orgId}/marketingIntegrations/{provider}.
 */
export type SmsProvider = 'twilio' | 'infobip' | 'quo';

/** Human-readable labels for each provider, for UI pickers. */
export const SMS_PROVIDER_LABELS: Record<SmsProvider, string> = {
  infobip: 'Infobip',
  twilio: 'Twilio',
  quo: 'Quo',
};

/** Provider order shown in pickers — matches the backend default priority. */
export const SMS_PROVIDER_ORDER: SmsProvider[] = ['infobip', 'twilio', 'quo'];
