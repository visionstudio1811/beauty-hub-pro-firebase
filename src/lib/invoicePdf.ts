import jsPDF from 'jspdf';
import type { Invoice } from '@/types/firestore';
import { getInvoiceTheme } from '@/lib/invoiceThemes';

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

function formatCents(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'USD',
    }).format(cents / 100);
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
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeZone: timezone || 'UTC',
    }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
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
    align?: 'left' | 'right' | 'center';
    maxWidth?: number;
  } = {},
): number {
  if (!text) return y;
  const {
    bold = false,
    color = '#111111',
    font = 'helvetica',
    align = 'left',
    maxWidth = 1000,
  } = opts;
  doc.setFont(font, bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  doc.setTextColor(color);
  const lines = doc.splitTextToSize(text, maxWidth);
  const lineH = size * 1.3;
  let cy = y;
  for (const line of lines) {
    doc.text(line, x, cy, { align, baseline: 'top' });
    cy += lineH;
  }
  return cy;
}

export async function buildInvoicePdf(
  invoice: Invoice,
  themeIdOverride?: string,
): Promise<Blob> {
  const themeId =
    themeIdOverride ??
    (invoice.business_snapshot as any)?.invoice_template ??
    'classic';
  const theme = getInvoiceTheme(themeId);

  const locale = navigator?.language || 'en-US';
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const gutter = 20;
  const contentW = pageW - margin * 2;
  const colW = (contentW - gutter) / 2;

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
    barY = drawTextAt(doc, margin, barY, biz.name || 'Invoice', 20, {
      bold: true,
      color: theme.accentInk,
      font: theme.titleFont,
    });

    const contactBits = [biz.address, biz.phone, biz.email, biz.website]
      .filter((s) => !!s && s.length > 0)
      .join('   ·   ');
    if (contactBits) {
      barY = drawTextAt(doc, margin, barY + 4, contactBits, 9, {
        color: theme.accentInk,
        maxWidth: pageW - margin * 2 - 140,
      });
    }
    if (biz.tax_id) {
      drawTextAt(doc, margin, barY + 2, `Tax ID: ${biz.tax_id}`, 9, {
        color: theme.accentInk,
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
        pageW - margin - drawW,
        (barHeight - drawH) / 2,
        drawW,
        drawH,
      );
    }

    y = barHeight + 24;
  } else {
    // Two-column minimal header: business info LEFT, invoice meta + logo RIGHT.
    const headerTop = y;
    let leftY = headerTop;
    let rightY = headerTop;

    // Right column — logo on top (if present), then INVOICE label + meta
    if (logoDataUrl && logoDims) {
      const maxW = colW;
      const maxH = 60;
      const ratio = Math.min(maxW / logoDims.w, maxH / logoDims.h, 1);
      const drawW = logoDims.w * ratio;
      const drawH = logoDims.h * ratio;
      const fmt = logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(logoDataUrl, fmt, pageW - margin - drawW, rightY, drawW, drawH);
      rightY += drawH + 10;
    }

    rightY = drawTextAt(doc, pageW - margin, rightY, 'INVOICE', 26, {
      bold: true,
      color: theme.accent,
      font: theme.titleFont,
      align: 'right',
    });
    rightY += 4;
    rightY = drawTextAt(
      doc,
      pageW - margin,
      rightY,
      `Invoice #: ${invoice.invoice_number}`,
      10,
      { color: theme.ink, align: 'right' },
    );
    rightY = drawTextAt(
      doc,
      pageW - margin,
      rightY,
      `Date: ${formatDate(invoice.issued_at, biz.timezone, locale)}`,
      10,
      { color: theme.ink, align: 'right' },
    );

    // Left column — business info
    if (biz.name) {
      leftY = drawTextAt(doc, margin, leftY, biz.name, 18, {
        bold: true,
        color: theme.ink,
        font: theme.titleFont,
        maxWidth: colW,
      });
      leftY += 4;
    }
    if (biz.address) {
      leftY = drawTextAt(doc, margin, leftY, biz.address, 10, {
        color: theme.muted,
        maxWidth: colW,
      });
    }
    if (biz.phone) {
      leftY = drawTextAt(doc, margin, leftY, biz.phone, 10, {
        color: theme.muted,
        maxWidth: colW,
      });
    }
    if (biz.email) {
      leftY = drawTextAt(doc, margin, leftY, biz.email, 10, {
        color: theme.muted,
        maxWidth: colW,
      });
    }
    if (biz.website) {
      leftY = drawTextAt(doc, margin, leftY, biz.website, 10, {
        color: theme.muted,
        maxWidth: colW,
      });
    }
    if (biz.tax_id) {
      leftY = drawTextAt(doc, margin, leftY, `Tax ID: ${biz.tax_id}`, 10, {
        color: theme.muted,
        maxWidth: colW,
      });
    }

    y = Math.max(leftY, rightY) + 18;
    drawRule(y);
    y += 18;
  }

  // ── BILL TO (left) + invoice meta (right, only for bar-top) ─────
  const billToTop = y;
  let billToY = billToTop;

  billToY = drawTextAt(doc, margin, billToY, 'BILL TO', 9, {
    bold: true,
    color: theme.muted,
  });
  billToY += 2;
  if (client.name) {
    billToY = drawTextAt(doc, margin, billToY, client.name, 13, {
      bold: true,
      color: theme.ink,
      font: theme.titleFont,
      maxWidth: colW,
    });
  }
  if (client.email) {
    billToY = drawTextAt(doc, margin, billToY, client.email, 10, {
      color: theme.muted,
      maxWidth: colW,
    });
  }
  if (client.phone) {
    billToY = drawTextAt(doc, margin, billToY, client.phone, 10, {
      color: theme.muted,
      maxWidth: colW,
    });
  }
  if (client.address) {
    billToY = drawTextAt(doc, margin, billToY, client.address, 10, {
      color: theme.muted,
      maxWidth: colW,
    });
  }

  // For bar-top themes, the invoice meta wasn't placed in the bar — put it
  // to the right of Bill To.
  let metaY = billToTop;
  if (theme.headerStyle === 'bar-top') {
    metaY = drawTextAt(doc, pageW - margin, metaY, 'INVOICE', 22, {
      bold: true,
      color: theme.accent,
      font: theme.titleFont,
      align: 'right',
    });
    metaY += 4;
    metaY = drawTextAt(
      doc,
      pageW - margin,
      metaY,
      `Invoice #: ${invoice.invoice_number}`,
      10,
      { color: theme.ink, align: 'right' },
    );
    metaY = drawTextAt(
      doc,
      pageW - margin,
      metaY,
      `Date: ${formatDate(invoice.issued_at, biz.timezone, locale)}`,
      10,
      { color: theme.ink, align: 'right' },
    );
  }

  y = Math.max(billToY, metaY) + 18;

  // ── LINE ITEMS ────────────────────────────────────────
  drawRule(y);
  y += 14;
  y = drawTextAt(doc, margin, y, 'DESCRIPTION', 9, {
    bold: true,
    color: theme.muted,
  });
  y += 6;

  for (const item of invoice.line_items) {
    y = drawTextAt(doc, margin, y, item.name, 14, {
      bold: true,
      color: theme.ink,
      font: theme.titleFont,
      maxWidth: contentW,
    });
    if (item.description) {
      y = drawTextAt(doc, margin, y, item.description, 10, {
        color: theme.muted,
        maxWidth: contentW,
      });
    }

    if (item.type === 'package' && item.treatments && item.treatments.length > 0) {
      y += 8;
      y = drawTextAt(doc, margin, y, 'INCLUDED TREATMENTS', 8, {
        bold: true,
        color: theme.muted,
      });
      y += 2;
      for (const t of item.treatments) {
        const qty = t.quantity > 0 ? `${t.quantity}×` : '—';
        const priceStr = `${formatCents(t.unit_price_cents, invoice.currency, locale)} each`;
        drawTextAt(doc, margin + 8, y, `•  ${t.name}   ${qty}`, 10, {
          color: theme.ink,
          maxWidth: colW,
        });
        drawTextAt(doc, pageW - margin, y, priceStr, 10, {
          color: theme.muted,
          align: 'right',
        });
        y += 13;
      }
    }
    y += 10;
    drawTextAt(
      doc,
      pageW - margin,
      y,
      `Subtotal: ${formatCents(item.subtotal_cents, invoice.currency, locale)}`,
      11,
      { bold: true, color: theme.ink, align: 'right' },
    );
    y += 20;
  }

  // ── TOTALS BLOCK ──────────────────────────────────────
  y += 6;
  const totalsBoxH = 86;
  doc.setFillColor(theme.totalsBg);
  doc.rect(margin, y, contentW, totalsBoxH, 'F');

  let totalsY = y + 16;
  totalsY = drawTextAt(
    doc,
    pageW - margin - 12,
    totalsY,
    `Subtotal: ${formatCents(invoice.subtotal_cents, invoice.currency, locale)}`,
    11,
    { color: theme.ink, align: 'right' },
  );
  totalsY += 2;
  totalsY = drawTextAt(
    doc,
    pageW - margin - 12,
    totalsY,
    `Tax (${invoice.tax_rate}%): ${formatCents(invoice.tax_amount_cents, invoice.currency, locale)}`,
    11,
    { color: theme.ink, align: 'right' },
  );
  totalsY += 6;
  drawTextAt(
    doc,
    pageW - margin - 12,
    totalsY,
    `Total: ${formatCents(invoice.total_cents, invoice.currency, locale)}`,
    16,
    { bold: true, color: theme.accent, font: theme.titleFont, align: 'right' },
  );

  y += totalsBoxH + 18;

  // ── FOOTER ────────────────────────────────────────────
  if (biz.payment_terms) {
    y = drawTextAt(doc, margin, y, 'PAYMENT TERMS', 9, {
      bold: true,
      color: theme.muted,
    });
    y += 2;
    y = drawTextAt(doc, margin, y, biz.payment_terms, 10, {
      color: theme.ink,
      maxWidth: contentW,
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
