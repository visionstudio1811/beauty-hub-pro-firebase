/**
 * Client-side preview of SMS placeholder substitution. Mirrors the canonical
 * server-side `personalize()` in functions/src/sendMarketingCampaign.ts —
 * supports {first_name}, {name}, [NAME], [FIRST_NAME]. Use for live previews
 * only; the authoritative substitution happens server-side at send time.
 */
export function personalizeSms(template: string, opts: { name?: string } = {}): string {
  const fullName = (opts.name ?? '').trim();
  const firstName = fullName.split(/\s+/)[0] || 'there';
  return template
    .replace(/\{first_name\}/gi, firstName)
    .replace(/\{name\}/gi, fullName || firstName)
    .replace(/\[NAME\]/g, fullName || firstName)
    .replace(/\[FIRST_NAME\]/g, firstName);
}

// Basic GSM-7 character set (default alphabet + common extension chars), built
// as a Set so segment detection avoids a regex containing control characters.
const GSM7_CHARS = new Set(
  (
    '@$_ !"#%&\'()*+,-./0123456789:;<=>?' +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
    'abcdefghijklmnopqrstuvwxyz' +
    '\n\r' +
    '[]{}\\^|~'
  ).split(''),
);

/** GSM-7 vs UCS-2 aware segment count for an SMS body. */
export function smsSegments(body: string): { chars: number; segments: number; encoding: 'GSM-7' | 'UCS-2' } {
  const chars = body.length;
  // Any char outside the basic GSM-7 set forces UCS-2 (unicode) encoding.
  const isGsm = [...body].every((ch) => GSM7_CHARS.has(ch));
  const single = isGsm ? 160 : 70;
  const multi = isGsm ? 153 : 67;
  const segments = chars === 0 ? 0 : chars <= single ? 1 : Math.ceil(chars / multi);
  return { chars, segments, encoding: isGsm ? 'GSM-7' : 'UCS-2' };
}
