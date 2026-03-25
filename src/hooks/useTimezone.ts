import { useOrganization } from '@/contexts/OrganizationContext';
import { DEFAULT_TIMEZONE } from '@/lib/timeUtils';

/**
 * Returns the IANA timezone for the current organization.
 * Falls back to DEFAULT_TIMEZONE if the org hasn't loaded yet or
 * doesn't have a timezone set.
 */
export function useTimezone(): string {
  const { currentOrganization } = useOrganization();
  return currentOrganization?.timezone || DEFAULT_TIMEZONE;
}
