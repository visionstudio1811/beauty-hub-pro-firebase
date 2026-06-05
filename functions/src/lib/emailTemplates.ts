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
 */

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

const HEAD = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
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

const HEADER = `      <!-- Header -->
      <tr>
        <td align="center" style="padding: 0;">
          {{#if header_image_url}}
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
            <tr>
              <td style="position: relative; padding: 0; line-height: 0;">
                <img src="{{header_image_url}}" alt="" width="600" style="width: 100%; max-width: 600px; height: auto; display: block; border-top-left-radius: 12px; border-top-right-radius: 12px;" />
                {{#if logo_url}}
                <!--[if !mso]><!-->
                <div style="position: absolute; top: 20px; left: 24px;">
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

const FOOTER = `      <!-- Footer -->
      <tr>
        <td class="px" style="padding: 24px 40px 8px 40px; border-top: 1px solid #eeeae3;">
          <p style="margin: 0 0 8px 0; font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-size: 16px; color: {{primary_color}}; text-align: center;">
            {{signature}}
          </p>
          <p style="margin: 0 0 4px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: {{secondary_text}}; text-align: center; line-height: 22px;">
            <strong style="color: {{text_color}};">{{organization_name}}</strong>
          </p>
          <p style="margin: 0 0 4px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: {{secondary_text}}; text-align: center; line-height: 20px;">
            {{organization_address}}
          </p>
          <p style="margin: 0 0 16px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: {{secondary_text}}; text-align: center; line-height: 20px;">
            <a href="tel:{{organization_phone}}" style="color: {{secondary_text}}; text-decoration: none;">{{organization_phone}}</a>
            &nbsp;&middot;&nbsp;
            <a href="mailto:{{organization_email}}" style="color: {{secondary_text}}; text-decoration: none;">{{organization_email}}</a>
          </p>
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 32px 40px;">
          <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: {{secondary_text}}; text-align: center; line-height: 18px; opacity: 0.8;">
            You're receiving this because you're a valued client of {{organization_name}}.
          </p>
        </td>
      </tr>`;

function shell(innerRows: string): string {
  return `${HEAD}
<body style="margin: 0; padding: 0; background-color: {{background_color}}; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: {{text_color}};">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: {{background_color}};">
    A note from {{organization_name}}.
  </div>
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: {{background_color}}; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" class="container" border="0" cellpadding="0" cellspacing="0" width="600" style="width: 600px; max-width: 600px; background-color: {{card_background}}; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: hidden;">
${innerRows}
        </table>
        <p style="margin: 16px 0 0 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: {{secondary_text}}; text-align: center;">
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
                   style="display: inline-block; padding: 14px 32px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 600; letter-spacing: 0.5px; color: #ffffff; text-decoration: none; border-radius: 8px;">
                  ${label}
                </a>
              </td>
            </tr>
          </table>`;
}

const WELCOME_BODY = `      <tr>
        <td class="px" style="padding: 40px 40px 16px 40px; text-align: center;">
          <p style="margin: 0 0 12px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: {{secondary_text}};">
            Welcome
          </p>
          <h1 class="h1" style="margin: 0 0 16px 0; font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-size: 30px; line-height: 40px; font-weight: 400; color: {{primary_color}};">
            Thank you for joining us
          </h1>
          <p style="margin: 0 0 24px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 26px; color: {{text_color}};">
            Hello {{client_name}}, we're so delighted to welcome you to the {{organization_name}} family. Get ready for a curated experience of relaxation, rejuvenation, and timeless beauty.
          </p>
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 32px 40px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: {{content_background}}; border-radius: 8px;">
            <tr>
              <td style="padding: 24px 28px;">
                <p style="margin: 0 0 8px 0; font-family: 'Playfair Display', Georgia, serif; font-size: 18px; color: {{primary_color}};">
                  What to expect
                </p>
                <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 22px; color: {{text_color}};">
                  Exclusive offers, member-only previews, and gentle reminders for the moments that matter — from birthdays to seasonal rituals.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding: 0 40px 40px 40px;">
