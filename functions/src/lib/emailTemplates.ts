/**
 * Default HTML templates for marketing/transactional emails.
 *
 * DUPLICATE of src/components/marketing/emailTemplates.ts — keep in sync.
 * We duplicate (rather than import) because functions/ has its own tsconfig
 * scoped to `functions/src` and can't reach into ../../src. Same pattern as
 * the scheduling availability.ts duplication.
 *
 * Handlebars-style merge tags resolved at send time. Table-based layouts for
 * maximum email client compatibility (Outlook, Gmail, iOS Mail, Apple Mail).
 *
 * Color/branding variables come from per-template settings the user configures
 * in the marketing template designer — never hardcode brand colors here.
 *
 * i18n: every template exists in English (default) and Hebrew. Pass the org's
 * language as the optional second argument of `getDefaultTemplateHtml`; the
 * Hebrew variant renders with dir="rtl", mirrored alignment and the same
 * structure + merge tags as the English one.
 */

import {
  AppLanguage,
  DEFAULT_LANGUAGE,
  defineStrings,
  htmlDirAttrs,
  makeT,
  Translator,
} from './i18n';

export type TemplateType =
  | 'welcome'
  | 'general'
  | 'birthday'
  | 'inactive'
  | 'package_renewal'
  | 'appointment_reminder'
  | 'appointment_confirmation'
  | 'booking_request_received'
  | 'booking_request_admin_alert'
  | 'booking_request_declined';

