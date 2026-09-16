import type jsPDF from 'jspdf';

/**
 * Registers the Rubik font family (Latin + Hebrew glyphs) into a jsPDF document.
 *
 * jsPDF's built-in Helvetica has no Hebrew glyphs, so every PDF that may contain
 * Hebrew must call this first and then use `doc.setFont(PDF_FONT_FAMILY, 'normal' | 'bold')`.
 * For right-to-left text call `doc.setR2L(true)` before drawing Hebrew runs (jsPDF
 * reverses the glyph order per line — Hebrew has no contextual shaping, so this is
 * enough) and `doc.setR2L(false)` again for Latin/number runs, or use the helper
 * `applyPdfDirection(doc, text)` below which toggles R2L based on the text content.
 *
 * Font files live in /public/fonts and are fetched lazily (once per page load).
 */
export const PDF_FONT_FAMILY = 'Rubik';

const FONT_FILES: Array<{ file: string; style: 'normal' | 'bold' }> = [
  { file: 'Rubik-Regular.ttf', style: 'normal' },
  { file: 'Rubik-Bold.ttf', style: 'bold' },
];

const cache = new Map<string, Promise<string>>();

function fetchAsBase64(file: string): Promise<string> {
  const existing = cache.get(file);
  if (existing) return existing;
  const p = (async () => {
    const res = await fetch(`/fonts/${file}`);
    if (!res.ok) throw new Error(`Failed to load font ${file}: ${res.status}`);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    return btoa(binary);
  })();
  cache.set(file, p);
  return p;
}

/**
 * Load + register Rubik regular/bold on `doc`. Idempotent per document.
 * Returns the family name to pass to `doc.setFont`.
 */
export async function registerPdfFonts(doc: jsPDF): Promise<string> {
  const loaded = await Promise.all(FONT_FILES.map((f) => fetchAsBase64(f.file)));
  FONT_FILES.forEach((f, i) => {
    doc.addFileToVFS(f.file, loaded[i]);
    doc.addFont(f.file, PDF_FONT_FAMILY, f.style);
  });
  return PDF_FONT_FAMILY;
}

const HEBREW_RE = /[֐-׿]/;

/** True when the string contains at least one Hebrew letter. */
export function containsHebrew(text: string): boolean {
  return HEBREW_RE.test(text);
}

/** Toggle jsPDF's R2L mode based on whether `text` contains Hebrew. */
export function applyPdfDirection(doc: jsPDF, text: string): void {
  doc.setR2L(containsHebrew(text));
}

/** Horizontal alignment to use for body text in the given language. */
export function pdfAlignFor(lang: string): 'left' | 'right' {
  return lang === 'he' ? 'right' : 'left';
}