${ctaButton('Book Your First Appointment')}
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 32px 40px;">
          <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 22px; color: {{text_color}}; text-align: center;">
            With warmth,<br /><em style="color: {{primary_color}};">{{sender_name}}</em>
          </p>
        </td>
      </tr>`;

const GENERAL_BODY = `      <tr>
        <td class="px" style="padding: 40px 40px 16px 40px;">
          <p style="margin: 0 0 12px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: {{secondary_text}}; text-align: center;">
            A note from {{organization_name}}
          </p>
          <h1 class="h1" style="margin: 0 0 24px 0; font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-size: 28px; line-height: 38px; font-weight: 400; color: {{primary_color}}; text-align: center;">
            {{subject}}
          </h1>
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 32px 40px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: {{content_background}}; border-radius: 8px;">
            <tr>
              <td style="padding: 28px 32px;">
                <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 26px; color: {{text_color}};">
                  {{message}}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding: 0 40px 40px 40px;">
${ctaButton('Learn More')}
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 32px 40px;">
          <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 22px; color: {{text_color}}; text-align: center;">
            Warmly,<br /><em style="color: {{primary_color}};">{{sender_name}}</em>
          </p>
        </td>
      </tr>`;

const BIRTHDAY_BODY = `      <tr>
        <td class="px" style="padding: 40px 40px 16px 40px; text-align: center;">
          <p style="margin: 0 0 12px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: {{secondary_text}};">
            A celebration
          </p>
          <h1 class="h1" style="margin: 0 0 12px 0; font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-size: 32px; line-height: 42px; font-weight: 400; color: {{primary_color}};">
            Happy Birthday, {{client_name}}
          </h1>
          <p style="margin: 0 0 24px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 24px; color: {{secondary_text}};">
            {{birthday_date}}
          </p>
          <p style="margin: 0 0 8px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 26px; color: {{text_color}};">
            Today is your day, and we couldn't let it pass without a small token of our appreciation. Thank you for letting us be part of your beauty journey.
          </p>
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 8px 40px 32px 40px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: {{content_background}}; border-radius: 8px;">
            <tr>
              <td style="padding: 28px 32px; text-align: center;">
                <p style="margin: 0 0 8px 0; font-family: 'Playfair Display', Georgia, serif; font-size: 20px; color: {{primary_color}};">
                  Your gift from us
                </p>
                <p style="margin: 0 0 16px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 24px; color: {{text_color}};">
                  {{special_offer}}
                </p>
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;">
                  <tr>
                    <td style="padding: 10px 20px; border: 1px dashed {{primary_color}}; border-radius: 6px; font-family: 'Courier New', monospace; font-size: 16px; letter-spacing: 2px; color: {{primary_color}};">
                      {{discount_code}}
                    </td>
                  </tr>
                </table>
                <p style="margin: 12px 0 0 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: {{secondary_text}};">
                  Mention this code when you book.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding: 0 40px 40px 40px;">
