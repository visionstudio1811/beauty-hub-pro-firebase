
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SignatureCanvas from 'react-signature-canvas';
import jsPDF from 'jspdf';
import { collection, doc, getDoc, getDocs, orderBy, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import i18n, { DEFAULT_LANGUAGE, isAppLanguage, localeFor, type AppLanguage } from '@/i18n';
import { useLanguage } from '@/i18n/LanguageProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import {
  applyPdfDirection,
  containsHebrew,
  PDF_FONT_FAMILY,
  pdfAlignFor,
  registerPdfFonts,
} from '@/lib/pdfFonts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle2, Loader2, AlertCircle, RotateCcw, Upload, X as XIcon, Image as ImageIcon } from 'lucide-react';

// ── Block types ──────────────────────────────────────────────
export type BlockType =
  | 'text'
  | 'heading'
  | 'subheading'
  | 'checkbox'
  | 'yes_no'
  | 'short_answer'
  | 'image_upload'
  | 'email'
  | 'phone'
  | 'signature'
  | 'date'
  | 'time'
  | 'city'
  | 'referral_source'
  | 'package_name'
  | 'package_price'
  | 'package_sessions'
  | 'purchase_date'
  | 'expiry_date';

export const PURCHASE_BLOCK_TYPES: BlockType[] = [
  'package_name',
  'package_price',
  'package_sessions',
  'purchase_date',
  'expiry_date',
];

export interface WaiverBlock {
  id: string;
  type: BlockType;
  value?: string;   // for text blocks
  label?: string;   // for question blocks
  required?: boolean;
  maxImages?: number; // for image_upload blocks
}

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per image
const DEFAULT_MAX_IMAGES = 5;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s\-().]{7,20}$/;

interface WaiverData {
  waiver_id: string;
  organization_id: string;
  template_title: string;
  template_headline: string;
  template_sub_headline: string;
  template_blocks: WaiverBlock[];
  client_name: string;
  client_email: string;
  client_phone: string;
  client_birthday: string;
  client_age: number | null;
  client_address: string;
  client_gender: string;
  client_city: string;
  client_referral_source: string;
  package_name: string;
  package_price: number | null;
  package_sessions: number | null;
  purchase_date: string;
  expiry_date: string;
  /** Language the form should be presented in (from the clientWaivers doc, then ?lang=, then 'en'). */
  language: AppLanguage;
}

const OTHER_VALUE = '__other__';

/**
 * Resolve the signing language: the optional `language` field on the loaded
 * clientWaivers doc wins, then the ?lang= query param, then English.
 */
function resolveWaiverLanguage(docLang: unknown, queryLang: string | null): AppLanguage {
  if (isAppLanguage(docLang)) return docLang;
  if (isAppLanguage(queryLang)) return queryLang;
  return DEFAULT_LANGUAGE;
}

function formatPrice(n: number, lang: AppLanguage): string {
  return n.toLocaleString(localeFor(lang), { style: 'currency', currency: 'USD' });
}

function purchaseBlockValue(block: WaiverBlock, waiver: WaiverData): string {
  switch (block.type) {
    case 'package_name':     return waiver.package_name || '—';
    case 'package_price':    return waiver.package_price != null ? formatPrice(waiver.package_price, waiver.language) : '—';
    case 'package_sessions': return waiver.package_sessions != null ? String(waiver.package_sessions) : '—';
    case 'purchase_date':    return waiver.purchase_date || '—';
    case 'expiry_date':      return waiver.expiry_date || '—';
    default: return '';
  }
}

function purchaseBlockLabel(type: BlockType, lang?: AppLanguage): string {
  return i18n.t(`waiverForm:purchaseLabels.${type}`, lang ? { lng: lang } : undefined);
}

function buildPrefillAnswers(blocks: WaiverBlock[], waiver: WaiverData): Record<string, string | boolean | string[]> {
  const firstName = waiver.client_name.split(' ')[0] ?? '';
  const lastName = waiver.client_name.split(' ').slice(1).join(' ') ?? '';
  const prefill: Record<string, string | boolean | string[]> = {};

  const todayIso = new Date().toISOString().slice(0, 10);
  for (const block of blocks) {
    if (PURCHASE_BLOCK_TYPES.includes(block.type)) {
      prefill[block.id] = purchaseBlockValue(block, waiver);
      continue;
    }

    const lbl = (block.label ?? '').toLowerCase();

    // Label matchers — defined once per block so the if/else chain stays readable.
    // Each one accepts the English wording AND the Hebrew wording used by the
    // Hebrew master templates ('שם פרטי', 'שם משפחה', 'כתובת', 'עיר',
    // 'תאריך לידה', 'מגדר' / 'מין', 'גיל', 'איך שמעת עלינו?', 'אימייל' /
    // 'דוא"ל', 'טלפון'). Short Hebrew words are anchored as whole words so
    // e.g. 'גילוי' (disclosure) is not treated as an age field.
    const isBirthdayLabel =
      lbl.includes('birthday') ||
      lbl.includes('date of birth') ||
      lbl.includes('dob') ||
      lbl.includes('birth date') ||
      lbl.includes('born') ||
      lbl.includes('תאריך לידה') ||
      lbl.includes('יום הולדת') ||
      lbl.includes('תאריך הלידה');
    // 'מין' only on its own (it also means "type/kind", e.g. 'מין הטיפול'),
    // matching backfillClient.ts + addStandardFieldsToTemplates.ts.
    const isGenderLabel =
      lbl.includes('gender') || /\bsex\b/.test(lbl) ||
      lbl.includes('מגדר') || /^מין[:?*.]?$/.test(lbl);
    const isCityLabel =
      lbl === 'city' ||
      lbl.startsWith('city ') ||
      lbl.includes('what city') ||
      lbl.includes('your city') ||
      /(^|\s)ה?עיר(?=$|\s|[:?*.])/.test(lbl) ||
      lbl.includes('עיר מגורים');
    const isReferralLabel =
      lbl.includes('referral') ||
      lbl.includes('hear about') ||
      lbl.includes('how did you find') ||
      lbl.includes('find us') ||
      lbl.includes('refer you') ||
      lbl.includes('איך שמעת') ||
      lbl.includes('שמעת עלינו') ||
      lbl.includes('הגעת אלינו') ||
      lbl.includes('מקור ההפניה') ||
      lbl.includes('מקור הפניה');
    const isEmailLabel =
      lbl.includes('email') ||
      lbl.includes('אימייל') ||
      lbl.includes('דוא"ל') ||
      lbl.includes('דוא״ל') ||
      lbl.includes('דואר אלקטרוני') ||
      /(^|\s)ה?מייל(?=$|\s|[:?*.])/.test(lbl);
    const isPhoneLabel =
      lbl.includes('phone') || lbl.includes('mobile') || lbl.includes('cell') ||
      lbl.includes('טלפון') || lbl.includes('נייד') || lbl.includes('פלאפון');
    const isFirstNameLabel =
      lbl.includes('first name') || lbl.includes('שם פרטי');
    const isLastNameLabel =
      lbl.includes('last name') || lbl.includes('surname') || lbl.includes('family name') ||
      lbl.includes('שם משפחה');
    const isFullNameLabel =
      lbl.includes('full name') || lbl === 'name' || lbl === 'your name' ||
      lbl.includes('שם מלא') || /^ה?שם(ך|כם|כן)?[:?*.]?$/.test(lbl);
    const isAgeLabel =
      lbl.includes('age') ||
      /(^|\s)ה?גיל(ך|כם|כן)?(?=$|\s|[:?*.])/.test(lbl);
    const isAddressLabel =
      lbl.includes('address') || lbl.includes('street') ||
      lbl.includes('כתובת') || lbl.includes('רחוב');

    // Dedicated block types — these match even without a label, and the
    // type-match is the canonical signal. Label matches below act as fallbacks
    // for templates built with generic short_answer / date blocks.
    if (block.type === 'city' || isCityLabel) {
      if (waiver.client_city) prefill[block.id] = waiver.client_city;
      continue;
    }
    if (block.type === 'referral_source' || isReferralLabel) {
      if (waiver.client_referral_source) prefill[block.id] = waiver.client_referral_source;
      continue;
    }

    // Skip blocks that need a label to match (email/phone work without one
    // because the block type alone is enough).
    if (!block.label && block.type !== 'email' && block.type !== 'phone') continue;

    if (block.type === 'email' || isEmailLabel) {
      if (waiver.client_email) prefill[block.id] = waiver.client_email;
    } else if (block.type === 'phone' || isPhoneLabel) {
      if (waiver.client_phone) prefill[block.id] = waiver.client_phone;
    } else if (isFirstNameLabel) {
      if (firstName) prefill[block.id] = firstName;
    } else if (isLastNameLabel) {
      if (lastName) prefill[block.id] = lastName;
    } else if (isFullNameLabel) {
      if (waiver.client_name) prefill[block.id] = waiver.client_name;
    } else if (isBirthdayLabel) {
      if (waiver.client_birthday) prefill[block.id] = waiver.client_birthday;
    } else if (isGenderLabel) {
      if (waiver.client_gender) prefill[block.id] = waiver.client_gender;
    } else if (isAgeLabel) {
      if (waiver.client_age != null) prefill[block.id] = String(waiver.client_age);
    } else if (isAddressLabel) {
      if (waiver.client_address) prefill[block.id] = waiver.client_address;
    } else if (
      lbl.includes('name of program') ||
      lbl.includes('program name') ||
      lbl.includes('package name') ||
      lbl === 'program' ||
      lbl === 'package' ||
      lbl.includes('שם התוכנית') ||
      lbl.includes('שם התכנית') ||
      lbl.includes('שם החבילה') ||
      lbl === 'תוכנית' ||
      lbl === 'חבילה'
    ) {
      if (waiver.package_name) prefill[block.id] = waiver.package_name;
    } else if (
      lbl.includes('price') || lbl.includes('cost') || lbl.includes('amount') ||
      lbl.includes('מחיר') || lbl.includes('עלות') || lbl.includes('סכום')
    ) {
      if (waiver.package_price != null) prefill[block.id] = formatPrice(waiver.package_price, waiver.language);
    } else if (
      lbl.includes('expiry') || lbl.includes('expires') || lbl.includes('valid until') ||
      lbl.includes('תוקף') || lbl.includes('בתוקף עד') || lbl.includes('תאריך סיום')
    ) {
      if (waiver.expiry_date) prefill[block.id] = waiver.expiry_date;
    } else if (block.type === 'date' && !isBirthdayLabel) {
      // Generic date blocks on agreements default to the purchase date,
      // falling back to today's date so the form is never blank.
      prefill[block.id] = waiver.purchase_date || todayIso;
    }
  }
  return prefill;
}

