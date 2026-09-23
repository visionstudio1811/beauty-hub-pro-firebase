import type { firestore } from 'firebase-admin';

const DEFAULT_BASE = 'https://beautyhubpro.com';

/** Public client-portal URL for an org: white-label host if configured, else the slug route. */
export function portalUrlForOrg(org: firestore.DocumentData | undefined | null): string {
  const candidates: unknown[] = [
    org?.crm_domain,
    org?.custom_domain,
    org?.domain,
    Array.isArray(org?.portal_domains) ? org?.portal_domains[0] : undefined,
  ];
  const host = candidates.find((h) => typeof h === 'string' && h.trim());
  if (host) return `https://${String(host).trim().toLowerCase()}/client`;
  const slug = typeof org?.slug === 'string' ? org.slug.trim() : '';
  return slug ? `${DEFAULT_BASE}/client/${encodeURIComponent(slug)}` : `${DEFAULT_BASE}/client`;
}