${ctaButton('Treat Yourself')}
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 32px 40px;">
          <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 22px; color: {{text_color}}; text-align: center;">
            With love,<br /><em style="color: {{primary_color}};">{{sender_name}} &amp; the {{organization_name}} team</em>
          </p>
        </td>
      </tr>`;

const INACTIVE_BODY = `      <tr>
        <td class="px" style="padding: 40px 40px 16px 40px; text-align: center;">
          <p style="margin: 0 0 12px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: {{secondary_text}};">
            It's been a while
          </p>
          <h1 class="h1" style="margin: 0 0 16px 0; font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-size: 30px; line-height: 40px; font-weight: 400; color: {{primary_color}};">
            We miss you, {{client_name}}
          </h1>
          <p style="margin: 0 0 24px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 26px; color: {{text_color}};">
            It's been {{months_inactive}} months since we last saw you, and the chair just isn't the same without you. We'd love to welcome you back for a moment of pure self-care.
          </p>
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 24px 40px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: {{content_background}}; border-radius: 8px;">
            <tr>
              <td style="padding: 24px 28px;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="padding: 0 0 12px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: {{secondary_text}}; letter-spacing: 1px; text-transform: uppercase;">
                      Last visit
                    </td>
                    <td align="right" style="padding: 0 0 12px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: {{text_color}};">
                      {{last_visit_date}}
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="border-top: 1px solid #eeeae3; padding-top: 16px;">
                      <p style="margin: 0 0 8px 0; font-family: 'Playfair Display', Georgia, serif; font-size: 18px; color: {{primary_color}};">
                        A welcome-back gift
                      </p>
                      <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 23px; color: {{text_color}};">
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
${ctaButton('Book Your Return')}
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 32px 40px;">
          <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 22px; color: {{text_color}}; text-align: center;">
            We can't wait to see you again,<br /><em style="color: {{primary_color}};">{{sender_name}}</em>
          </p>
        </td>
      </tr>`;

const RENEWAL_BODY = `      <tr>
        <td class="px" style="padding: 40px 40px 16px 40px; text-align: center;">
          <p style="margin: 0 0 12px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: {{secondary_text}};">
            Package update
          </p>
          <h1 class="h1" style="margin: 0 0 16px 0; font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-size: 28px; line-height: 38px; font-weight: 400; color: {{primary_color}};">
            Time to renew your {{package_name}}
          </h1>
          <p style="margin: 0 0 24px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 26px; color: {{text_color}};">
            Hello {{client_name}}, your package is winding down and we'd hate for you to miss a single ritual. Renew now to continue your routine without interruption.
          </p>
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 24px 40px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: {{content_background}}; border-radius: 8px;">
            <tr>
              <td style="padding: 28px 32px;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td width="50%" style="padding: 0 8px 16px 0; vertical-align: top;">
                      <p style="margin: 0 0 4px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                        Sessions left
                      </p>
                      <p style="margin: 0; font-family: 'Playfair Display', Georgia, serif; font-size: 24px; color: {{primary_color}};">
                        {{sessions_remaining}}
                      </p>
                    </td>
                    <td width="50%" style="padding: 0 0 16px 8px; vertical-align: top;">
                      <p style="margin: 0 0 4px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                        Expires
                      </p>
                      <p style="margin: 0; font-family: 'Playfair Display', Georgia, serif; font-size: 24px; color: {{primary_color}};">
                        {{expiry_date}}
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="border-top: 1px solid #eeeae3; padding-top: 16px;">
                      <p style="margin: 0 0 4px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                        Renewal offer
                      </p>
                      <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 23px; color: {{text_color}};">
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
${ctaButton('Renew My Package')}
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 32px 40px;">
          <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 22px; color: {{text_color}}; text-align: center;">
            Here for you,<br /><em style="color: {{primary_color}};">{{sender_name}}</em>
          </p>
        </td>
      </tr>`;

const APPT_REMINDER_BODY = `      <tr>
        <td class="px" style="padding: 40px 40px 16px 40px; text-align: center;">
          <p style="margin: 0 0 12px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: {{secondary_text}};">
            Friendly reminder
          </p>
          <h1 class="h1" style="margin: 0 0 16px 0; font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-size: 28px; line-height: 38px; font-weight: 400; color: {{primary_color}};">
            See you soon, {{client_name}}
          </h1>
          <p style="margin: 0 0 24px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 26px; color: {{text_color}};">
            This is a gentle note confirming your upcoming appointment with {{organization_name}}. We're looking forward to taking care of you.
          </p>
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 24px 40px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: {{content_background}}; border-radius: 8px;">
            <tr>
              <td style="padding: 28px 32px;">
                <p style="margin: 0 0 16px 0; font-family: 'Playfair Display', Georgia, serif; font-size: 20px; color: {{primary_color}}; text-align: center;">
                  {{service_name}}
                </p>
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                      Date
                    </td>
                    <td align="right" style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: {{text_color}};">
                      {{appointment_date}}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                      Time
                    </td>
                    <td align="right" style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: {{text_color}};">
                      {{appointment_time}}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                      With
                    </td>
                    <td align="right" style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: {{text_color}};">
                      {{staff_name}}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                      Where
                    </td>
                    <td align="right" style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: {{text_color}};">
                      {{location}}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding: 8px 40px 16px 40px;">
