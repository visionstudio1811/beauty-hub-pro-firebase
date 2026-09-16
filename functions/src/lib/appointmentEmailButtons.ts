import { computeApptToken } from './appointmentToken';
import { AppLanguage, DEFAULT_LANGUAGE, defineStrings, htmlDirAttrs, makeT } from './i18n';

/** Brand domain that serves the `/a` hosting rewrite (same one unsubscribe uses). */
const APP_BASE_URL = 'https://beautyhubpro.com';

const STRINGS = defineStrings({
  en: {
    confirm: 'Confirm appointment',
    cancel: 'Cancel',
    hint: 'Tap Confirm to lock in your appointment.',
  },
  he: {
    confirm: 'אישור התור',
    cancel: 'ביטול',
    hint: 'לחצו על אישור כדי לקבוע את התור סופית.',
  },
});

/**
 * Builds a self-contained, inline-styled Confirm + Cancel button block for
 * appointment emails. Returns HTML that renders correctly even on the plain
 * fallback template (doesn't depend on the org's design having a CTA slot).
 *
 * `lang` selects the button copy (defaults to English for backward compatibility).
 */
export function buildAppointmentButtons(
  orgId: string,
  apptId: string,
  secret: string,
  lang: AppLanguage = DEFAULT_LANGUAGE,
): string {
  const t = makeT(STRINGS, lang);
  const { dir } = htmlDirAttrs(lang);
  const confirmToken = computeApptToken(secret, orgId, apptId, 'confirm');
  const cancelToken = computeApptToken(secret, orgId, apptId, 'cancel');
  const base = `${APP_BASE_URL}/a?o=${encodeURIComponent(orgId)}&a=${encodeURIComponent(apptId)}`;
  const confirmUrl = `${base}&k=${confirmToken}&action=confirm`;
  const cancelUrl = `${base}&k=${cancelToken}&action=cancel`;

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" dir="${dir}" style="margin:24px auto 8px auto">
  <tr>
    <td style="padding:0 8px">
      <a href="${confirmUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;padding:12px 28px;border-radius:9999px">${t('confirm')}</a>
    </td>
    <td style="padding:0 8px">
      <a href="${cancelUrl}" style="display:inline-block;background:#f3f4f6;color:#374151;text-decoration:none;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;padding:12px 28px;border-radius:9999px;border:1px solid #e5e7eb">${t('cancel')}</a>
    </td>
  </tr>
</table>
<p dir="${dir}" style="text-align:center;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#9ca3af;margin:4px 0 0 0">${t('hint')}</p>`;
}

/** Inject a block just before </body> (falls back to appending). */
export function injectBeforeBodyEnd(html: string, block: string): string {
  if (html.includes('</body>')) return html.replace('</body>', `${block}</body>`);
  return html + block;
}