// NOTE: the {{merge_tags}} inside these strings are intentionally left for the
// send-time renderer. Never pass `vars` to t() here — interpolate() only
// touches the template when vars are supplied, so t(key) returns them intact.
const STRINGS = defineStrings({
  en: {
    preheader: 'A note from {{organization_name}}.',
    footer_reason: "You're receiving this because you're a valued client of {{organization_name}}.",
    signature_default: 'With warmth',

    welcome_eyebrow: 'Welcome',
    welcome_title: 'Thank you for joining us',
    welcome_intro:
      "Hello {{client_name}}, we're so delighted to welcome you to the {{organization_name}} family. Get ready for a curated experience of relaxation, rejuvenation, and timeless beauty.",
    welcome_expect_title: 'What to expect',
    welcome_expect_body:
      'Exclusive offers, member-only previews, and gentle reminders for the moments that matter — from birthdays to seasonal rituals.',
    welcome_cta: 'Book Your First Appointment',
    welcome_signoff: 'With warmth,',

    general_eyebrow: 'A note from {{organization_name}}',
    general_cta: 'Learn More',
    general_signoff: 'Warmly,',

    birthday_eyebrow: 'A celebration',
    birthday_title: 'Happy Birthday, {{client_name}}',
    birthday_intro:
      "Today is your day, and we couldn't let it pass without a small token of our appreciation. Thank you for letting us be part of your beauty journey.",
    birthday_gift_title: 'Your gift from us',
    birthday_code_hint: 'Mention this code when you book.',
    birthday_cta: 'Treat Yourself',
    birthday_signoff: 'With love,',
    birthday_team: '{{sender_name}} &amp; the {{organization_name}} team',

    inactive_eyebrow: "It's been a while",
    inactive_title: 'We miss you, {{client_name}}',
    inactive_intro:
      "It's been {{months_inactive}} months since we last saw you, and the chair just isn't the same without you. We'd love to welcome you back for a moment of pure self-care.",
    inactive_last_visit: 'Last visit',
    inactive_gift_title: 'A welcome-back gift',
    inactive_cta: 'Book Your Return',
    inactive_signoff: "We can't wait to see you again,",

    renewal_eyebrow: 'Package update',
    renewal_title: 'Time to renew your {{package_name}}',
    renewal_intro:
      "Hello {{client_name}}, your package is winding down and we'd hate for you to miss a single ritual. Renew now to continue your routine without interruption.",
    renewal_sessions_left: 'Sessions left',
    renewal_expires: 'Expires',
    renewal_offer: 'Renewal offer',
    renewal_cta: 'Renew My Package',
    renewal_signoff: 'Here for you,',

    reminder_eyebrow: 'Friendly reminder',
    reminder_title: 'See you soon, {{client_name}}',
    reminder_intro:
      "This is a gentle note confirming your upcoming appointment with {{organization_name}}. We're looking forward to taking care of you.",
    reminder_cta: 'Manage Appointment',
    reminder_signoff: 'See you soon,',

    label_date: 'Date',
    label_time: 'Time',
    label_with: 'With',
    label_where: 'Where',
    label_email: 'Email',
    label_phone: 'Phone',
    label_requested: 'Requested',

    reschedule_note:
      'Need to reschedule? Reply to this email or call <a href="tel:{{organization_phone}}" style="color: {{primary_color}}; text-decoration: none;">{{organization_phone}}</a>.',
    questions_note:
      'Questions? Reply to this email or call <a href="tel:{{organization_phone}}" style="color: {{primary_color}}; text-decoration: none;">{{organization_phone}}</a>.',

    booking_received_eyebrow: 'Request received',
    booking_received_title: 'Thank you, {{client_name}}',
    booking_received_intro:
      "We've received your booking request and {{organization_name}} will confirm by email shortly.",

    admin_alert_eyebrow: 'New booking request',
    admin_alert_intro: 'A new public booking request is waiting in your Booking Requests panel.',
    admin_alert_cta: 'Open Booking Requests',

    confirmation_eyebrow: 'Appointment confirmed',
    confirmation_title: 'Hi {{client_name}},',
    confirmation_intro: "Your appointment is booked and we're already looking forward to taking care of you.",
    confirmation_signoff: 'See you soon,',

    declined_eyebrow: 'About your booking',
    declined_title: 'Hi {{client_name}},',
    declined_intro:
      "Unfortunately we're unable to confirm your booking at the requested time. We'd love to find another moment to see you.",
    declined_cta: 'Pick a New Time',
    declined_signoff: 'With warm regards,',
  },
  he: {
    preheader: 'הודעה מ{{organization_name}}.',
    footer_reason: 'קיבלת הודעה זו מכיוון שאת/ה לקוח/ה יקר/ה של {{organization_name}}.',
    signature_default: 'בחום',

    welcome_eyebrow: 'ברוכים הבאים',
    welcome_title: 'תודה שהצטרפת אלינו',
    welcome_intro:
      'שלום {{client_name}}, אנחנו שמחים מאוד לקבל אותך למשפחת {{organization_name}}. מחכה לך חוויה מותאמת אישית של רוגע, התחדשות ויופי נצחי.',
    welcome_expect_title: 'למה לצפות',
    welcome_expect_body:
      'הצעות בלעדיות, הצצות מוקדמות לחברים בלבד ותזכורות עדינות לרגעים החשובים — מימי הולדת ועד טיפולים עונתיים.',
    welcome_cta: 'לקביעת התור הראשון',
    welcome_signoff: 'בחום,',

    general_eyebrow: 'הודעה מ{{organization_name}}',
    general_cta: 'למידע נוסף',
    general_signoff: 'בחום,',

    birthday_eyebrow: 'חגיגה',
    birthday_title: 'יום הולדת שמח, {{client_name}}',
    birthday_intro:
      'היום הוא היום שלך, ולא יכולנו לתת לו לעבור בלי מחווה קטנה של הערכה. תודה שאת/ה נותן/ת לנו להיות חלק ממסע היופי שלך.',
    birthday_gift_title: 'המתנה שלנו עבורך',
    birthday_code_hint: 'ציינו קוד זה בעת קביעת התור.',
    birthday_cta: 'לפנק את עצמך',
    birthday_signoff: 'באהבה,',
    birthday_team: '{{sender_name}} וצוות {{organization_name}}',

    inactive_eyebrow: 'עבר זמן',
    inactive_title: 'התגעגענו אליך, {{client_name}}',
    inactive_intro:
      'עברו {{months_inactive}} חודשים מאז הפעם האחרונה שראינו אותך, וזה פשוט לא אותו דבר בלעדיך. נשמח לקבל אותך בחזרה לרגע של טיפוח עצמי אמיתי.',
    inactive_last_visit: 'ביקור אחרון',
    inactive_gift_title: 'מתנת חזרה',
    inactive_cta: 'לקביעת תור חזרה',
    inactive_signoff: 'מחכים לראות אותך שוב,',

    renewal_eyebrow: 'עדכון חבילה',
    renewal_title: 'הגיע הזמן לחדש את {{package_name}}',
    renewal_intro:
      'שלום {{client_name}}, החבילה שלך מתקרבת לסיומה ולא היינו רוצים שתפספס/י אפילו טיפול אחד. חדש/י עכשיו כדי להמשיך בשגרה ללא הפרעה.',
    renewal_sessions_left: 'טיפולים שנותרו',
    renewal_expires: 'בתוקף עד',
    renewal_offer: 'הצעת חידוש',
    renewal_cta: 'לחידוש החבילה',
    renewal_signoff: 'כאן בשבילך,',

    reminder_eyebrow: 'תזכורת ידידותית',
    reminder_title: 'נתראה בקרוב, {{client_name}}',
    reminder_intro:
      'זוהי תזכורת עדינה לתור הקרוב שלך ב{{organization_name}}. אנחנו מצפים לטפל בך.',
    reminder_cta: 'ניהול התור',
    reminder_signoff: 'נתראה בקרוב,',

    label_date: 'תאריך',
    label_time: 'שעה',
    label_with: 'עם',
    label_where: 'היכן',
    label_email: 'אימייל',
    label_phone: 'טלפון',
    label_requested: 'מועד מבוקש',

    reschedule_note:
      'צריך/ה לשנות את המועד? השב/י למייל זה או התקשר/י אל <a href="tel:{{organization_phone}}" style="color: {{primary_color}}; text-decoration: none;">{{organization_phone}}</a>.',
    questions_note:
      'שאלות? השב/י למייל זה או התקשר/י אל <a href="tel:{{organization_phone}}" style="color: {{primary_color}}; text-decoration: none;">{{organization_phone}}</a>.',

    booking_received_eyebrow: 'הבקשה התקבלה',
    booking_received_title: 'תודה, {{client_name}}',
    booking_received_intro:
      'קיבלנו את בקשת ההזמנה שלך, ו{{organization_name}} ישלח אישור במייל בקרוב.',

    admin_alert_eyebrow: 'בקשת הזמנה חדשה',
    admin_alert_intro: 'בקשת הזמנה ציבורית חדשה ממתינה בפאנל בקשות ההזמנה שלך.',
    admin_alert_cta: 'לפתיחת בקשות ההזמנה',

    confirmation_eyebrow: 'התור אושר',
    confirmation_title: 'שלום {{client_name}},',
    confirmation_intro: 'התור שלך נקבע ואנחנו כבר מצפים לטפל בך.',
    confirmation_signoff: 'נתראה בקרוב,',

    declined_eyebrow: 'בנוגע להזמנה שלך',
    declined_title: 'שלום {{client_name}},',
    declined_intro:
      'לצערנו אין באפשרותנו לאשר את ההזמנה במועד המבוקש. נשמח למצוא מועד אחר לראות אותך.',
    declined_cta: 'לבחירת מועד חדש',
    declined_signoff: 'בברכה חמה,',
  },
});