// ── Helpers ───────────────────────────────────────────────────
// uploadWaiverFile now returns errors in the requested `lang`, but older
// deployments (or a missing lang) still send English. Map those to translated
// copy so the Hebrew UI never shows raw English; anything unknown falls through.
const SERVER_ERROR_KEYS: Record<string, string> = {
  'Invalid token': 'invalidToken',
  'Form already submitted': 'alreadySubmitted',
  'Link expired': 'linkExpired',
  'Upload limit reached for this form': 'uploadLimit',
  'PDF too large': 'pdfTooLarge',
  'Image too large': 'imageTooLarge',
  'Unsupported image type': 'unsupportedImage',
};

function translateServerMessage(message: string): string {
  const key = SERVER_ERROR_KEYS[message.trim()];
  return key ? i18n.t(`waiverForm:errors.server.${key}`) : message;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return translateServerMessage(err.message);
  if (typeof err === 'string') return translateServerMessage(err);
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown };
    if (typeof e.message === 'string' && e.message) return translateServerMessage(e.message);
    if (typeof e.code === 'string' && e.code) return e.code;
  }
  return i18n.t('waiverForm:errors.submissionFailed');
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error(reader.error?.message || i18n.t('waiverForm:errors.readFile')));
    reader.readAsDataURL(blob);
  });
}

async function uploadPdf(blob: Blob, token: string): Promise<string> {
  const fileBase64 = await blobToBase64(blob);
  const upload = httpsCallable<
    { token: string; fileBase64: string; contentType: string; kind: 'pdf'; lang: string },
    { url: string }
  >(functions, 'uploadWaiverFile');
  const res = await upload({ token, fileBase64, contentType: 'application/pdf', kind: 'pdf', lang: i18n.language });
  return res.data.url;
}

async function uploadWaiverImage(image: StagedImage, token: string, blockId: string, index: number): Promise<string> {
  const fileBase64 = await blobToBase64(image.blob);
  const safeName = image.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const upload = httpsCallable<
    { token: string; fileBase64: string; contentType: string; kind: 'photo'; filename: string; lang: string },
    { url: string }
  >(functions, 'uploadWaiverFile');
  const res = await upload({
    token,
    fileBase64,
    contentType: image.type,
    kind: 'photo',
    filename: `${blockId}-${index}-${safeName}`,
    lang: i18n.language,
  });
  return res.data.url;
}

// Android Chrome revokes the OS-level URI permission for picked files after
// a short delay. Reading them at submit time (after the user has signed,
// scrolled, etc.) throws "NotReadableError". Copy the bytes into a JS-owned
// Blob right when the user picks the file so the upload at submit time uses
// an in-memory reference that no OS permission gate can revoke.
type StagedImage = {
  name: string;
  type: string;
  size: number;
  blob: Blob;
};

async function detachFile(file: File): Promise<StagedImage> {
  const buf = await file.arrayBuffer();
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    blob: new Blob([buf], { type: file.type }),
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(reader.error?.message || i18n.t('waiverForm:errors.readImage')));
    reader.readAsDataURL(blob);
  });
}

async function loadImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = dataUrl;
  });
}

