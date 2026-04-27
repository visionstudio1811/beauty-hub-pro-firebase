// Visual themes for the invoice PDF. Each theme is a set of color tokens
// plus a header-style variant. The PDF builder branches on `headerStyle`
// and applies colors everywhere else.
//
// Adding a new theme: add an entry with the same shape and it appears in
// the Settings picker automatically.

export type InvoiceHeaderStyle = 'minimal' | 'bar-top';
export type InvoiceFont = 'helvetica' | 'times';

export interface InvoiceTheme {
  id: string;
  label: string;
  tagline: string;
  ink: string;              // main body text
  muted: string;            // labels, secondary text
  accent: string;           // title color / accent lines / filled bar
  accentInk: string;        // text color on top of the accent (for bar-top)
  rule: string;             // divider lines
  totalsBg: string;         // optional fill on the totals block
  headerStyle: InvoiceHeaderStyle;
  titleFont: InvoiceFont;
  bodyFont: InvoiceFont;
  swatch: { bg: string; ink: string; accent: string };
}

export const INVOICE_THEMES: Record<string, InvoiceTheme> = {
  classic: {
    id: 'classic',
    label: 'Classic',
    tagline: 'Minimal black & white — timeless',
    ink: '#111111',
    muted: '#666666',
    accent: '#111111',
    accentInk: '#ffffff',
    rule: '#d4d4d4',
    totalsBg: '#fafafa',
    headerStyle: 'minimal',
    titleFont: 'helvetica',
    bodyFont: 'helvetica',
    swatch: { bg: '#ffffff', ink: '#111111', accent: '#333333' },
  },
  'rose-gold': {
    id: 'rose-gold',
    label: 'Rose Gold',
    tagline: 'Warm elegance — serif + cream',
    ink: '#2b1f12',
    muted: '#8a7968',
    accent: '#b8875a',
    accentInk: '#ffffff',
    rule: '#d9bd98',
    totalsBg: '#faf3e8',
    headerStyle: 'minimal',
    titleFont: 'times',
    bodyFont: 'helvetica',
    swatch: { bg: '#faf3e8', ink: '#2b1f12', accent: '#b8875a' },
  },
  'sage-spa': {
    id: 'sage-spa',
    label: 'Sage Spa',
    tagline: 'Calm & natural — soft green',
    ink: '#1a2a1f',
    muted: '#6b7c71',
    accent: '#7a9079',
    accentInk: '#ffffff',
    rule: '#b8c8b4',
    totalsBg: '#f1f5ee',
    headerStyle: 'minimal',
    titleFont: 'times',
    bodyFont: 'helvetica',
    swatch: { bg: '#f1f5ee', ink: '#1a2a1f', accent: '#7a9079' },
  },
  'deep-navy': {
    id: 'deep-navy',
    label: 'Deep Navy',
    tagline: 'Professional — navy + gold bar',
    ink: '#0d1929',
    muted: '#6a7a8a',
    accent: '#1f3149',
    accentInk: '#ffffff',
    rule: '#cda46b',
    totalsBg: '#f3f5f8',
    headerStyle: 'bar-top',
    titleFont: 'helvetica',
    bodyFont: 'helvetica',
    swatch: { bg: '#1f3149', ink: '#ffffff', accent: '#cda46b' },
  },
  'luxe-black': {
    id: 'luxe-black',
    label: 'Luxe Black',
    tagline: 'Modern premium — black + gold',
    ink: '#1a1a1a',
    muted: '#808080',
    accent: '#000000',
    accentInk: '#ffffff',
    rule: '#b89c6a',
    totalsBg: '#f5f5f5',
    headerStyle: 'bar-top',
    titleFont: 'helvetica',
    bodyFont: 'helvetica',
    swatch: { bg: '#000000', ink: '#ffffff', accent: '#b89c6a' },
  },
};

export function getInvoiceTheme(id?: string | null): InvoiceTheme {
  return INVOICE_THEMES[id || 'classic'] ?? INVOICE_THEMES.classic;
}

export const INVOICE_THEME_LIST = Object.values(INVOICE_THEMES);
