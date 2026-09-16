import jsPDF from 'jspdf';
import type { Invoice } from '@/types/firestore';
import { getInvoiceTheme } from '@/lib/invoiceThemes';
import i18n, { localeFor } from '@/i18n';
import {
  PDF_FONT_FAMILY,
  applyPdfDirection,
  containsHebrew,
  pdfAlignFor,
  registerPdfFonts,
} from '@/lib/pdfFonts';

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function loadImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = dataUrl;
  });
}

// Invisible bidi control characters (LRM/RLM/embeddings/isolates) that
// Intl.NumberFormat emits for some locales. They have no glyph in the PDF
// font and would render as boxes, and we handle direction ourselves anyway.
const BIDI_CONTROL_RE = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

function stripBidiControls(text: string): string {
  return text.replace(BIDI_CONTROL_RE, '');
}

function formatCents(cents: number, currency: string, locale: string): string {
  try {
    return stripBidiControls(
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency || 'USD',
      }).format(cents / 100),
    );
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency || 'USD'}`;
  }
}

function formatDate(isoOrTimestamp: any, timezone: string, locale: string): string {
  const d =
    isoOrTimestamp?.toDate?.() ??
    (isoOrTimestamp?.seconds
      ? new Date(isoOrTimestamp.seconds * 1000)
      : new Date(isoOrTimestamp));
  try {
    return stripBidiControls(
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeZone: timezone || 'UTC',
      }).format(d),
    );
  } catch {
    return d.toLocaleDateString(locale);
  }
}

type PdfAlign = 'left' | 'right' | 'center';

interface BidiRun {
  text: string;
  rtl: boolean;
}

const HEBREW_CHAR_RE = /[\u0590-\u05FF]/;
const LTR_STRONG_RE = /[A-Za-z0-9\u00C0-\u024F]/;

/**
 * Split a single line into directional runs. Hebrew letters are strong RTL,
 * Latin letters and digits are strong LTR, everything else (spaces,
 * punctuation, currency symbols) attaches to the preceding strong run — or
 * to the paragraph direction when nothing strong precedes it.
 *
 * This is a deliberately small subset of the Unicode bidi algorithm: enough
 * to keep invoice numbers, amounts and dates readable inside Hebrew labels.
 */
function splitBidiRuns(line: string, baseRtl: boolean): BidiRun[] {
  const runs: BidiRun[] = [];
  let pendingNeutral = '';

  for (const ch of line) {
    const isHeb = HEBREW_CHAR_RE.test(ch);
    const isLtr = !isHeb && LTR_STRONG_RE.test(ch);
    if (!isHeb && !isLtr) {
      pendingNeutral += ch;
      continue;
    }
    const rtl = isHeb;
    const current = runs.length > 0 ? runs[runs.length - 1] : null;
    if (current && current.rtl === rtl) {
      current.text += pendingNeutral + ch;
    } else if (current) {
      // Neutrals between two runs of different direction stay with the run
      // that preceded them (matches how a label's ": " hugs the label).
      current.text += pendingNeutral;
      runs.push({ text: ch, rtl });
    } else if (pendingNeutral && baseRtl !== rtl) {
      // Leading neutrals take the paragraph direction.
      runs.push({ text: pendingNeutral, rtl: baseRtl });
      runs.push({ text: ch, rtl });
    } else {
      runs.push({ text: pendingNeutral + ch, rtl });
    }
    pendingNeutral = '';
  }
  if (pendingNeutral) {
    if (runs.length > 0) runs[runs.length - 1].text += pendingNeutral;
    else runs.push({ text: pendingNeutral, rtl: baseRtl });
  }
  return runs;
}

/**
 * Draw one already-wrapped line at (x, y). In an LTR document that has no
 * Hebrew in it this is exactly `doc.text(line, x, y, { align })`. When the
 * line mixes directions it is split into runs and each run is positioned
 * separately so Hebrew is reversed for the PDF glyph stream while Latin
 * text, numbers and amounts keep their natural order.
 */
function drawBidiLine(
  doc: jsPDF,
  x: number,
  y: number,
  line: string,
  align: PdfAlign,
  baseRtl: boolean,
): void {
  const runs = containsHebrew(line) ? splitBidiRuns(line, baseRtl) : [];
  if (runs.length <= 1) {
    applyPdfDirection(doc, line);
    doc.text(line, x, y, { align, baseline: 'top' });
    doc.setR2L(false);
    return;
  }

  const widths = runs.map((r) => doc.getTextWidth(r.text));
  const total = widths.reduce((s, w) => s + w, 0);
  const left = align === 'left' ? x : align === 'right' ? x - total : x - total / 2;

  if (baseRtl) {
    // Logical runs are laid out right-to-left.
    let right = left + total;
    runs.forEach((run, i) => {
      applyPdfDirection(doc, run.text);
      doc.text(run.text, right, y, { align: 'right', baseline: 'top' });
      right -= widths[i];
    });
  } else {
    let cursor = left;
    runs.forEach((run, i) => {
      applyPdfDirection(doc, run.text);
      doc.text(run.text, cursor, y, { align: 'left', baseline: 'top' });
      cursor += widths[i];
    });
  }
  doc.setR2L(false);
}

// y always represents the TOP of the next line to draw (via
// `baseline: 'top'`). Each draw returns the new y — callers don't mutate
// external state. This is what lets us do side-by-side columns cleanly.
function drawTextAt(
  doc: jsPDF,
  x: number,
  y: number,
  text: string,
  size: number,
  opts: {
    bold?: boolean;
    color?: string;
    font?: 'helvetica' | 'times';
    align?: PdfAlign;
    maxWidth?: number;
    baseRtl?: boolean;
    /**
     * Prefer the embedded Rubik family for every run (Hebrew documents).
     * When false (English documents) the built-in Helvetica / Times fonts are
     * used exactly as before the i18n pass, and Rubik is only pulled in for
     * strings that actually contain Hebrew glyphs (e.g. a Hebrew client name).
     */
    rubik?: boolean;
  } = {},
): number {
  if (!text) return y;
  const {
    bold = false,
    color = '#111111',
    font = 'helvetica',
    align = 'left',
    maxWidth = 1000,
    baseRtl = false,
    rubik = false,
  } = opts;
  const clean = stripBidiControls(text);
  // Rubik carries both Latin and Hebrew glyphs; jsPDF's built-in fonts have
  // none. It is used for the whole document in Hebrew, and only for Hebrew
  // runs in English so existing English invoices keep their metrics. If the
  // font files could not be fetched (offline, 404) we fall back to the
  // built-in fonts rather than failing the whole PDF.
  const rubikAvailable = Boolean(doc.getFontList()?.[PDF_FONT_FAMILY]);
  const wantsRubik = rubik || containsHebrew(clean);
  const family = rubikAvailable && wantsRubik ? PDF_FONT_FAMILY : font;
  doc.setFont(family, bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  doc.setTextColor(color);
  const lines: string[] = doc.splitTextToSize(clean, maxWidth);
  const lineH = size * 1.3;
  let cy = y;
  for (const line of lines) {
    drawBidiLine(doc, x, cy, line, align, baseRtl);
    cy += lineH;
  }
  return cy;
}

export interface BuildInvoicePdfOptions {
  /**
   * Language to render the PDF in ('en' | 'he'). Issued invoices are stored
   * permanently, so callers should pass the org's language rather than the
   * signed-in staff member's UI language. Defaults to the active UI language.
   */
  lang?: string;
}

export async function buildInvoicePdf(
  invoice: Invoice,
  themeIdOverride?: string,
  options: BuildInvoicePdfOptions = {},
): Promise<Blob> {
  const themeId =
    themeIdOverride ??
    (invoice.business_snapshot as any)?.invoice_template ??
    'classic';
  const theme = getInvoiceTheme(themeId);

  const lang = options.lang || i18n.language || 'en';
  const isHe = lang === 'he';
  const locale = localeFor(lang);
  const fixedT = i18n.getFixedT(lang, 'invoices');
  const t = (key: string, vars?: Record<string, unknown>) =>
    fixedT(`pdf.${key}`, vars) as string;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  // The Hebrew-capable font is fetched from /fonts. If that fails (offline,
  // stale PWA cache, 404 on a white-label host) keep going with jsPDF's
  // built-in fonts — English invoices render exactly as before.
  try {
    await registerPdfFonts(doc);
  } catch (err) {
    console.warn('Invoice PDF: could not load embedded fonts, using built-in fonts', err);
  }
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const gutter = 20;
  const contentW = pageW - margin * 2;
  const colW = (contentW - gutter) / 2;

  // Logical edges: "start" is where body text begins (left in English,
  // right in Hebrew); "end" is the opposite edge where amounts/meta go.
  const startX = isHe ? pageW - margin : margin;
  const endX = isHe ? margin : pageW - margin;
  const startAlign: PdfAlign = pdfAlignFor(lang);
  const endAlign: PdfAlign = isHe ? 'left' : 'right';
  const indent = (px: number) => (isHe ? -px : px);
  const body = { baseRtl: isHe, rubik: isHe };

  const drawRule = (atY: number, color = theme.rule) => {
    doc.setDrawColor(color);
    doc.setLineWidth(0.5);
    doc.line(margin, atY, pageW - margin, atY);
  };

  const biz = invoice.business_snapshot;
  const client = invoice.client_snapshot;

  const logoDataUrl = biz.logo_url ? await urlToDataUrl(biz.logo_url) : null;
  let logoDims: { w: number; h: number } | null = null;
  if (logoDataUrl) logoDims = await loadImageSize(logoDataUrl);

  let y = margin;

  // ── HEADER ────────────────────────────────────────────
  if (theme.headerStyle === 'bar-top') {
    const barHeight = 100;
    doc.setFillColor(theme.accent);
    doc.rect(0, 0, pageW, barHeight, 'F');

    let barY = 24;
    barY = drawTextAt(doc, startX, barY, biz.name || t('invoiceFallbackName'), 20, {
      bold: true,
      color: theme.accentInk,
      font: theme.titleFont,
      align: startAlign,
      ...body,
    });

    const contactBits = [biz.address, biz.phone, biz.email, biz.website]
      .filter((s) => !!s && s.length > 0)
      .join('   ·   ');
    if (contactBits) {
      barY = drawTextAt(doc, startX, barY + 4, contactBits, 9, {
        color: theme.accentInk,
        maxWidth: pageW - margin * 2 - 140,
        align: startAlign,
        ...body,
      });
    }
    if (biz.tax_id) {
      drawTextAt(doc, startX, barY + 2, t('taxId', { taxId: biz.tax_id }), 9, {
        color: theme.accentInk,
        align: startAlign,
        ...body,
      });
    }

    if (logoDataUrl && logoDims) {
      const maxW = 110;
      const maxH = 70;
      const ratio = Math.min(maxW / logoDims.w, maxH / logoDims.h, 1);
      const drawW = logoDims.w * ratio;
      const drawH = logoDims.h * ratio;
      const fmt = logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(
        logoDataUrl,
        fmt,
        isHe ? margin : pageW - margin - drawW,
        (barHeight - drawH) / 2,
        drawW,
        drawH,
      );
    }

    y = barHeight + 24;
  } else {
    // Two-column minimal header: business info at the START edge, invoice
    // meta + logo at the END edge (mirrored for Hebrew).
    const headerTop = y;
    let leftY = headerTop;
    let rightY = headerTop;

    // End column — logo on top (if present), then INVOICE label + meta
    if (logoDataUrl && logoDims) {
      const maxW = colW;
      const maxH = 60;
      const ratio = Math.min(maxW / logoDims.w, maxH / logoDims.h, 1);
      const drawW = logoDims.w * ratio;
      const drawH = logoDims.h * ratio;
      const fmt = logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(
        logoDataUrl,
        fmt,
        isHe ? margin : pageW - margin - drawW,
        rightY,
        drawW,
        drawH,
      );
      rightY += drawH + 10;
    }

    rightY = drawTextAt(doc, endX, rightY, t('invoiceTitle'), 26, {
      bold: true,
      color: theme.accent,
      font: theme.titleFont,
      align: endAlign,
      ...body,
    });
    rightY += 4;
    rightY = drawTextAt(
      doc,
      endX,
      rightY,
      t('invoiceNumber', { number: invoice.invoice_number }),
      10,
      { color: theme.ink, align: endAlign, ...body },
    );
    rightY = drawTextAt(
      doc,
      endX,
      rightY,
      t('date', { date: formatDate(invoice.issued_at, biz.timezone, locale) }),
      10,
      { color: theme.ink, align: endAlign, ...body },
    );

    // Start column — business info
    if (biz.name) {
      leftY = drawTextAt(doc, startX, leftY, biz.name, 18, {
        bold: true,
        color: theme.ink,
        font: theme.titleFont,
        maxWidth: colW,
        align: startAlign,
        ...body,
      });
      leftY += 4;
    }
    if (biz.address) {
      leftY = drawTextAt(doc, startX, leftY, biz.address, 10, {
        color: theme.muted,
        maxWidth: colW,
        align: startAlign,
        ...body,
      });
    }
    if (biz.phone) {
      leftY = drawTextAt(doc, startX, leftY, biz.phone, 10, {
        color: theme.muted,
        maxWidth: colW,
        align: startAlign,
        ...body,
      });
    }
    if (biz.email) {
      leftY = drawTextAt(doc, startX, leftY, biz.email, 10, {
        color: theme.muted,
        maxWidth: colW,
        align: startAlign,
        ...body,
      });
    }
    if (biz.website) {
      leftY = drawTextAt(doc, startX, leftY, biz.website, 10, {
        color: theme.muted,
        maxWidth: colW,
        align: startAlign,
        ...body,
      });
    }
    if (biz.tax_id) {
      leftY = drawTextAt(doc, startX, leftY, t('taxId', { taxId: biz.tax_id }), 10, {
        color: theme.muted,
        maxWidth: colW,
        align: startAlign,
        ...body,
      });
    }

    y = Math.max(leftY, rightY) + 18;
    drawRule(y);
    y += 18;
  }

  // ── BILL TO (start) + invoice meta (end, only for bar-top) ─────
  const billToTop = y;
  let billToY = billToTop;

  billToY = drawTextAt(doc, startX, billToY, t('billTo'), 9, {
    bold: true,
    color: theme.muted,
    align: startAlign,
    ...body,
  });
  billToY += 2;
  if (client.name) {
    billToY = drawTextAt(doc, startX, billToY, client.name, 13, {
      bold: true,
      color: theme.ink,
      font: theme.titleFont,
      maxWidth: colW,
      align: startAlign,
      ...body,
    });
  }
  if (client.email) {
    billToY = drawTextAt(doc, startX, billToY, client.email, 10, {
      color: theme.muted,
      maxWidth: colW,
      align: startAlign,
      ...body,
    });
  }
  if (client.phone) {
    billToY = drawTextAt(doc, startX, billToY, client.phone, 10, {
      color: theme.muted,
      maxWidth: colW,
      align: startAlign,
      ...body,
    });
  }
  if (client.address) {
    billToY = drawTextAt(doc, startX, billToY, client.address, 10, {
      color: theme.muted,
      maxWidth: colW,
      align: startAlign,
      ...body,
    });
  }

  // For bar-top themes, the invoice meta wasn't placed in the bar — put it
  // at the end edge, beside Bill To.
  let metaY = billToTop;
  if (theme.headerStyle === 'bar-top') {
    metaY = drawTextAt(doc, endX, metaY, t('invoiceTitle'), 22, {
      bold: true,
      color: theme.accent,
      font: theme.titleFont,
      align: endAlign,
      ...body,
    });
    metaY += 4;
    metaY = drawTextAt(
      doc,
      endX,
      metaY,
      t('invoiceNumber', { number: invoice.invoice_number }),
      10,
      { color: theme.ink, align: endAlign, ...body },
    );
    metaY = drawTextAt(
      doc,
      endX,
      metaY,
      t('date', { date: formatDate(invoice.issued_at, biz.timezone, locale) }),
      10,
      { color: theme.ink, align: endAlign, ...body },
    );
  }

  y = Math.max(billToY, metaY) + 18;

  // ── LINE ITEMS ────────────────────────────────────────
  drawRule(y);
  y += 14;
  y = drawTextAt(doc, startX, y, t('description'), 9, {
    bold: true,
    color: theme.muted,
    align: startAlign,
    ...body,
  });
  y += 6;

  for (const item of invoice.line_items) {
    y = drawTextAt(doc, startX, y, item.name, 14, {
      bold: true,
      color: theme.ink,
      font: theme.titleFont,
      maxWidth: contentW,
      align: startAlign,
      ...body,
    });
    if (item.description) {
      y = drawTextAt(doc, startX, y, item.description, 10, {
        color: theme.muted,
        maxWidth: contentW,
        align: startAlign,
        ...body,
      });
    }

    if (item.type === 'package' && item.treatments && item.treatments.length > 0) {
      y += 8;
      y = drawTextAt(doc, startX, y, t('includedTreatments'), 8, {
        bold: true,
        color: theme.muted,
        align: startAlign,
        ...body,
      });
      y += 2;
      for (const tr of item.treatments) {
        const qty = tr.quantity > 0 ? `${tr.quantity}×` : '—';
        const priceStr = t('priceEach', {
          price: formatCents(tr.unit_price_cents, invoice.currency, locale),
        });
        drawTextAt(doc, startX + indent(8), y, `•  ${tr.name}   ${qty}`, 10, {
          color: theme.ink,
          maxWidth: colW,
          align: startAlign,
          ...body,
        });
        drawTextAt(doc, endX, y, priceStr, 10, {
          color: theme.muted,
          align: endAlign,
          ...body,
        });
        y += 13;
      }
    }

    if (item.type === 'package' && item.bundled_products && item.bundled_products.length > 0) {
      y += 6;
      y = drawTextAt(doc, startX, y, t('includedProducts'), 8, {
        bold: true,
        color: theme.muted,
        align: startAlign,
        ...body,
      });
      y += 2;
      for (const p of item.bundled_products) {
        drawTextAt(doc, startX + indent(8), y, `•  ${p.name}   ${p.quantity}×`, 10, {
          color: theme.ink,
          maxWidth: colW,
          align: startAlign,
          ...body,
        });
        drawTextAt(doc, endX, y, t('included'), 10, {
          color: theme.muted,
          align: endAlign,
          ...body,
        });
        y += 13;
      }
    }

    y += 10;
    drawTextAt(
      doc,
      endX,
      y,
      t('lineSubtotal', {
        amount: formatCents(item.subtotal_cents, invoice.currency, locale),
      }),
      11,
      { bold: true, color: theme.ink, align: endAlign, ...body },
    );
    y += 20;
  }

  // ── TOTALS BLOCK ──────────────────────────────────────
  y += 6;
  const totalsBoxH = 86;
  doc.setFillColor(theme.totalsBg);
  doc.rect(margin, y, contentW, totalsBoxH, 'F');

  const totalsX = endX + indent(-12);
  let totalsY = y + 16;
  totalsY = drawTextAt(
    doc,
    totalsX,
    totalsY,
    t('subtotal', { amount: formatCents(invoice.subtotal_cents, invoice.currency, locale) }),
    11,
    { color: theme.ink, align: endAlign, ...body },
  );
  totalsY += 2;
  totalsY = drawTextAt(
    doc,
    totalsX,
    totalsY,
    t('tax', {
      rate: invoice.tax_rate,
      amount: formatCents(invoice.tax_amount_cents, invoice.currency, locale),
    }),
    11,
    { color: theme.ink, align: endAlign, ...body },
  );
  totalsY += 6;
  drawTextAt(
    doc,
    totalsX,
    totalsY,
    t('total', { amount: formatCents(invoice.total_cents, invoice.currency, locale) }),
    16,
    { bold: true, color: theme.accent, font: theme.titleFont, align: endAlign, ...body },
  );

  y += totalsBoxH + 18;

  // ── FOOTER ────────────────────────────────────────────
  if (invoice.payment_method) {
    y = drawTextAt(doc, startX, y, t('paymentMethod'), 9, {
      bold: true,
      color: theme.muted,
      align: startAlign,
      ...body,
    });
    y += 2;
    const methodLabel = fixedT(`paymentMethods.${invoice.payment_method}`, {
      defaultValue: invoice.payment_method,
    }) as string;
    y = drawTextAt(doc, startX, y, methodLabel, 10, {
      color: theme.ink,
      maxWidth: contentW,
      align: startAlign,
      ...body,
    });
    y += 12;
  }
  if (biz.payment_terms) {
    y = drawTextAt(doc, startX, y, t('paymentTerms'), 9, {
      bold: true,
      color: theme.muted,
      align: startAlign,
      ...body,
    });
    y += 2;
    y = drawTextAt(doc, startX, y, biz.payment_terms, 10, {
      color: theme.ink,
      maxWidth: contentW,
      align: startAlign,
      ...body,
    });
    y += 12;
  }
  if (biz.notes) {
    y += 4;
    drawRule(y, theme.rule);
    y += 10;
    drawTextAt(doc, pageW / 2, y, biz.notes, 10, {
      color: theme.muted,
      align: 'center',
      maxWidth: contentW,
      ...body,
    });
  }

  // Accent bottom line on bar-top themes — matches the top bar
  if (theme.headerStyle === 'bar-top') {
    doc.setFillColor(theme.rule);
    doc.rect(0, pageH - 8, pageW, 8, 'F');
  }

  return doc.output('blob');
}

export type { InvoiceTheme } from '@/lib/invoiceThemes';
export { INVOICE_THEMES, INVOICE_THEME_LIST, getInvoiceTheme } from '@/lib/invoiceThemes';