// Downscale a dataURL to fit within maxDim (longest side) and re-encode as JPEG.
// Uploaded originals are stored separately at full resolution; the PDF only
// needs a readable preview, so we trade size for fidelity here. Without this,
// a few phone photos easily push the generated PDF past the 10MB upload cap.
async function compressImageDataUrl(dataUrl: string, maxDim = 1000, quality = 0.6): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      if (!w || !h) { resolve(dataUrl); return; }
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, tw, th);
      ctx.drawImage(img, 0, 0, tw, th);
      try {
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function buildPdf(
  title: string,
  signerName: string,
  signerEmail: string,
  signerPhone: string,
  blocks: WaiverBlock[],
  answers: Record<string, string | boolean | string[]>,
  sigDataUrl: string,
  imageDataUrls: Record<string, string[]>,
  language: AppLanguage,
): Promise<Blob> {
  const tp = (key: string, opts?: Record<string, unknown>) =>
    i18n.t(`waiverForm:${key}`, { ...(opts ?? {}), lng: language }) as string;

  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  // Helvetica has no Hebrew glyphs — register Rubik (Latin + Hebrew) before any text draw.
  await registerPdfFonts(doc);
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pageW - margin * 2;
  const align = pdfAlignFor(language);
  // x origin for body text / images: right margin in Hebrew, left margin otherwise
  const originX = align === 'right' ? pageW - margin : margin;
  let y = margin;

  const ensureSpace = (h: number) => {
    if (y + h > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Hebrew runs vs. Latin/number runs, split according to the paragraph
  // direction (a simplified bidi resolution):
  //  - RTL (Hebrew form): neutral punctuation/whitespace next to a Hebrew
  //    letter — leading or trailing — belongs to the Hebrew run, so "שם: "
  //    keeps its colon and "  (לא נחתם)" keeps both parentheses in the RTL
  //    run. Latin runs stop before neutrals that lead into Hebrew; neutrals
  //    at the very end of the line form their own run and take the paragraph
  //    (RTL) direction.
  //  - LTR (English form): a Hebrew run only absorbs neutrals *between* two
  //    Hebrew letters; neutrals bordering Latin text or the line ends stay
  //    LTR, so "Answer: (שלום)" keeps its parentheses in place.
  const NEUTRAL = `\\s.,:;!?'"()\\[\\]{}\\-–—/`;
  const HEB = '֐-׿';
  const RUN_RE_RTL = new RegExp(
    `[${NEUTRAL}]*[${HEB}][${HEB}${NEUTRAL}]*|[^${HEB}]+?(?=[${NEUTRAL}]*(?:[${HEB}]|$))|[^${HEB}]+`,
    'g',
  );
  const RUN_RE_LTR = new RegExp(`[${HEB}](?:[${NEUTRAL}]*[${HEB}])*|[^${HEB}]+`, 'g');
  const RUN_RE = align === 'right' ? RUN_RE_RTL : RUN_RE_LTR;
  const STRONG_RE = /[A-Za-z0-9À-ɏ֐-׿]/;

  // jsPDF's R2L mode reverses glyph order but does not mirror brackets, so a
  // "(" inside a reversed run ends up facing the wrong way. Swap paired
  // brackets before the reversal so they render mirrored, as a bidi-aware
  // renderer would.
  const MIRROR: Record<string, string> = {
    '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<',
  };
  const mirrorBrackets = (s: string) => s.replace(/[()[\]{}<>]/g, (c) => MIRROR[c] ?? c);

  // Draw one already-wrapped line. Pure Latin lines are drawn as-is with the
  // language's alignment. Lines containing Hebrew are split into directional
  // runs laid out in the paragraph direction (right-to-left for Hebrew forms,
  // left-to-right for English ones), so embedded emails, phone numbers, dates,
  // prices and Hebrew names keep their natural order instead of being mirrored
  // by R2L mode.
  const drawLine = (line: string) => {
    if (!containsHebrew(line)) {
      applyPdfDirection(doc, line);
      doc.text(line, originX, y, { align });
      return;
    }
    const rtl = align === 'right';
    const runs = line.match(RUN_RE) ?? [line];
    const widths = runs.map((run) => doc.getTextWidth(run));
    let x = rtl ? pageW - margin : margin;
    runs.forEach((run, i) => {
      // Hebrew runs are always RTL; in an RTL paragraph, runs made purely of
      // neutrals (e.g. a trailing ")") take the paragraph direction too.
      const runRtl = containsHebrew(run) || (rtl && !STRONG_RE.test(run));
      if (rtl) x -= widths[i];
      doc.setR2L(runRtl);
      doc.text(runRtl ? mirrorBrackets(run) : run, x, y);
      if (!rtl) x += widths[i];
    });
    doc.setR2L(false);
  };

  const addText = (text: string, size: number, bold = false, color = '#111111') => {
    doc.setFontSize(size);
    doc.setFont(PDF_FONT_FAMILY, bold ? 'bold' : 'normal');
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(text, contentW);
    lines.forEach((line: string) => {
      ensureSpace(size * 1.4);
      drawLine(line);
      y += size * 1.4;
    });
    y += 4;
  };

  // Images (signature / uploads) sit against the same margin as the text.
  const imageX = (w: number) => (align === 'right' ? pageW - margin - w : margin);

  // Title
  addText(title, 20, true);
  addText(tp('pdf.signedBy', { name: signerName }), 11, false, '#555555');
  if (signerEmail) addText(tp('pdf.email', { email: signerEmail }), 11, false, '#555555');
  if (signerPhone) addText(tp('pdf.phone', { phone: signerPhone }), 11, false, '#555555');
  addText(tp('pdf.date', { date: new Date().toLocaleString(localeFor(language)) }), 11, false, '#555555');
  y += 12;

  // Blocks
  for (const block of blocks) {
    if (block.type === 'text' && block.value) {
      addText(block.value, 10, false, '#333333');
      y += 4;
    } else if (block.type === 'heading' && block.value) {
      y += 6;
      addText(block.value, 16, true, '#111111');
      y += 4;
    } else if (block.type === 'subheading' && block.value) {
      y += 4;
      addText(block.value, 12, true, '#333333');
      y += 2;
    } else if (block.type === 'signature') {
      addText(block.label || tp('defaults.signature'), 11, true);
      const dataUrl = typeof answers[block.id] === 'string' ? (answers[block.id] as string) : '';
      if (dataUrl) {
        addText(tp('pdf.esignConsent'), 9, false, '#666666');
        const sigH = 80;
        const sigW = 240;
        ensureSpace(sigH);
        doc.addImage(dataUrl, 'PNG', imageX(sigW), y, sigW, sigH);
        y += sigH + 6;
      } else {
        addText(`  ${tp('pdf.notSigned')}`, 10, false, '#888888');
      }
      y += 4;
    } else if (block.type === 'image_upload') {
      if (block.label) addText(block.label, 11, true);
      const dataUrls = imageDataUrls[block.id] ?? [];
      if (dataUrls.length === 0) {
        addText(`  ${tp('pdf.noImages')}`, 10, false, '#888888');
      } else {
        const maxW = contentW;
        const maxH = 220;
        for (const dataUrl of dataUrls) {
          const { w, h } = await loadImageSize(dataUrl);
          const ratio = Math.min(maxW / w, maxH / h, 1);
          const drawW = w * ratio;
          const drawH = h * ratio;
          ensureSpace(drawH + 8);
          doc.addImage(dataUrl, 'JPEG', imageX(drawW), y, drawW, drawH, undefined, 'FAST');
          y += drawH + 8;
        }
      }
      y += 4;
    } else if (block.type === 'city' || block.type === 'referral_source') {
      const defaultLabel = block.type === 'city' ? tp('defaults.city') : tp('defaults.referralSource');
      const lbl = block.label?.trim() || defaultLabel;
      const value = typeof answers[block.id] === 'string' && (answers[block.id] as string).trim()
        ? (answers[block.id] as string)
        : '—';
      addText(`${lbl}: ${value}`, 11, false, '#1f2937');
      y += 4;
    } else if (
      block.type === 'package_name' ||
      block.type === 'package_price' ||
      block.type === 'package_sessions' ||
      block.type === 'purchase_date' ||
      block.type === 'expiry_date'
    ) {
      const lbl = block.label?.trim() || purchaseBlockLabel(block.type, language);
      const value = typeof answers[block.id] === 'string' ? (answers[block.id] as string) : '—';
      addText(`${lbl}: ${value}`, 11, false, '#1f2937');
      y += 4;
    } else if (block.label) {
      addText(block.label, 11, true);
      const answer = answers[block.id];
      // yes_no answers are stored as the literal strings 'Yes' / 'No' — map them for display only.
      const answerText =
        typeof answer === 'boolean'
          ? answer ? tp('pdf.yesAgreed') : tp('pdf.no')
          : Array.isArray(answer)
          ? answer.length === 0 ? '—' : tp('pdf.files', { count: answer.length })
          : answer === 'Yes'
          ? tp('pdf.yes')
          : answer === 'No'
          ? tp('pdf.no')
          : String(answer ?? '—');
      addText(`  ${tp('pdf.answer', { answer: answerText })}`, 10, false, '#444444');
      y += 6;
    }
  }

  // Signature
  y += 16;
  addText(tp('pdf.signatureHeading'), 11, true);
  const imgH = 80;
  const imgW = 240;
  ensureSpace(imgH);
  doc.addImage(sigDataUrl, 'PNG', imageX(imgW), y, imgW, imgH);

  return doc.output('blob');
}

// ── Component ─────────────────────────────────────────────────
export default function WaiverForm() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const queryLang = searchParams.get('lang');
  const { t } = useTranslation('waiverForm');
  const { language, setLanguage } = useLanguage();
  const sigRef = useRef<SignatureCanvas>(null);
  const sigDataUrlRef = useRef<string | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [waiver, setWaiver] = useState<WaiverData | null>(null);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [done, setDone] = useState(false);

  // OTP state
  const [needsOtp, setNeedsOtp]       = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpValue, setOtpValue]       = useState('');
  const [otpError, setOtpError]       = useState('');
  const [otpLoading, setOtpLoading]   = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerPhone, setSignerPhone] = useState('');
  const [mainConsent, setMainConsent] = useState(false);
  const [showMainDisclosure, setShowMainDisclosure] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | boolean | string[]>>({});
  const [imageFiles, setImageFiles] = useState<Record<string, StagedImage[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [capturedSig, setCapturedSig] = useState<string | null>(null);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [referralOptions, setReferralOptions] = useState<string[]>([]);

  // Language: before the waiver loads (OTP / error screens) honour ?lang=;
  // once it loads, the clientWaivers doc's `language` wins — unless the signer
  // has already switched language themselves via the LanguageSwitcher, in
  // which case their choice sticks. Not persisted — this is a public page, the
  // signer is not a staff user.
  const waiverLanguage = waiver?.language ?? null;
  // Last language this effect applied. When the live `language` differs from
  // it, the signer switched manually and we must not override them.
  const appliedLanguageRef = useRef<AppLanguage | null>(null);
  useEffect(() => {
    if (appliedLanguageRef.current !== null && language !== appliedLanguageRef.current) return;
    const resolved = waiverLanguage ?? resolveWaiverLanguage(undefined, queryLang);
    appliedLanguageRef.current = resolved;
    if (resolved !== language) void setLanguage(resolved, { persist: false });
  }, [waiverLanguage, queryLang, language, setLanguage]);

  // Prefilled package prices are formatted with the language the waiver was
  // loaded in. Keep them in step with the live language (the rest of the UI
  // and the PDF follow `language`) by re-formatting untouched price answers
  // whenever the signer switches; anything the signer edited is left alone.
  const priceStateRef = useRef<{ waiver: WaiverData; lang: AppLanguage } | null>(null);
  useEffect(() => {
    if (!waiver) return;
    // A freshly loaded waiver has its answers formatted in waiver.language.
    const from = priceStateRef.current?.waiver === waiver ? priceStateRef.current.lang : waiver.language;
    priceStateRef.current = { waiver, lang: language };
    if (from === language || waiver.package_price == null) return;
    const before = formatPrice(waiver.package_price, from);
    const after = formatPrice(waiver.package_price, language);
    if (before === after) return;
    setAnswers((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [id, value] of Object.entries(prev)) {
        if (value === before) { next[id] = after; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [waiver, language]);

  // Pulls active city + referral-source options from the org's dropdownData
  // so the public form can render the same dropdowns staff see on the client card.
  // Fails open: if the read is denied or empty, the blocks fall back to free-text.
  const fetchDropdownOptions = async (orgId: string) => {
    try {
      const q = query(
        collection(db, 'organizations', orgId, 'dropdownData'),
        where('is_active', '==', true),
        orderBy('sort_order'),
      );
      const snap = await getDocs(q);
      const all = snap.docs.map((d) => d.data() as { category?: string; value?: string });
      setCityOptions(all.filter((d) => d.category === 'cities' && d.value).map((d) => d.value as string));
      setReferralOptions(all.filter((d) => d.category === 'referral_sources' && d.value).map((d) => d.value as string));
    } catch {
      setCityOptions([]);
      setReferralOptions([]);
    }
  };

  const loadWaiver = async () => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    try {
      // Token IS the document ID in waiverTokens
      const tokenSnap = await getDoc(doc(db, 'waiverTokens', token));
      if (!tokenSnap.exists()) { setNotFound(true); setLoading(false); return; }

        const tokenData = tokenSnap.data();
        const waiverId: string = tokenData.waiverId;         // sendWaiver uses camelCase
        const orgId: string = tokenData.organizationId;

        // Check if already signed
        if (tokenData.status === 'signed') { setAlreadySigned(true); setLoading(false); return; }

        // OTP check
        if (tokenData.requiresOtp === true) {
          if (tokenData.otpVerified === true) {
            setOtpVerified(true);
          } else {
            setNeedsOtp(true);
            setLoading(false);
            return; // don't load form until OTP verified
          }
        }

        // Reject expired tokens on the client for a friendly message — the
        // Firestore rule also enforces this server-side on submit.
        const expiresAt = tokenData.expiresAt;
        if (expiresAt && typeof expiresAt.toMillis === 'function' && expiresAt.toMillis() <= Date.now()) {
          setExpired(true); setLoading(false); return;
        }

        // Fetch the waiver doc
        const waiverSnap = await getDoc(doc(db, 'organizations', orgId, 'clientWaivers', waiverId));
        if (!waiverSnap.exists()) { setNotFound(true); setLoading(false); return; }

        const wd = waiverSnap.data();

        // Fetch the template to get blocks & title
        const tplSnap = await getDoc(doc(db, 'organizations', orgId, 'waiverTemplates', wd.templateId));
        const tpl = tplSnap.exists() ? tplSnap.data() : null;
        const lang = resolveWaiverLanguage(wd.language, queryLang);

        const waiverData: WaiverData = {
          waiver_id: waiverId,
          organization_id: orgId,
          template_title: tpl?.title ?? i18n.t('waiverForm:defaults.waiver', { lng: lang }),
          template_headline: tpl?.headline ?? '',
          template_sub_headline: tpl?.sub_headline ?? '',
          template_blocks: tpl?.content ?? [],
          client_name: wd.clientName ?? '',
          client_email: wd.clientEmail ?? '',
          client_phone: wd.clientPhone ?? '',
          client_birthday: wd.clientBirthday ?? '',
          client_age: wd.clientAge ?? null,
          client_address: wd.clientAddress ?? '',
          client_gender: wd.clientGender ?? '',
          client_city: wd.clientCity ?? '',
          client_referral_source: wd.clientReferralSource ?? '',
          package_name: wd.packageName ?? '',
          package_price: wd.packagePrice ?? null,
          package_sessions: wd.packageSessions ?? null,
          purchase_date: wd.purchaseDate ?? '',
          expiry_date: wd.expiryDate ?? '',
          language: lang,
        };
        setWaiver(waiverData);
        setSignerName(wd.clientName ?? '');
        setSignerEmail(wd.clientEmail ?? '');
        setSignerPhone(wd.clientPhone ?? '');
        setAnswers(buildPrefillAnswers(tpl?.content ?? [], waiverData));
        fetchDropdownOptions(orgId);
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes('not found') || msg.includes('NOT_FOUND')) {
          setNotFound(true);
        } else {
          setLoadError(msg);
        }
      } finally {
        setLoading(false);
      }
  };

  // Load waiver data from Firestore via waiverTokens collection
  useEffect(() => {
    loadWaiver();
  }, [token]);

  const handleVerifyOtp = async () => {
    if (!token || otpValue.length !== 6) {
      setOtpError(t('otp.invalidLength'));
      return;
    }
    setOtpLoading(true);
    setOtpError('');
    try {
      const verifyFn = httpsCallable(functions, 'verifyFormOtp');
      await verifyFn({ token, otp: otpValue, lang: language });
      setOtpVerified(true);
      setNeedsOtp(false);
      // Now load the full form
      setLoading(true);
      const tokenSnap = await getDoc(doc(db, 'waiverTokens', token));
      if (!tokenSnap.exists()) { setNotFound(true); setLoading(false); return; }
      const tokenData = tokenSnap.data();
      const waiverId: string = tokenData.waiverId;
      const orgId: string = tokenData.organizationId;
      const waiverSnap = await getDoc(doc(db, 'organizations', orgId, 'clientWaivers', waiverId));
      if (!waiverSnap.exists()) { setNotFound(true); setLoading(false); return; }
      const wd = waiverSnap.data();
      const tplSnap = await getDoc(doc(db, 'organizations', orgId, 'waiverTemplates', wd.templateId));
      const tpl = tplSnap.exists() ? tplSnap.data() : null;
      const lang = resolveWaiverLanguage(wd.language, queryLang);
      const waiverDataOtp: WaiverData = {
        waiver_id: waiverId,
        organization_id: orgId,
        template_title: tpl?.title ?? i18n.t('waiverForm:defaults.form', { lng: lang }),
        template_headline: tpl?.headline ?? '',
        template_sub_headline: tpl?.sub_headline ?? '',
        template_blocks: tpl?.content ?? [],
        client_name: wd.clientName ?? '',
        client_email: wd.clientEmail ?? '',
        client_phone: wd.clientPhone ?? '',
        client_birthday: wd.clientBirthday ?? '',
        client_age: wd.clientAge ?? null,
        client_address: wd.clientAddress ?? '',
        client_gender: wd.clientGender ?? '',
        client_city: wd.clientCity ?? '',
        client_referral_source: wd.clientReferralSource ?? '',
        package_name: wd.packageName ?? '',
        package_price: wd.packagePrice ?? null,
        package_sessions: wd.packageSessions ?? null,
        purchase_date: wd.purchaseDate ?? '',
        expiry_date: wd.expiryDate ?? '',
        language: lang,
      };
      setWaiver(waiverDataOtp);
      setSignerName(wd.clientName ?? '');
      setSignerEmail(wd.clientEmail ?? '');
      setSignerPhone(wd.clientPhone ?? '');
      setAnswers(buildPrefillAnswers(tpl?.content ?? [], waiverDataOtp));
      fetchDropdownOptions(orgId);
      setLoading(false);
    } catch (err: unknown) {
      setOtpError(err instanceof Error ? err.message : t('otp.invalidCode'));
    } finally {
      setOtpLoading(false);
    }
  };

  const setAnswer = (blockId: string, value: string | boolean | string[]) => {
    setAnswers((prev) => ({ ...prev, [blockId]: value }));
    setErrors((prev) => { const next = { ...prev }; delete next[blockId]; return next; });
  };

  const setBlockImages = (blockId: string, files: StagedImage[]) => {
    setImageFiles((prev) => ({ ...prev, [blockId]: files }));
    setErrors((prev) => { const next = { ...prev }; delete next[blockId]; return next; });
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!signerName.trim()) newErrors['__name'] = t('validation.name');
    if (!signerEmail.trim()) newErrors['__email'] = t('validation.email');
    else if (!EMAIL_RE.test(signerEmail.trim())) newErrors['__email'] = t('validation.emailInvalid');
    if (!signerPhone.trim()) newErrors['__phone'] = t('validation.phone');
    else if (!PHONE_RE.test(signerPhone.trim())) newErrors['__phone'] = t('validation.phoneInvalid');
    if (!waiver) return newErrors;
    waiver.template_blocks.forEach((block) => {
      if (block.type === 'text' || block.type === 'heading' || block.type === 'subheading') return;
      if (PURCHASE_BLOCK_TYPES.includes(block.type)) return; // read-only, prefilled from purchase
      if (block.type === 'image_upload') {
        if (!block.required) return;
        const files = imageFiles[block.id] ?? [];
        if (files.length === 0) newErrors[block.id] = t('validation.image');
        return;
      }
      if (block.type === 'signature') {
        // Signatures are always required
        const ans = answers[block.id];
        if (typeof ans !== 'string' || !ans) {
          newErrors[block.id] = t('validation.signature');
        }
        return;
      }
      if (!block.required) return;
      const ans = answers[block.id];
      if (ans === undefined || ans === '' || ans === null) {
        newErrors[block.id] = t('validation.required');
        return;
      }
      if (block.type === 'email' && typeof ans === 'string' && !EMAIL_RE.test(ans.trim())) {
        newErrors[block.id] = t('validation.emailInvalid');
      }
      if (block.type === 'phone' && typeof ans === 'string' && !PHONE_RE.test(ans.trim())) {
        newErrors[block.id] = t('validation.phoneInvalid');
      }
    });
    if (!mainConsent) {
      newErrors['__sig'] = t('validation.consent');
    } else if (!capturedSig && (!sigRef.current || sigRef.current.isEmpty())) {
      newErrors['__sig'] = t('validation.signature');
    }
    return newErrors;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    if (!waiver || !token) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      // Process image_upload blocks first: read dataURLs (for PDF) and upload (for answers)
      const imageDataUrls: Record<string, string[]> = {};
      const finalAnswers: Record<string, string | boolean | string[]> = { ...answers };

      for (const block of waiver.template_blocks) {
        if (block.type !== 'image_upload') continue;
        const files = imageFiles[block.id] ?? [];
        if (files.length === 0) continue;
        const rawDataUrls = await Promise.all(files.map((f) => blobToDataUrl(f.blob)));
        imageDataUrls[block.id] = await Promise.all(rawDataUrls.map((d) => compressImageDataUrl(d)));
        finalAnswers[block.id] = await Promise.all(
          files.map((f, i) => uploadWaiverImage(f, token!, block.id, i))
        );
      }

      const sigDataUrl = capturedSig ?? sigRef.current!.getTrimmedCanvas().toDataURL('image/png');
      const pdfTitle = waiver.template_headline || waiver.template_title;
      const pdfBlob = await buildPdf(pdfTitle, signerName, signerEmail, signerPhone, waiver.template_blocks, finalAnswers, sigDataUrl, imageDataUrls, language);
      const pdfUrl  = await uploadPdf(pdfBlob, token!);

      // Re-read token doc by ID to get orgId and waiverId
      const tokenSnap = await getDoc(doc(db, 'waiverTokens', token!));
      if (!tokenSnap.exists()) throw new Error(t('errors.tokenNotFound'));
      const { organizationId: orgId, waiverId } = tokenSnap.data();

      // Commit the waiver sign + token-flip atomically so a partial failure
      // can't leave the waiver `signed` but the token `pending` (which would
      // allow another visitor to re-sign and double-fire the org-notify
      // trigger). writeBatch commits both writes in one network round trip;
      // each is evaluated against its own rule independently.
      const batch = writeBatch(db);
      batch.update(doc(db, 'organizations', orgId, 'clientWaivers', waiverId), {
        status: 'signed',
        signer_name: signerName,
        signer_email: signerEmail,
        signer_phone: signerPhone,
        answers: finalAnswers,
        pdf_url: pdfUrl,
        signed_at: new Date().toISOString(),
      });
      batch.update(doc(db, 'waiverTokens', token!), { status: 'signed' });
      await batch.commit();

      setDone(true);
    } catch (err: unknown) {
      setSubmitError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ── States ────────────────────────────────────────────────
  if (loading) return (
    <Screen><Loader2 className="h-8 w-8 animate-spin text-primary" /></Screen>
  );
  if (loadError) return (
    <Screen>
      <AlertCircle className="h-10 w-10 text-amber-500 mb-3" />
      <h2 className="text-lg font-semibold">{t('states.connectionError.title')}</h2>
      <p className="text-sm text-gray-700 mt-1 text-center max-w-xs">{t('states.connectionError.description')}</p>
      <p className="text-xs text-gray-600 mt-2 text-center max-w-xs">{loadError}</p>
      <button
        onClick={() => loadWaiver()}
        className="mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
      >
        {t('states.connectionError.retry')}
      </button>
    </Screen>
  );
  if (notFound) return (
    <Screen>
      <AlertCircle className="h-10 w-10 text-destructive mb-3" />
      <h2 className="text-lg font-semibold">{t('states.notFound.title')}</h2>
      <p className="text-sm text-gray-700 mt-1">{t('states.notFound.description')}</p>
    </Screen>
  );
  if (alreadySigned) return (
    <Screen>
      <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
      <h2 className="text-lg font-semibold">{t('states.alreadySigned.title')}</h2>
      <p className="text-sm text-gray-700 mt-1">{t('states.alreadySigned.description')}</p>
    </Screen>
  );
  if (expired) return (
    <Screen>
      <AlertCircle className="h-10 w-10 text-destructive mb-3" />
      <h2 className="text-lg font-semibold">{t('states.expired.title')}</h2>
      <p className="text-sm text-gray-700 mt-1">{t('states.expired.description')}</p>
    </Screen>
  );
  if (needsOtp && !otpVerified) return (
    <div className="min-h-screen bg-white flex items-center justify-center py-8 px-4">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-md border border-border overflow-hidden">
        <div className="bg-primary px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-white text-xl font-bold">{t('otp.title')}</h1>
            <LanguageSwitcher variant="full" persist={false} className="shrink-0 text-white hover:bg-white/15 hover:text-white" />
          </div>
          <p className="text-primary-foreground/80 text-sm mt-1">{t('otp.subtitle')}</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="otp-input" className="font-medium">{t('otp.label')}</Label>
            <Input
              id="otp-input"
              type="tel"
              inputMode="numeric"
              maxLength={6}
              value={otpValue}
              onChange={(e) => { setOtpValue(e.target.value.replace(/\D/g, '')); setOtpError(''); }}
              placeholder={t('otp.placeholder')}
              className={`text-center text-2xl tracking-[0.5em] font-bold ${otpError ? 'border-destructive' : ''}`}
              onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyOtp(); }}
            />
            {otpError && <p className="text-xs text-destructive">{otpError}</p>}
          </div>
          <Button className="w-full" onClick={handleVerifyOtp} disabled={otpLoading || otpValue.length !== 6}>
            {otpLoading ? <><Loader2 className="h-4 w-4 me-2 animate-spin" />{t('otp.verifying')}</> : t('otp.verify')}
          </Button>
          <p className="text-xs text-gray-700 text-center">
            {t('otp.noCode')}
          </p>
        </div>
      </div>
    </div>
  );

  if (done) return (
    <Screen>
      <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
      <h2 className="text-xl font-semibold">{t('states.done.title', { name: signerName.split(' ')[0] })}</h2>
      <p className="text-sm text-gray-700 mt-2">{t('states.done.description')}</p>
    </Screen>
  );

  if (!waiver) return null;

  return (
    <div className="min-h-screen bg-white py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-md border border-border overflow-hidden">
        {/* Header */}
        <div className="bg-primary px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-white text-xl font-bold">
              {waiver.template_headline || waiver.template_title}
            </h1>
            <LanguageSwitcher variant="full" persist={false} className="shrink-0 text-white hover:bg-white/15 hover:text-white" />
          </div>
          <p className="text-primary-foreground/80 text-sm mt-1 whitespace-pre-wrap">
            {waiver.template_sub_headline || t('defaults.subHeadline')}
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Blocks */}
          {waiver.template_blocks.map((block) => (
            <BlockRenderer
              key={block.id}
              block={block}
              answer={answers[block.id]}
              onAnswer={(v) => setAnswer(block.id, v)}
              images={imageFiles[block.id] ?? []}
              onImagesChange={(files) => setBlockImages(block.id, files)}
              error={errors[block.id]}
              cityOptions={cityOptions}
              referralOptions={referralOptions}
            />
          ))}

          {/* Full name */}
          <div className="space-y-1.5">
            <Label htmlFor="signer-name" className="font-medium">
              {t('signer.fullName')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="signer-name"
              value={signerName}
              onChange={(e) => { setSignerName(e.target.value); setErrors((p) => { const n = { ...p }; delete n['__name']; return n; }); }}
              placeholder={t('signer.fullNamePlaceholder')}
              className={errors['__name'] ? 'border-destructive' : ''}
            />
            {errors['__name'] && <p className="text-xs text-destructive">{errors['__name']}</p>}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="signer-email" className="font-medium">
              {t('signer.email')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="signer-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={signerEmail}
              onChange={(e) => { setSignerEmail(e.target.value); setErrors((p) => { const n = { ...p }; delete n['__email']; return n; }); }}
              placeholder={t('signer.emailPlaceholder')}
              className={errors['__email'] ? 'border-destructive' : ''}
            />
            {errors['__email'] && <p className="text-xs text-destructive">{errors['__email']}</p>}
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="signer-phone" className="font-medium">
              {t('signer.phone')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="signer-phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={signerPhone}
              onChange={(e) => { setSignerPhone(e.target.value); setErrors((p) => { const n = { ...p }; delete n['__phone']; return n; }); }}
              placeholder={t('signer.phonePlaceholder')}
              className={errors['__phone'] ? 'border-destructive' : ''}
            />
            {errors['__phone'] && <p className="text-xs text-destructive">{errors['__phone']}</p>}
          </div>

          {/* Signature pad */}
          <div className="space-y-2">
            <Label className="font-medium">
              {t('signature.label')} <span className="text-destructive">*</span>
            </Label>

            {/* Electronic records consent */}
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <Checkbox
                checked={mainConsent}
                onCheckedChange={(c) => {
                  const next = c === true;
                  setMainConsent(next);
                  if (!next) { sigRef.current?.clear(); sigDataUrlRef.current = null; setCapturedSig(null); }
                  setErrors((p) => { const n = { ...p }; delete n['__sig']; return n; });
                }}
                className="mt-0.5"
              />
              <span className="text-sm leading-relaxed">
                {t('signature.consentPrefix')}
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setShowMainDisclosure(true); }}
                  className="text-primary hover:underline font-medium"
                >
                  {t('signature.consentLink')}
                </button>
                {t('signature.consentSuffix')}
              </span>
            </label>

            {capturedSig ? (
              <div className={`relative border-2 rounded-lg overflow-hidden ${errors['__sig'] ? 'border-destructive' : 'border-green-400'}`}>
                <img src={capturedSig} alt={t('signature.alt')} className="w-full" style={{ height: 140, objectFit: 'contain', background: '#fafafa' }} />
                <div className="absolute inset-0 flex items-end justify-end p-2 pointer-events-none">
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">{t('signature.saved')}</span>
                </div>
              </div>
            ) : (
              <div ref={canvasContainerRef} className={`relative border-2 rounded-lg overflow-hidden ${errors['__sig'] ? 'border-destructive' : 'border-gray-400'}`}>
                <SignatureCanvas
                  ref={sigRef}
                  penColor="#1e1e2e"
                  canvasProps={{
                    className: 'w-full',
                    style: {
                      height: 140,
                      background: '#ffffff',
                      touchAction: 'none',
                      pointerEvents: mainConsent ? 'auto' : 'none',
                    },
                  }}
                  onEnd={() => {
                    if (sigRef.current && !sigRef.current.isEmpty()) {
                      setCapturedSig(sigRef.current.getTrimmedCanvas().toDataURL('image/png'));
                    }
                    setErrors((p) => { const n = { ...p }; delete n['__sig']; return n; });
                  }}
                />
                {!mainConsent && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-gray-100/70">
                    <span className="text-sm font-medium text-gray-800 bg-white px-3 py-1.5 rounded-full border border-gray-300 shadow-sm">
                      {t('signature.enableHint')}
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-between items-center">
              {errors['__sig'] ? (
                <p className="text-xs text-destructive">{errors['__sig']}</p>
              ) : (
                <p className="text-xs text-gray-700">
                  {capturedSig ? t('signature.captured') : mainConsent ? t('signature.draw') : t('signature.consentRequired')}
                </p>
              )}
              <button
                type="button"
                onClick={() => { sigRef.current?.clear(); setCapturedSig(null); sigDataUrlRef.current = null; }}
                className="flex items-center gap-1 text-xs text-gray-700 hover:text-foreground transition-colors"
                disabled={!mainConsent && !capturedSig}
              >
                <RotateCcw className="h-3 w-3" /> {t('signature.resign')}
              </button>
            </div>

            <EsignDisclosureModal open={showMainDisclosure} onClose={() => setShowMainDisclosure(false)} />
          </div>

          {submitError && (
            <div className="rounded-lg bg-red-50 border-2 border-red-500 px-4 py-3 text-sm text-red-900 font-medium">
              {submitError}
            </div>
          )}

          <Button className="w-full" size="lg" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <><Loader2 className="h-4 w-4 me-2 animate-spin" />{t('submit.submitting')}</> : t('submit.button')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Block renderer ────────────────────────────────────────────
function BlockRenderer({
  block, answer, onAnswer, images, onImagesChange, error, cityOptions, referralOptions,
}: {
  block: WaiverBlock;
  answer: string | boolean | string[] | undefined;
  onAnswer: (v: string | boolean | string[]) => void;
  images: StagedImage[];
  onImagesChange: (files: StagedImage[]) => void;
  error?: string;
  cityOptions: string[];
  referralOptions: string[];
}) {
  const { t } = useTranslation('waiverForm');

  if (block.type === 'text') {
    return (
      <div className="prose prose-sm max-w-none bg-white border border-border rounded-lg px-4 py-3 text-sm text-foreground whitespace-pre-wrap">
        {block.value}
      </div>
    );
  }

  if (block.type === 'heading') {
    return (
      <h2 className="text-xl font-semibold text-foreground tracking-tight pt-2">
        {block.value}
      </h2>
    );
  }

  if (block.type === 'subheading') {
    return (
      <h3 className="text-base font-semibold text-foreground/90">
        {block.value}
      </h3>
    );
  }

  if (block.type === 'checkbox') {
    return (
      <div className="space-y-1">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-white px-4 py-3">
          <Checkbox
            id={block.id}
            checked={answer === true}
            onCheckedChange={(c) => onAnswer(c === true)}
            className="mt-0.5"
          />
          <label htmlFor={block.id} className="text-sm cursor-pointer leading-relaxed">
            {block.label}
            {block.required && <span className="text-destructive ms-1">*</span>}
          </label>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (block.type === 'yes_no') {
    return (
      <div className="space-y-1.5">
        <Label className="font-medium">
          {block.label}
          {block.required && <span className="text-destructive ms-1">*</span>}
        </Label>
        <div className="flex gap-3">
          {/* Stored values stay 'Yes' / 'No' (Firestore data); only the label is localized. */}
          {([
            { value: 'Yes', label: t('common:actions.yes') },
            { value: 'No', label: t('common:actions.no') },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onAnswer(opt.value)}
              className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                answer === opt.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:border-primary/50 hover:bg-muted/30'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (block.type === 'short_answer') {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={block.id} className="font-medium">
          {block.label}
          {block.required && <span className="text-destructive ms-1">*</span>}
        </Label>
        <Input
          id={block.id}
          value={typeof answer === 'string' ? answer : ''}
          onChange={(e) => onAnswer(e.target.value)}
          placeholder={t('blocks.yourAnswer')}
          className={error ? 'border-destructive' : ''}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (block.type === 'email') {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={block.id} className="font-medium">
          {block.label || t('defaults.email')}
          {block.required && <span className="text-destructive ms-1">*</span>}
        </Label>
        <Input
          id={block.id}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={typeof answer === 'string' ? answer : ''}
          onChange={(e) => onAnswer(e.target.value)}
          placeholder={t('blocks.emailPlaceholder')}
          className={error ? 'border-destructive' : ''}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (block.type === 'phone') {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={block.id} className="font-medium">
          {block.label || t('defaults.phone')}
          {block.required && <span className="text-destructive ms-1">*</span>}
        </Label>
        <Input
          id={block.id}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={typeof answer === 'string' ? answer : ''}
          onChange={(e) => onAnswer(e.target.value)}
          placeholder={t('blocks.phonePlaceholder')}
          className={error ? 'border-destructive' : ''}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (block.type === 'date') {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={block.id} className="font-medium">
          {block.label || t('defaults.date')}
          {block.required && <span className="text-destructive ms-1">*</span>}
        </Label>
        <Input
          id={block.id}
          type="date"
          value={typeof answer === 'string' ? answer : ''}
          onChange={(e) => onAnswer(e.target.value)}
          className={error ? 'border-destructive' : ''}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (block.type === 'city' || block.type === 'referral_source') {
    const options = block.type === 'city' ? cityOptions : referralOptions;
    return (
      <DropdownWithOtherBlock
        block={block}
        answer={typeof answer === 'string' ? answer : ''}
        onAnswer={onAnswer}
        options={options}
        defaultLabel={block.type === 'city' ? t('defaults.city') : t('defaults.referralSource')}
        placeholder={block.type === 'city' ? t('blocks.selectCity') : t('blocks.selectSource')}
        otherLabel={block.type === 'city' ? t('blocks.otherCity') : t('blocks.otherSource')}
        otherPlaceholder={block.type === 'city' ? t('blocks.enterCity') : t('blocks.enterSource')}
        error={error}
      />
    );
  }

  if (
    block.type === 'package_name' ||
    block.type === 'package_price' ||
    block.type === 'package_sessions' ||
    block.type === 'purchase_date' ||
    block.type === 'expiry_date'
  ) {
    const lbl = block.label?.trim() || purchaseBlockLabel(block.type);
    const value = typeof answer === 'string' ? answer : '—';
    return (
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-white px-4 py-3">
        <span className="text-sm text-gray-700">{lbl}</span>
        <span className="text-sm font-medium text-foreground ltr-inline">{value}</span>
      </div>
    );
  }

  if (block.type === 'time') {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={block.id} className="font-medium">
          {block.label || t('defaults.time')}
          {block.required && <span className="text-destructive ms-1">*</span>}
        </Label>
        <Input
          id={block.id}
          type="time"
          value={typeof answer === 'string' ? answer : ''}
          onChange={(e) => onAnswer(e.target.value)}
          className={error ? 'border-destructive' : ''}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (block.type === 'signature') {
    return (
      <SignatureBlock
        block={block}
        answer={typeof answer === 'string' ? answer : ''}
        onAnswer={(dataUrl) => onAnswer(dataUrl)}
        error={error}
      />
    );
  }

  if (block.type === 'image_upload') {
    const max = block.maxImages ?? DEFAULT_MAX_IMAGES;
    const remaining = Math.max(0, max - images.length);

    const handleFiles = async (list: FileList | null) => {
      if (!list) return;
      const incoming = Array.from(list);
      const accepted: File[] = [];
      const tooBig: string[] = [];
      for (const f of incoming) {
        if (accepted.length + images.length >= max) break;
        if (f.size > MAX_IMAGE_SIZE_BYTES) { tooBig.push(f.name); continue; }
        if (!f.type.startsWith('image/')) continue;
        accepted.push(f);
      }
      // Read bytes into a JS-owned Blob now, while the OS URI permission is
      // still valid. Android Chrome will revoke it later otherwise.
      const staged: StagedImage[] = [];
      const failed: string[] = [];
      for (const f of accepted) {
        try {
          staged.push(await detachFile(f));
        } catch {
          failed.push(f.name);
        }
      }
      if (staged.length > 0) onImagesChange([...images, ...staged]);
      if (tooBig.length > 0) {
        alert(t('blocks.skippedTooBig', { names: tooBig.join(', ') }));
      }
      if (failed.length > 0) {
        alert(t('blocks.couldNotRead', { names: failed.join(', ') }));
      }
    };

    const removeAt = (idx: number) => {
      const next = images.filter((_, i) => i !== idx);
      onImagesChange(next);
    };

    return (
      <div className="space-y-2">
        <Label className="font-medium">
          {block.label || t('defaults.uploadPhotos')}
          {block.required && <span className="text-destructive ms-1">*</span>}
        </Label>

        {images.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {images.map((file, idx) => (
              <div key={idx} className="relative group rounded-lg overflow-hidden border border-border bg-white aspect-square">
                <img
                  src={URL.createObjectURL(file.blob)}
                  alt={t('blocks.uploadAlt', { index: idx + 1 })}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  className="absolute top-1 end-1 bg-black/70 hover:bg-black text-white rounded-full p-1 transition-colors"
                  aria-label={t('blocks.removeImage')}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {remaining > 0 && (
          <label
            className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-lg px-4 py-6 cursor-pointer hover:bg-muted/50 transition-colors ${
              error ? 'border-destructive' : 'border-border'
            }`}
          >
            <Upload className="h-5 w-5 text-gray-700" />
            <span className="text-sm text-gray-700">
              {images.length === 0
                ? t('blocks.tapToAddPhoto', { remaining })
                : t('blocks.tapToAddAnother', { remaining })}
            </span>
            <span className="text-xs text-gray-600">{t('blocks.formats')}</span>
            <input
              type="file"
              accept="image/*"
              multiple={max > 1}
              className="hidden"
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
            />
          </label>
        )}

        {remaining === 0 && (
          <p className="text-xs text-gray-700 flex items-center gap-1">
            <ImageIcon className="h-3.5 w-3.5" /> {t('blocks.maxReached', { count: max })}
          </p>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return null;
}

// ── Signature block ───────────────────────────────────────────
function SignatureBlock({
  block, answer, onAnswer, error,
}: {
  block: WaiverBlock;
  answer: string;
  onAnswer: (dataUrl: string) => void;
  error?: string;
}) {
  const { t } = useTranslation('waiverForm');
  const ref = useRef<SignatureCanvas>(null);
  const [consented, setConsented] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);

  const capture = () => {
    if (!ref.current || ref.current.isEmpty()) return;
    const dataUrl = ref.current.getTrimmedCanvas().toDataURL('image/png');
    setCaptured(dataUrl);
    onAnswer(dataUrl);
  };

  const clear = () => {
    ref.current?.clear();
    setCaptured(null);
    onAnswer('');
  };

  const toggleConsent = (next: boolean) => {
    setConsented(next);
    if (!next) {
      ref.current?.clear();
      setCaptured(null);
      onAnswer('');
    }
  };

  return (
    <div className="space-y-2">
      <Label className="font-medium">
        {block.label || t('defaults.signature')}
        <span className="text-destructive ms-1">*</span>
      </Label>

      {/* Electronic records consent */}
      <label className="flex items-start gap-2 cursor-pointer select-none">
        <Checkbox
          checked={consented}
          onCheckedChange={(c) => toggleConsent(c === true)}
          className="mt-0.5"
        />
        <span className="text-sm leading-relaxed">
          {t('signature.consentPrefix')}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setShowDisclosure(true); }}
            className="text-primary hover:underline font-medium"
          >
            {t('signature.consentLink')}
          </button>
          {t('signature.consentSuffix')}
        </span>
      </label>

      {captured ? (
        <div className={`relative border-2 rounded-lg overflow-hidden ${error ? 'border-destructive' : 'border-green-400'}`}>
          <img src={captured} alt={t('signature.alt')} className="w-full" style={{ height: 140, objectFit: 'contain', background: '#fafafa' }} />
          <div className="absolute inset-0 flex items-end justify-end p-2 pointer-events-none">
            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">{t('signature.saved')}</span>
          </div>
        </div>
      ) : (
        <div className={`relative border-2 rounded-lg overflow-hidden ${error ? 'border-destructive' : 'border-gray-400'}`}>
          <SignatureCanvas
            ref={ref}
            penColor="#1e1e2e"
            canvasProps={{
              className: 'w-full',
              style: {
                height: 140,
                background: '#ffffff',
                touchAction: 'none',
                pointerEvents: consented ? 'auto' : 'none',
              },
            }}
            onEnd={capture}
          />
          {!consented && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-gray-100/70">
              <span className="text-sm font-medium text-gray-800 bg-white px-3 py-1.5 rounded-full border border-gray-300 shadow-sm">
                {t('signature.enableHint')}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between items-center">
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <p className="text-xs text-gray-700">
            {captured ? t('signature.captured') : consented ? t('signature.draw') : t('signature.consentRequired')}
          </p>
        )}
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-1 text-xs text-gray-700 hover:text-foreground transition-colors"
          disabled={!consented && !captured}
        >
          <RotateCcw className="h-3 w-3" /> {t('signature.resign')}
        </button>
      </div>

      <EsignDisclosureModal open={showDisclosure} onClose={() => setShowDisclosure(false)} />
    </div>
  );
}

// ── Dropdown-with-Other (city / referral_source) ──────────────
function DropdownWithOtherBlock({
  block, answer, onAnswer, options, defaultLabel, placeholder, otherLabel, otherPlaceholder, error,
}: {
  block: WaiverBlock;
  answer: string;
  onAnswer: (v: string) => void;
  options: string[];
  defaultLabel: string;
  placeholder: string;
  otherLabel: string;
  otherPlaceholder: string;
  error?: string;
}) {
  // Default Other-mode when the prefilled value isn't in the (current) options list.
  const initialOther = !!answer && !options.includes(answer);
  const [otherMode, setOtherMode] = useState(initialOther);

  const selectValue = otherMode ? OTHER_VALUE : (options.includes(answer) ? answer : '');

  return (
    <div className="space-y-1.5">
      <Label htmlFor={block.id} className="font-medium">
        {block.label || defaultLabel}
        {block.required && <span className="text-destructive ms-1">*</span>}
      </Label>
      <select
        id={block.id}
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === OTHER_VALUE) {
            setOtherMode(true);
            onAnswer('');
          } else {
            setOtherMode(false);
            onAnswer(v);
          }
        }}
        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary ${error ? 'border-destructive' : 'border-input'}`}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
        <option value={OTHER_VALUE}>{otherLabel}</option>
      </select>
      {otherMode && (
        <Input
          value={answer}
          onChange={(e) => onAnswer(e.target.value)}
          placeholder={otherPlaceholder}
          autoFocus
        />
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── E-signature disclosure modal ──────────────────────────────
function EsignDisclosureModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('waiverForm');
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('disclosure.title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('disclosure.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm text-foreground">
          <p>{t('disclosure.intro')}</p>

          <div>
            <p className="font-semibold">{t('disclosure.paperCopiesTitle')}</p>
            <p>{t('disclosure.paperCopies')}</p>
          </div>

          <div>
            <p className="font-semibold">{t('disclosure.withdrawTitle')}</p>
            <p>{t('disclosure.withdraw')}</p>
          </div>

          <div>
            <p className="font-semibold">{t('disclosure.systemTitle')}</p>
            <p>{t('disclosure.system')}</p>
          </div>

          <div>
            <p className="font-semibold">{t('disclosure.contactTitle')}</p>
            <p>{t('disclosure.contact')}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Centered screen wrapper ───────────────────────────────────
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-8 bg-white">
      <div className="absolute top-4 end-4">
        <LanguageSwitcher variant="full" persist={false} />
      </div>
      <div className="flex flex-col items-center text-center max-w-sm">{children}</div>
    </div>
  );
}