${ctaButton('Manage Appointment')}
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 32px 40px;">
          <p style="margin: 0 0 12px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; line-height: 20px; color: {{secondary_text}}; text-align: center;">
            Need to reschedule? Reply to this email or call <a href="tel:{{organization_phone}}" style="color: {{primary_color}}; text-decoration: none;">{{organization_phone}}</a>.
          </p>
          <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 22px; color: {{text_color}}; text-align: center;">
            See you soon,<br /><em style="color: {{primary_color}};">{{sender_name}}</em>
          </p>
        </td>
      </tr>`;

// ---- Public-link booking templates ------------------------------------------

const BOOKING_RECEIVED_BODY = `      <tr>
        <td class="px" style="padding: 40px 40px 16px 40px; text-align: center;">
          <p style="margin: 0 0 12px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: {{secondary_text}};">
            Request received
          </p>
          <h1 class="h1" style="margin: 0 0 16px 0; font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-size: 28px; line-height: 38px; font-weight: 400; color: {{primary_color}};">
            Thank you, {{client_name}}
          </h1>
          <p style="margin: 0 0 24px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 26px; color: {{text_color}};">
            We've received your booking request and {{organization_name}} will confirm by email shortly.
          </p>
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 24px 40px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: {{content_background}}; border-radius: 8px;">
            <tr>
              <td style="padding: 28px 32px;">
                <p style="margin: 0 0 16px 0; font-family: 'Playfair Display', Georgia, serif; font-size: 20px; color: {{primary_color}}; text-align: center;">
                  {{treatment}}
                </p>
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                      Date
                    </td>
                    <td align="right" style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: {{text_color}};">
                      {{date}}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                      Time
                    </td>
                    <td align="right" style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: {{text_color}};">
                      {{time}}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 32px 40px;">
          <p style="margin: 0 0 12px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; line-height: 20px; color: {{secondary_text}}; text-align: center;">
            Questions? Reply to this email or call <a href="tel:{{organization_phone}}" style="color: {{primary_color}}; text-decoration: none;">{{organization_phone}}</a>.
          </p>
          <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 22px; color: {{text_color}}; text-align: center;">
            <em style="color: {{primary_color}};">{{sender_name}}</em>
          </p>
        </td>
      </tr>`;

const BOOKING_ADMIN_ALERT_BODY = `      <tr>
        <td class="px" style="padding: 40px 40px 16px 40px; text-align: center;">
          <p style="margin: 0 0 12px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: {{secondary_text}};">
            New booking request
          </p>
          <h1 class="h1" style="margin: 0 0 16px 0; font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-size: 28px; line-height: 38px; font-weight: 400; color: {{primary_color}};">
            {{visitor_name}}
          </h1>
          <p style="margin: 0 0 24px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 26px; color: {{text_color}};">
            A new public booking request is waiting in your Booking Requests panel.
          </p>
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 24px 40px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: {{content_background}}; border-radius: 8px;">
            <tr>
              <td style="padding: 28px 32px;">
                <p style="margin: 0 0 16px 0; font-family: 'Playfair Display', Georgia, serif; font-size: 20px; color: {{primary_color}}; text-align: center;">
                  {{treatment}}
                </p>
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                      Date
                    </td>
                    <td align="right" style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: {{text_color}};">
                      {{date}}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                      Time
                    </td>
                    <td align="right" style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: {{text_color}};">
                      {{time}}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                      Email
                    </td>
                    <td align="right" style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: {{text_color}};">
                      {{visitor_email}}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                      Phone
                    </td>
                    <td align="right" style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: {{text_color}};">
                      {{visitor_phone}}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding: 8px 40px 32px 40px;">