type TemplateKey = keyof (typeof STRINGS)['en'];

/** Per-language layout context shared by every template builder. */
interface Ctx {
  lang: AppLanguage;
  t: Translator<TemplateKey>;
  /** `dir` attribute for <html>/<body>. */
  dir: 'rtl' | 'ltr';
  /** Text alignment of the reading "start" side. */
  start: 'left' | 'right';
  /** Opposite side of `start` — used for value cells in label/value rows. */
  end: 'left' | 'right';
}

function makeCtx(lang: AppLanguage): Ctx {
  const { dir, align } = htmlDirAttrs(lang);
  return {
    lang,
    t: makeT(STRINGS, lang),
    dir,
    start: align,
    end: align === 'right' ? 'left' : 'right',
  };
}

const FONT_SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
// Two serif stacks, matching the original hand-written templates exactly:
// the h1 / footer signature carry the 'Times New Roman' fallback, the inner
// card headings and stat numbers do not. Keep both so the English output stays
// byte-identical to the pre-i18n templates (apart from dir/lang attributes).
const FONT_SERIF_H1 = "'Playfair Display', Georgia, 'Times New Roman', serif";
const FONT_SERIF_CARD = "'Playfair Display', Georgia, serif";

function head(c: Ctx): string {
  return `<!DOCTYPE html>
<html lang="${c.lang}" dir="${c.dir}" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>{{organization_name}}</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; display: block; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a { text-decoration: none; }
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; border-radius: 0 !important; }
      .px { padding-left: 24px !important; padding-right: 24px !important; }
      .h1 { font-size: 24px !important; line-height: 32px !important; }
    }
  </style>
</head>`;
}

function header(c: Ctx): string {
  return `      <!-- Header -->
      <tr>
        <td align="center" style="padding: 0;">
          {{#if header_image_url}}
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
            <tr>
              <td style="position: relative; padding: 0; line-height: 0;">
                <img src="{{header_image_url}}" alt="" width="600" style="width: 100%; max-width: 600px; height: auto; display: block; border-top-left-radius: 12px; border-top-right-radius: 12px;" />
                {{#if logo_url}}
                <!--[if !mso]><!-->
                <div style="position: absolute; top: 20px; ${c.start}: 24px;">
                  <img src="{{logo_url}}" alt="{{organization_name}}" width="80" style="width: 80px; height: auto; display: block; background: rgba(255,255,255,0.85); padding: 8px 12px; border-radius: 6px;" />
                </div>
                <!--<![endif]-->
                {{/if}}
              </td>
            </tr>
          </table>
          {{else}}
            {{#if logo_url}}
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
              <tr>
                <td align="center" style="padding: 32px 24px 8px 24px;">
                  <img src="{{logo_url}}" alt="{{organization_name}}" width="120" style="width: 120px; height: auto; display: block; margin: 0 auto;" />
                </td>
              </tr>
            </table>
            {{/if}}
          {{/if}}
        </td>
      </tr>`;
}

function footer(c: Ctx): string {
  return `      <!-- Footer -->
      <tr>
        <td class="px" style="padding: 24px 40px 8px 40px; border-top: 1px solid #eeeae3;">
          <p style="margin: 0 0 8px 0; font-family: ${FONT_SERIF_H1}; font-size: 16px; color: {{primary_color}}; text-align: center;">
            {{signature}}
          </p>
          <p style="margin: 0 0 4px 0; font-family: ${FONT_SANS}; font-size: 14px; color: {{secondary_text}}; text-align: center; line-height: 22px;">
            <strong style="color: {{text_color}};">{{organization_name}}</strong>
          </p>
          <p style="margin: 0 0 4px 0; font-family: ${FONT_SANS}; font-size: 13px; color: {{secondary_text}}; text-align: center; line-height: 20px;">
            {{organization_address}}
          </p>
          <p style="margin: 0 0 16px 0; font-family: ${FONT_SANS}; font-size: 13px; color: {{secondary_text}}; text-align: center; line-height: 20px;">
            <a href="tel:{{organization_phone}}" style="color: {{secondary_text}}; text-decoration: none;">{{organization_phone}}</a>
            &nbsp;&middot;&nbsp;
            <a href="mailto:{{organization_email}}" style="color: {{secondary_text}}; text-decoration: none;">{{organization_email}}</a>
          </p>
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 32px 40px;">
          <p style="margin: 0; font-family: ${FONT_SANS}; font-size: 11px; color: {{secondary_text}}; text-align: center; line-height: 18px; opacity: 0.8;">
            ${c.t('footer_reason')}
          </p>
        </td>
      </tr>`;
}