${ctaButton('Open Booking Requests')}
        </td>
      </tr>`;

const APPT_CONFIRMATION_BODY = `      <tr>
        <td class="px" style="padding: 40px 40px 16px 40px; text-align: center;">
          <p style="margin: 0 0 12px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: {{secondary_text}};">
            Appointment confirmed
          </p>
          <h1 class="h1" style="margin: 0 0 16px 0; font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-size: 28px; line-height: 38px; font-weight: 400; color: {{primary_color}};">
            Hi {{client_name}},
          </h1>
          <p style="margin: 0 0 24px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 26px; color: {{text_color}};">
            Your appointment is booked and we're already looking forward to taking care of you.
          </p>
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 24px 40px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: {{content_background}}; border-radius: 8px;">
            <tr>
              <td style="padding: 28px 32px;">
                <p style="margin: 0 0 16px 0; font-family: 'Playfair Display', Georgia, serif; font-size: 20px; color: {{primary_color}}; text-align: center;">
                  {{treatment}}
                </p>
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                      Date
                    </td>
                    <td align="right" style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: {{text_color}};">
                      {{date}}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                      Time
                    </td>
                    <td align="right" style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: {{text_color}};">
                      {{time}}
                    </td>
                  </tr>
                  {{#if staff}}
                  <tr>
                    <td style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                      With
                    </td>
                    <td align="right" style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: {{text_color}};">
                      {{staff}}
                    </td>
                  </tr>
                  {{/if}}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 24px 40px;">
          <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; line-height: 20px; color: {{secondary_text}}; text-align: center;">
            Need to reschedule? Reply to this email or call <a href="tel:{{organization_phone}}" style="color: {{primary_color}}; text-decoration: none;">{{organization_phone}}</a>.
          </p>
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 32px 40px;">
          <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 22px; color: {{text_color}}; text-align: center;">
            See you soon,<br /><em style="color: {{primary_color}};">{{sender_name}}</em>
          </p>
        </td>
      </tr>`;

const BOOKING_DECLINED_BODY = `      <tr>
        <td class="px" style="padding: 40px 40px 16px 40px; text-align: center;">
          <p style="margin: 0 0 12px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: {{secondary_text}};">
            About your booking
          </p>
          <h1 class="h1" style="margin: 0 0 16px 0; font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-size: 28px; line-height: 38px; font-weight: 400; color: {{primary_color}};">
            Hi {{client_name}},
          </h1>
          <p style="margin: 0 0 24px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 26px; color: {{text_color}};">
            Unfortunately we're unable to confirm your booking at the requested time. We'd love to find another moment to see you.
          </p>
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 24px 40px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: {{content_background}}; border-radius: 8px;">
            <tr>
              <td style="padding: 28px 32px;">
                <p style="margin: 0 0 16px 0; font-family: 'Playfair Display', Georgia, serif; font-size: 20px; color: {{primary_color}}; text-align: center;">
                  {{treatment}}
                </p>
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: {{secondary_text}};">
                      Requested
                    </td>
                    <td align="right" style="padding: 8px 0; border-top: 1px solid #eeeae3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: {{text_color}};">
                      {{date}} · {{time}}
                    </td>
                  </tr>
                </table>
                <p style="margin: 20px 0 0 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 22px; color: {{text_color}}; font-style: italic;">
                  "{{reason}}"
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding: 8px 40px 16px 40px;">
${ctaButton('Pick a New Time')}
        </td>
      </tr>
      <tr>
        <td class="px" style="padding: 0 40px 32px 40px;">
          <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 22px; color: {{text_color}}; text-align: center;">
            With warm regards,<br /><em style="color: {{primary_color}};">{{sender_name}}</em>
          </p>
        </td>
      </tr>`;

export function getDefaultTemplateHtml(type: TemplateType): string {
  switch (type) {
    case 'welcome':
      return shell(`${HEADER}\n${WELCOME_BODY}\n${FOOTER}`);
    case 'general':
      return shell(`${HEADER}\n${GENERAL_BODY}\n${FOOTER}`);
    case 'birthday':
      return shell(`${HEADER}\n${BIRTHDAY_BODY}\n${FOOTER}`);
    case 'inactive':
      return shell(`${HEADER}\n${INACTIVE_BODY}\n${FOOTER}`);
    case 'package_renewal':
      return shell(`${HEADER}\n${RENEWAL_BODY}\n${FOOTER}`);
    case 'appointment_reminder':
      return shell(`${HEADER}\n${APPT_REMINDER_BODY}\n${FOOTER}`);
    case 'appointment_confirmation':
      return shell(`${HEADER}\n${APPT_CONFIRMATION_BODY}\n${FOOTER}`);
    case 'booking_request_received':
      return shell(`${HEADER}\n${BOOKING_RECEIVED_BODY}\n${FOOTER}`);
    case 'booking_request_admin_alert':
      return shell(`${HEADER}\n${BOOKING_ADMIN_ALERT_BODY}\n${FOOTER}`);
    case 'booking_request_declined':
      return shell(`${HEADER}\n${BOOKING_DECLINED_BODY}\n${FOOTER}`);
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