function shell(c: Ctx, innerRows: string): string {
  return `${head(c)}
<body dir="${c.dir}" style="margin: 0; padding: 0; background-color: {{background_color}}; font-family: ${FONT_SANS}; color: {{text_color}}; text-align: ${c.start};">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: {{background_color}};">
    ${c.t('preheader')}
  </div>
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" dir="${c.dir}" style="background-color: {{background_color}}; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" class="container" border="0" cellpadding="0" cellspacing="0" width="600" dir="${c.dir}" style="width: 600px; max-width: 600px; background-color: {{card_background}}; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: hidden;">
${innerRows}
        </table>
        <p style="margin: 16px 0 0 0; font-family: ${FONT_SANS}; font-size: 11px; color: {{secondary_text}}; text-align: center;">
          &copy; {{date}} {{organization_name}}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(label: string): string {
  return `          <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;">
            <tr>
              <td align="center" bgcolor="{{primary_color}}" style="border-radius: 8px; background-color: {{primary_color}};">
                <a href="{{#if cta_url}}{{cta_url}}{{else}}mailto:{{organization_email}}{{/if}}"
                   style="display: inline-block; padding: 14px 32px; font-family: ${FONT_SANS}; font-size: 15px; font-weight: 600; letter-spacing: 0.5px; color: #ffffff; text-decoration: none; border-radius: 8px;">
                  ${label}
                </a>
              </td>
            </tr>
          </table>`;
}

/** A single label/value row inside a details card (label on the start side, value on the end side). */
function detailRow(c: Ctx, label: string, value: string): string {
  return `                  <tr>
                    <td style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: ${FONT_SANS}; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}}; text-align: ${c.start};">
                      ${label}
                    </td>
                    <td align="${c.end}" style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: ${FONT_SANS}; font-size: 14px; color: {{text_color}}; text-align: ${c.end};">
                      ${value}
                    </td>
                  </tr>`;
}

/** Eyebrow + h1 + intro paragraph, centered. */
function heroBlock(c: Ctx, eyebrow: string, title: string, intro: string, titleSize = 28, titleLine = 38): string {
  return `      <tr>
        <td class="px" style="padding: 40px 40px 16px 40px; text-align: center;">
          <p style="margin: 0 0 12px 0; font-family: ${FONT_SANS}; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: {{secondary_text}};">
            ${eyebrow}
          </p>
          <h1 class="h1" style="margin: 0 0 16px 0; font-family: ${FONT_SERIF_H1}; font-size: ${titleSize}px; line-height: ${titleLine}px; font-weight: 400; color: {{primary_color}};">
            ${title}
          </h1>
          <p style="margin: 0 0 24px 0; font-family: ${FONT_SANS}; font-size: 16px; line-height: 26px; color: {{text_color}};">
            ${intro}
          </p>
        </td>
      </tr>`;
}

function signoffBlock(signoff: string, name = '{{sender_name}}'): string {
  return `      <tr>
        <td class="px" style="padding: 0 40px 32px 40px;">
          <p style="margin: 0; font-family: ${FONT_SANS}; font-size: 14px; line-height: 22px; color: {{text_color}}; text-align: center;">
            ${signoff}<br /><em style="color: {{primary_color}};">${name}</em>
          </p>
        </td>
      </tr>`;
}

function welcomeBody(c: Ctx): string {
  const { t } = c;
  return `${heroBlock(c, t('welcome_eyebrow'), t('welcome_title'), t('welcome_intro'), 30, 40)}
      <tr>
        <td class="px" style="padding: 0 40px 32px 40px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: {{content_background}}; border-radius: 8px;">
            <tr>
              <td style="padding: 24px 28px; text-align: ${c.start};">
                <p style="margin: 0 0 8px 0; font-family: ${FONT_SERIF_CARD}; font-size: 18px; color: {{primary_color}};">
                  ${t('welcome_expect_title')}
                </p>
                <p style="margin: 0; font-family: ${FONT_SANS}; font-size: 14px; line-height: 22px; color: {{text_color}};">
                  ${t('welcome_expect_body')}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding: 0 40px 40px 40px;">
${ctaButton(t('welcome_cta'))}
        </td>
      </tr>
${signoffBlock(t('welcome_signoff'))}`;
}

function generalBody(c: Ctx): string {
  const { t } = c;
  return `      <tr>
        <td class="px" style="padding: 40px 40px 16px 40px;">
          <p style="margin: 0 0 12px 0; font-family: ${FONT_SANS}; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: {{secondary_text}}; text-align: center;">
            ${t('general_eyebrow')}
          </p>
          <h1 class="h1" style="margin: 0 0 24px 0; font-family: ${FONT_SERIF_H1}; font-size: 28px; line-height: 38px; font-weight: 400; color: {{primary_color}}; text-align: center;">
            {{subject}}
          </h1>
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 32px 40px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: {{content_background}}; border-radius: 8px;">
            <tr>
              <td style="padding: 28px 32px; text-align: ${c.start};">
                <div style="font-family: ${FONT_SANS}; font-size: 15px; line-height: 26px; color: {{text_color}};">
                  {{message}}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding: 0 40px 40px 40px;">
${ctaButton(t('general_cta'))}
        </td>
      </tr>
${signoffBlock(t('general_signoff'))}`;
}

function birthdayBody(c: Ctx): string {
  const { t } = c;
  return `      <tr>
        <td class="px" style="padding: 40px 40px 16px 40px; text-align: center;">
          <p style="margin: 0 0 12px 0; font-family: ${FONT_SANS}; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: {{secondary_text}};">
            ${t('birthday_eyebrow')}
          </p>
          <h1 class="h1" style="margin: 0 0 12px 0; font-family: ${FONT_SERIF_H1}; font-size: 32px; line-height: 42px; font-weight: 400; color: {{primary_color}};">
            ${t('birthday_title')}
          </h1>
          <p style="margin: 0 0 24px 0; font-family: ${FONT_SANS}; font-size: 15px; line-height: 24px; color: {{secondary_text}};">
            {{birthday_date}}
          </p>
          <p style="margin: 0 0 8px 0; font-family: ${FONT_SANS}; font-size: 16px; line-height: 26px; color: {{text_color}};">
            ${t('birthday_intro')}
          </p>
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 8px 40px 32px 40px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: {{content_background}}; border-radius: 8px;">
            <tr>
              <td style="padding: 28px 32px; text-align: center;">
                <p style="margin: 0 0 8px 0; font-family: ${FONT_SERIF_CARD}; font-size: 20px; color: {{primary_color}};">
                  ${t('birthday_gift_title')}
                </p>
                <p style="margin: 0 0 16px 0; font-family: ${FONT_SANS}; font-size: 16px; line-height: 24px; color: {{text_color}};">
                  {{special_offer}}
                </p>
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;">
                  <tr>
                    <td dir="ltr" style="padding: 10px 20px; border: 1px dashed {{primary_color}}; border-radius: 6px; font-family: 'Courier New', monospace; font-size: 16px; letter-spacing: 2px; color: {{primary_color}};">
                      {{discount_code}}
                    </td>
                  </tr>
                </table>
                <p style="margin: 12px 0 0 0; font-family: ${FONT_SANS}; font-size: 12px; color: {{secondary_text}};">
                  ${t('birthday_code_hint')}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding: 0 40px 40px 40px;">
${ctaButton(t('birthday_cta'))}
        </td>
      </tr>
${signoffBlock(t('birthday_signoff'), t('birthday_team'))}`;
}

function inactiveBody(c: Ctx): string {
  const { t } = c;
  return `${heroBlock(c, t('inactive_eyebrow'), t('inactive_title'), t('inactive_intro'), 30, 40)}
      <tr>
        <td class="px" style="padding: 0 40px 24px 40px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: {{content_background}}; border-radius: 8px;">
            <tr>
              <td style="padding: 24px 28px; text-align: ${c.start};">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="padding: 0 0 12px 0; font-family: ${FONT_SANS}; font-size: 13px; color: {{secondary_text}}; letter-spacing: 1px; text-transform: uppercase; text-align: ${c.start};">
                      ${t('inactive_last_visit')}
                    </td>
                    <td align="${c.end}" style="padding: 0 0 12px 0; font-family: ${FONT_SANS}; font-size: 14px; color: {{text_color}}; text-align: ${c.end};">
                      {{last_visit_date}}
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="border-top: 1px solid #eeeae3; padding-top: 16px; text-align: ${c.start};">
                      <p style="margin: 0 0 8px 0; font-family: ${FONT_SERIF_CARD}; font-size: 18px; color: {{primary_color}};">
                        ${t('inactive_gift_title')}
                      </p>
                      <p style="margin: 0; font-family: ${FONT_SANS}; font-size: 15px; line-height: 23px; color: {{text_color}};">
                        {{comeback_offer}}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding: 8px 40px 40px 40px;">
${ctaButton(t('inactive_cta'))}
        </td>
      </tr>
${signoffBlock(t('inactive_signoff'))}`;
}

function renewalBody(c: Ctx): string {
  const { t } = c;
  // Two-column stats: the inner gutter sits on the "end" side of the first cell
  // and the "start" side of the second cell so it mirrors correctly in RTL.
  const padFirst = c.dir === 'rtl' ? '0 0 16px 8px' : '0 8px 16px 0';
  const padSecond = c.dir === 'rtl' ? '0 8px 16px 0' : '0 0 16px 8px';
  return `${heroBlock(c, t('renewal_eyebrow'), t('renewal_title'), t('renewal_intro'))}
      <tr>
        <td class="px" style="padding: 0 40px 24px 40px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: {{content_background}}; border-radius: 8px;">
            <tr>
              <td style="padding: 28px 32px; text-align: ${c.start};">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td width="50%" style="padding: ${padFirst}; vertical-align: top; text-align: ${c.start};">
                      <p style="margin: 0 0 4px 0; font-family: ${FONT_SANS}; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                        ${t('renewal_sessions_left')}
                      </p>
                      <p style="margin: 0; font-family: ${FONT_SERIF_CARD}; font-size: 24px; color: {{primary_color}};">
                        {{sessions_remaining}}
                      </p>
                    </td>
                    <td width="50%" style="padding: ${padSecond}; vertical-align: top; text-align: ${c.start};">
                      <p style="margin: 0 0 4px 0; font-family: ${FONT_SANS}; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                        ${t('renewal_expires')}
                      </p>
                      <p style="margin: 0; font-family: ${FONT_SERIF_CARD}; font-size: 24px; color: {{primary_color}};">
                        {{expiry_date}}
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="border-top: 1px solid #eeeae3; padding-top: 16px; text-align: ${c.start};">
                      <p style="margin: 0 0 4px 0; font-family: ${FONT_SANS}; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                        ${t('renewal_offer')}
                      </p>
                      <p style="margin: 0; font-family: ${FONT_SANS}; font-size: 15px; line-height: 23px; color: {{text_color}};">
                        {{renewal_discount}}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding: 8px 40px 40px 40px;">
${ctaButton(t('renewal_cta'))}
        </td>
      </tr>
${signoffBlock(t('renewal_signoff'))}`;
}

/** Details card: centered treatment name + label/value rows. */
function detailsCard(c: Ctx, title: string, rows: string, extra = ''): string {
  return `      <tr>
        <td class="px" style="padding: 0 40px 24px 40px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: {{content_background}}; border-radius: 8px;">
            <tr>
              <td style="padding: 28px 32px; text-align: ${c.start};">
                <p style="margin: 0 0 16px 0; font-family: ${FONT_SERIF_CARD}; font-size: 20px; color: {{primary_color}}; text-align: center;">
                  ${title}
                </p>
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
${rows}
                </table>${extra}
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
}

function noteRow(note: string, bottomPadding: number): string {
  return `      <tr>
        <td class="px" style="padding: 0 40px ${bottomPadding}px 40px;">
          <p style="margin: 0; font-family: ${FONT_SANS}; font-size: 13px; line-height: 20px; color: {{secondary_text}}; text-align: center;">
            ${note}
          </p>
        </td>
      </tr>`;
}

function apptReminderBody(c: Ctx): string {
  const { t } = c;
  const rows = [
    detailRow(c, t('label_date'), '{{appointment_date}}'),
    detailRow(c, t('label_time'), '{{appointment_time}}'),
    detailRow(c, t('label_with'), '{{staff_name}}'),
    detailRow(c, t('label_where'), '{{location}}'),
  ].join('\n');
  return `${heroBlock(c, t('reminder_eyebrow'), t('reminder_title'), t('reminder_intro'))}
${detailsCard(c, '{{service_name}}', rows)}
      <tr>
        <td align="center" style="padding: 8px 40px 16px 40px;">
${ctaButton(t('reminder_cta'))}
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 32px 40px;">
          <p style="margin: 0 0 12px 0; font-family: ${FONT_SANS}; font-size: 13px; line-height: 20px; color: {{secondary_text}}; text-align: center;">
            ${t('reschedule_note')}
          </p>
          <p style="margin: 0; font-family: ${FONT_SANS}; font-size: 14px; line-height: 22px; color: {{text_color}}; text-align: center;">
            ${t('reminder_signoff')}<br /><em style="color: {{primary_color}};">{{sender_name}}</em>
          </p>
        </td>
      </tr>`;
}

// ---- Public-link booking templates ------------------------------------------

function bookingReceivedBody(c: Ctx): string {
  const { t } = c;
  const rows = [
    detailRow(c, t('label_date'), '{{date}}'),
    detailRow(c, t('label_time'), '{{time}}'),
  ].join('\n');
  return `${heroBlock(c, t('booking_received_eyebrow'), t('booking_received_title'), t('booking_received_intro'))}
${detailsCard(c, '{{treatment}}', rows)}
      <tr>
        <td class="px" style="padding: 0 40px 32px 40px;">
          <p style="margin: 0 0 12px 0; font-family: ${FONT_SANS}; font-size: 13px; line-height: 20px; color: {{secondary_text}}; text-align: center;">
            ${t('questions_note')}
          </p>
          <p style="margin: 0; font-family: ${FONT_SANS}; font-size: 14px; line-height: 22px; color: {{text_color}}; text-align: center;">
            <em style="color: {{primary_color}};">{{sender_name}}</em>
          </p>
        </td>
      </tr>`;
}

function bookingAdminAlertBody(c: Ctx): string {
  const { t } = c;
  const rows = [
    detailRow(c, t('label_date'), '{{date}}'),
    detailRow(c, t('label_time'), '{{time}}'),
    detailRow(c, t('label_email'), '{{visitor_email}}'),
    detailRow(c, t('label_phone'), '{{visitor_phone}}'),
  ].join('\n');
  return `${heroBlock(c, t('admin_alert_eyebrow'), '{{visitor_name}}', t('admin_alert_intro'))}
${detailsCard(c, '{{treatment}}', rows)}
      <tr>
        <td align="center" style="padding: 8px 40px 32px 40px;">
${ctaButton(t('admin_alert_cta'))}
        </td>
      </tr>`;
}

function apptConfirmationBody(c: Ctx): string {
  const { t } = c;
  const rows = [
    detailRow(c, t('label_date'), '{{date}}'),
    detailRow(c, t('label_time'), '{{time}}'),
    `                  {{#if staff}}
${detailRow(c, t('label_with'), '{{staff}}')}
                  {{/if}}`,
  ].join('\n');
  return `${heroBlock(c, t('confirmation_eyebrow'), t('confirmation_title'), t('confirmation_intro'))}
${detailsCard(c, '{{treatment}}', rows)}
${noteRow(t('reschedule_note'), 24)}
${signoffBlock(t('confirmation_signoff'))}`;
}

function bookingDeclinedBody(c: Ctx): string {
  const { t } = c;
  const rows = detailRow(c, t('label_requested'), '{{date}} · {{time}}');
  const reason = `
                <p style="margin: 20px 0 0 0; font-family: ${FONT_SANS}; font-size: 14px; line-height: 22px; color: {{text_color}}; font-style: italic;">
                  "{{reason}}"
                </p>`;
  return `${heroBlock(c, t('declined_eyebrow'), t('declined_title'), t('declined_intro'))}
${detailsCard(c, '{{treatment}}', rows, reason)}
      <tr>
        <td align="center" style="padding: 8px 40px 16px 40px;">
${ctaButton(t('declined_cta'))}
        </td>
      </tr>
${signoffBlock(t('declined_signoff'))}`;
}

/**
 * Returns the default HTML for a template type.
 *
 * @param type  Template type.
 * @param lang  Org language (default `'en'`). `'he'` renders a fully Hebrew,
 *              RTL variant with the same structure and merge tags.
 */
export function getDefaultTemplateHtml(type: TemplateType, lang: AppLanguage = DEFAULT_LANGUAGE): string {
  const c = makeCtx(lang);
  const wrap = (body: string) => shell(c, `${header(c)}\n${body}\n${footer(c)}`);
  switch (type) {
    case 'welcome':
      return wrap(welcomeBody(c));
    case 'general':
      return wrap(generalBody(c));
    case 'birthday':
      return wrap(birthdayBody(c));
    case 'inactive':
      return wrap(inactiveBody(c));
    case 'package_renewal':
      return wrap(renewalBody(c));
    case 'appointment_reminder':
      return wrap(apptReminderBody(c));
    case 'appointment_confirmation':
      return wrap(apptConfirmationBody(c));
    case 'booking_request_received':
      return wrap(bookingReceivedBody(c));
    case 'booking_request_admin_alert':
      return wrap(bookingAdminAlertBody(c));
    case 'booking_request_declined':
      return wrap(bookingDeclinedBody(c));
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown template type: ${_exhaustive}`);
    }
  }
}

export const ELEGANT_DEFAULT_SETTINGS = {
  primary_color: '#A5918A',
  background_color: '#f9f7f4',
  card_background: '#ffffff',
  content_background: '#faf7f3',
  text_color: '#6F675A',
  secondary_text: '#9c9385',
  signature: 'With warmth',
};

/**
 * Language-aware variant of ELEGANT_DEFAULT_SETTINGS — identical palette, with
 * the default `signature` line localized. `getElegantDefaultSettings('en')`
 * deep-equals `ELEGANT_DEFAULT_SETTINGS`.
 */
export function getElegantDefaultSettings(lang: AppLanguage = DEFAULT_LANGUAGE): typeof ELEGANT_DEFAULT_SETTINGS {
  return {
    ...ELEGANT_DEFAULT_SETTINGS,
    signature: makeT(STRINGS, lang)('signature_default'),
  };
}
