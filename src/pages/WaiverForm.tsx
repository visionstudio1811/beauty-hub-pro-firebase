
import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import jsPDF from 'jspdf';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
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
  | 'time';

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
  template_title: string;
  template_headline: string;
  template_sub_headline: string;
  template_blocks: WaiverBlock[];
  client_name: string;
  client_email: string;
  client_phone: string;
}

// ── Helpers ───────────────────────────────────────────────────
async function uploadPdf(blob: Blob, token: string): Promise<string> {
  const path = `waivers/${token}.pdf`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: 'application/pdf' });
  return getDownloadURL(storageRef);
}

async function uploadWaiverImage(file: File, token: string, blockId: string, index: number): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `waivers/${token}/photos/${blockId}-${index}-${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
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

async function buildPdf(
  title: string,
  signerName: string,
  signerEmail: string,
  signerPhone: string,
  blocks: WaiverBlock[],
  answers: Record<string, string | boolean | string[]>,
  sigDataUrl: string,
  imageDataUrls: Record<string, string[]>,
): Promise<Blob> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (h: number) => {
    if (y + h > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const addText = (text: string, size: number, bold = false, color = '#111111') => {
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(text, contentW);
    lines.forEach((line: string) => {
      ensureSpace(size * 1.4);
      doc.text(line, margin, y);
      y += size * 1.4;
    });
    y += 4;
  };

  // Title
  addText(title, 20, true);
  addText(`Signed by: ${signerName}`, 11, false, '#555555');
  if (signerEmail) addText(`Email: ${signerEmail}`, 11, false, '#555555');
  if (signerPhone) addText(`Phone: ${signerPhone}`, 11, false, '#555555');
  addText(`Date: ${new Date().toLocaleString()}`, 11, false, '#555555');
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
      addText(block.label || 'Signature', 11, true);
      const dataUrl = typeof answers[block.id] === 'string' ? (answers[block.id] as string) : '';
      if (dataUrl) {
        addText('Signer agreed to use electronic records and signatures.', 9, false, '#666666');
        const sigH = 80;
        const sigW = 240;
        ensureSpace(sigH);
        doc.addImage(dataUrl, 'PNG', margin, y, sigW, sigH);
        y += sigH + 6;
      } else {
        addText('  (not signed)', 10, false, '#888888');
      }
      y += 4;
    } else if (block.type === 'image_upload') {
      if (block.label) addText(block.label, 11, true);
      const dataUrls = imageDataUrls[block.id] ?? [];
      if (dataUrls.length === 0) {
        addText('  (no images uploaded)', 10, false, '#888888');
      } else {
        const maxW = contentW;
        const maxH = 220;
        for (const dataUrl of dataUrls) {
          const { w, h } = await loadImageSize(dataUrl);
          const ratio = Math.min(maxW / w, maxH / h, 1);
          const drawW = w * ratio;
          const drawH = h * ratio;
          ensureSpace(drawH + 8);
          const fmt = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
          doc.addImage(dataUrl, fmt, margin, y, drawW, drawH);
          y += drawH + 8;
        }
      }
      y += 4;
    } else if (block.label) {
      addText(block.label, 11, true);
      const answer = answers[block.id];
      const answerText =
        typeof answer === 'boolean'
          ? answer ? 'Yes / Agreed' : 'No'
          : Array.isArray(answer)
          ? answer.length === 0 ? '—' : `${answer.length} file(s)`
          : String(answer ?? '—');
      addText(`  Answer: ${answerText}`, 10, false, '#444444');
      y += 6;
    }
  }

  // Signature
  y += 16;
  addText('Signature:', 11, true);
  const imgH = 80;
  const imgW = 240;
  ensureSpace(imgH);
  doc.addImage(sigDataUrl, 'PNG', margin, y, imgW, imgH);

  return doc.output('blob');
}

// ── Component ─────────────────────────────────────────────────
export default function WaiverForm() {
  const { token } = useParams<{ token: string }>();
  const sigRef = useRef<SignatureCanvas>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [waiver, setWaiver] = useState<WaiverData | null>(null);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [expired, setExpired] = useState(false);
  const [done, setDone] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerPhone, setSignerPhone] = useState('');
  const [mainConsent, setMainConsent] = useState(false);
  const [showMainDisclosure, setShowMainDisclosure] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | boolean | string[]>>({});
  const [imageFiles, setImageFiles] = useState<Record<string, File[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load waiver data from Firestore via waiverTokens collection
  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }

    (async () => {
      try {
        // Token IS the document ID in waiverTokens
        const tokenSnap = await getDoc(doc(db, 'waiverTokens', token));
        if (!tokenSnap.exists()) { setNotFound(true); setLoading(false); return; }

        const tokenData = tokenSnap.data();
        const waiverId: string = tokenData.waiverId;         // sendWaiver uses camelCase
        const orgId: string = tokenData.organizationId;

        // Check if already signed
        if (tokenData.status === 'signed') { setAlreadySigned(true); setLoading(false); return; }

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

        setWaiver({
          waiver_id: waiverId,
          template_title: tpl?.title ?? 'Waiver',
          template_headline: tpl?.headline ?? '',
          template_sub_headline: tpl?.sub_headline ?? '',
          template_blocks: tpl?.content ?? [],
          client_name: wd.clientName ?? '',
          client_email: wd.clientEmail ?? '',
          client_phone: wd.clientPhone ?? '',
        });
        setSignerName(wd.clientName ?? '');
        setSignerEmail(wd.clientEmail ?? '');
        setSignerPhone(wd.clientPhone ?? '');
      } catch (err) {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const setAnswer = (blockId: string, value: string | boolean | string[]) => {
    setAnswers((prev) => ({ ...prev, [blockId]: value }));
    setErrors((prev) => { const next = { ...prev }; delete next[blockId]; return next; });
  };

  const setBlockImages = (blockId: string, files: File[]) => {
    setImageFiles((prev) => ({ ...prev, [blockId]: files }));
    setErrors((prev) => { const next = { ...prev }; delete next[blockId]; return next; });
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!signerName.trim()) newErrors['__name'] = 'Please enter your full name.';
    if (!signerEmail.trim()) newErrors['__email'] = 'Please enter your email.';
    else if (!EMAIL_RE.test(signerEmail.trim())) newErrors['__email'] = 'Please enter a valid email address.';
    if (!signerPhone.trim()) newErrors['__phone'] = 'Please enter your phone number.';
    else if (!PHONE_RE.test(signerPhone.trim())) newErrors['__phone'] = 'Please enter a valid phone number.';
    if (!waiver) return newErrors;
    waiver.template_blocks.forEach((block) => {
      if (block.type === 'text' || block.type === 'heading' || block.type === 'subheading') return;
      if (block.type === 'image_upload') {
        if (!block.required) return;
        const files = imageFiles[block.id] ?? [];
        if (files.length === 0) newErrors[block.id] = 'Please upload at least one image.';
        return;
      }
      if (block.type === 'signature') {
        // Signatures are always required
        const ans = answers[block.id];
        if (typeof ans !== 'string' || !ans) {
          newErrors[block.id] = 'Please draw your signature.';
        }
        return;
      }
      if (!block.required) return;
      const ans = answers[block.id];
      if (ans === undefined || ans === '' || ans === null) {
        newErrors[block.id] = 'This field is required.';
        return;
      }
      if (block.type === 'email' && typeof ans === 'string' && !EMAIL_RE.test(ans.trim())) {
        newErrors[block.id] = 'Please enter a valid email address.';
      }
      if (block.type === 'phone' && typeof ans === 'string' && !PHONE_RE.test(ans.trim())) {
        newErrors[block.id] = 'Please enter a valid phone number.';
      }
    });
    if (!mainConsent) {
      newErrors['__sig'] = 'Please agree to use electronic records and signatures.';
    } else if (!sigRef.current || sigRef.current.isEmpty()) {
      newErrors['__sig'] = 'Please draw your signature.';
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
        imageDataUrls[block.id] = await Promise.all(files.map(fileToDataUrl));
        finalAnswers[block.id] = await Promise.all(
          files.map((f, i) => uploadWaiverImage(f, token!, block.id, i))
        );
      }

      const sigDataUrl = sigRef.current!.getTrimmedCanvas().toDataURL('image/png');
      const pdfTitle = waiver.template_headline || waiver.template_title;
      const pdfBlob = await buildPdf(pdfTitle, signerName, signerEmail, signerPhone, waiver.template_blocks, finalAnswers, sigDataUrl, imageDataUrls);
      const pdfUrl  = await uploadPdf(pdfBlob, token!);

      // Re-read token doc by ID to get orgId and waiverId
      const tokenSnap = await getDoc(doc(db, 'waiverTokens', token!));
      if (!tokenSnap.exists()) throw new Error('Token not found');
      const { organizationId: orgId, waiverId } = tokenSnap.data();

      // Update the waiver with signature data
      await updateDoc(doc(db, 'organizations', orgId, 'clientWaivers', waiverId), {
        status: 'signed',
        signer_name: signerName,
        signer_email: signerEmail,
        signer_phone: signerPhone,
        answers: finalAnswers,
        pdf_url: pdfUrl,
        signed_at: new Date().toISOString(),
      });
      // Mark token as used
      await updateDoc(doc(db, 'waiverTokens', token!), { status: 'signed' });

      setDone(true);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ── States ────────────────────────────────────────────────
  if (loading) return (
    <Screen><Loader2 className="h-8 w-8 animate-spin text-primary" /></Screen>
  );
  if (notFound) return (
    <Screen>
      <AlertCircle className="h-10 w-10 text-destructive mb-3" />
      <h2 className="text-lg font-semibold">Link not found</h2>
      <p className="text-sm text-muted-foreground mt-1">This waiver link is invalid or has expired.</p>
    </Screen>
  );
  if (alreadySigned) return (
    <Screen>
      <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
      <h2 className="text-lg font-semibold">Already submitted</h2>
      <p className="text-sm text-muted-foreground mt-1">This waiver has already been signed. Thank you!</p>
    </Screen>
  );
  if (expired) return (
    <Screen>
      <AlertCircle className="h-10 w-10 text-destructive mb-3" />
      <h2 className="text-lg font-semibold">Link expired</h2>
      <p className="text-sm text-muted-foreground mt-1">This waiver link has expired. Please contact the business for a new link.</p>
    </Screen>
  );
  if (done) return (
    <Screen>
      <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
      <h2 className="text-xl font-semibold">Thank you, {signerName.split(' ')[0]}!</h2>
      <p className="text-sm text-muted-foreground mt-2">Your waiver has been signed and saved. You may close this page.</p>
    </Screen>
  );

  if (!waiver) return null;

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
        {/* Header */}
        <div className="bg-primary px-6 py-5">
          <h1 className="text-white text-xl font-bold">
            {waiver.template_headline || waiver.template_title}
          </h1>
          <p className="text-primary-foreground/80 text-sm mt-1 whitespace-pre-wrap">
            {waiver.template_sub_headline || 'Please read carefully and complete all required fields.'}
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
            />
          ))}

          {/* Full name */}
          <div className="space-y-1.5">
            <Label htmlFor="signer-name" className="font-medium">
              Full Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="signer-name"
              value={signerName}
              onChange={(e) => { setSignerName(e.target.value); setErrors((p) => { const n = { ...p }; delete n['__name']; return n; }); }}
              placeholder="Your full name"
              className={errors['__name'] ? 'border-destructive' : ''}
            />
            {errors['__name'] && <p className="text-xs text-destructive">{errors['__name']}</p>}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="signer-email" className="font-medium">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="signer-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={signerEmail}
              onChange={(e) => { setSignerEmail(e.target.value); setErrors((p) => { const n = { ...p }; delete n['__email']; return n; }); }}
              placeholder="you@example.com"
              className={errors['__email'] ? 'border-destructive' : ''}
            />
            {errors['__email'] && <p className="text-xs text-destructive">{errors['__email']}</p>}
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="signer-phone" className="font-medium">
              Phone <span className="text-destructive">*</span>
            </Label>
            <Input
              id="signer-phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={signerPhone}
              onChange={(e) => { setSignerPhone(e.target.value); setErrors((p) => { const n = { ...p }; delete n['__phone']; return n; }); }}
              placeholder="+1 555 123 4567"
              className={errors['__phone'] ? 'border-destructive' : ''}
            />
            {errors['__phone'] && <p className="text-xs text-destructive">{errors['__phone']}</p>}
          </div>

          {/* Signature pad */}
          <div className="space-y-2">
            <Label className="font-medium">
              Signature <span className="text-destructive">*</span>
            </Label>

            {/* Electronic records consent */}
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <Checkbox
                checked={mainConsent}
                onCheckedChange={(c) => {
                  const next = c === true;
                  setMainConsent(next);
                  if (!next) sigRef.current?.clear();
                  setErrors((p) => { const n = { ...p }; delete n['__sig']; return n; });
                }}
                className="mt-0.5"
              />
              <span className="text-sm leading-relaxed">
                I agree to use{' '}
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setShowMainDisclosure(true); }}
                  className="text-primary hover:underline font-medium"
                >
                  electronic records and signatures
                </button>
                .
              </span>
            </label>

            <div className={`relative border-2 rounded-lg overflow-hidden ${errors['__sig'] ? 'border-destructive' : 'border-border'}`}>
              <SignatureCanvas
                ref={sigRef}
                penColor="#1e1e2e"
                canvasProps={{
                  className: 'w-full',
                  style: {
                    height: 140,
                    background: '#fafafa',
                    touchAction: 'none',
                    pointerEvents: mainConsent ? 'auto' : 'none',
                    opacity: mainConsent ? 1 : 0.5,
                  },
                }}
                onEnd={() => setErrors((p) => { const n = { ...p }; delete n['__sig']; return n; })}
              />
              {!mainConsent && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-xs text-muted-foreground bg-background/80 px-3 py-1 rounded-full">
                    Check the box above to enable signing
                  </span>
                </div>
              )}
            </div>
            <div className="flex justify-between items-center">
              {errors['__sig'] ? (
                <p className="text-xs text-destructive">{errors['__sig']}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {mainConsent ? 'Draw your signature above' : 'Consent required before signing'}
                </p>
              )}
              <button
                type="button"
                onClick={() => sigRef.current?.clear()}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                disabled={!mainConsent}
              >
                <RotateCcw className="h-3 w-3" /> Clear
              </button>
            </div>

            <EsignDisclosureModal open={showMainDisclosure} onClose={() => setShowMainDisclosure(false)} />
          </div>

          {submitError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
              {submitError}
            </div>
          )}

          <Button className="w-full" size="lg" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</> : 'Submit & Sign'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Block renderer ────────────────────────────────────────────
function BlockRenderer({
  block, answer, onAnswer, images, onImagesChange, error,
}: {
  block: WaiverBlock;
  answer: string | boolean | string[] | undefined;
  onAnswer: (v: string | boolean | string[]) => void;
  images: File[];
  onImagesChange: (files: File[]) => void;
  error?: string;
}) {
  if (block.type === 'text') {
    return (
      <div className="prose prose-sm max-w-none bg-muted/40 rounded-lg px-4 py-3 text-sm text-foreground whitespace-pre-wrap">
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
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
          <Checkbox
            id={block.id}
            checked={answer === true}
            onCheckedChange={(c) => onAnswer(c === true)}
            className="mt-0.5"
          />
          <label htmlFor={block.id} className="text-sm cursor-pointer leading-relaxed">
            {block.label}
            {block.required && <span className="text-destructive ml-1">*</span>}
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
          {block.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <div className="flex gap-3">
          {(['Yes', 'No'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onAnswer(opt)}
              className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                answer === opt
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:border-primary/50 hover:bg-muted/30'
              }`}
            >
              {opt}
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
          {block.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          id={block.id}
          value={typeof answer === 'string' ? answer : ''}
          onChange={(e) => onAnswer(e.target.value)}
          placeholder="Your answer"
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
          {block.label || 'Email'}
          {block.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          id={block.id}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={typeof answer === 'string' ? answer : ''}
          onChange={(e) => onAnswer(e.target.value)}
          placeholder="name@example.com"
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
          {block.label || 'Phone'}
          {block.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          id={block.id}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={typeof answer === 'string' ? answer : ''}
          onChange={(e) => onAnswer(e.target.value)}
          placeholder="+1 555 123 4567"
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
          {block.label || 'Date'}
          {block.required && <span className="text-destructive ml-1">*</span>}
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

  if (block.type === 'time') {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={block.id} className="font-medium">
          {block.label || 'Time'}
          {block.required && <span className="text-destructive ml-1">*</span>}
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

    const handleFiles = (list: FileList | null) => {
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
      onImagesChange([...images, ...accepted]);
      if (tooBig.length > 0) {
        alert(`Skipped (over 10 MB): ${tooBig.join(', ')}`);
      }
    };

    const removeAt = (idx: number) => {
      const next = images.filter((_, i) => i !== idx);
      onImagesChange(next);
    };

    return (
      <div className="space-y-2">
        <Label className="font-medium">
          {block.label || 'Upload photo(s)'}
          {block.required && <span className="text-destructive ml-1">*</span>}
        </Label>

        {images.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {images.map((file, idx) => (
              <div key={idx} className="relative group rounded-lg overflow-hidden border border-border bg-muted/30 aspect-square">
                <img
                  src={URL.createObjectURL(file)}
                  alt={`Upload ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  className="absolute top-1 right-1 bg-black/70 hover:bg-black text-white rounded-full p-1 transition-colors"
                  aria-label="Remove image"
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
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Tap to add {images.length === 0 ? 'photo' : 'another photo'} ({remaining} left)
            </span>
            <span className="text-xs text-muted-foreground">JPG, PNG — up to 10 MB each</span>
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
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <ImageIcon className="h-3.5 w-3.5" /> Maximum of {max} image{max > 1 ? 's' : ''} reached
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
  const ref = useRef<SignatureCanvas>(null);
  const [consented, setConsented] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(false);

  const capture = () => {
    if (!ref.current || ref.current.isEmpty()) { onAnswer(''); return; }
    const dataUrl = ref.current.getTrimmedCanvas().toDataURL('image/png');
    onAnswer(dataUrl);
  };

  const clear = () => {
    ref.current?.clear();
    onAnswer('');
  };

  const toggleConsent = (next: boolean) => {
    setConsented(next);
    if (!next) {
      ref.current?.clear();
      onAnswer('');
    }
  };

  return (
    <div className="space-y-2">
      <Label className="font-medium">
        {block.label || 'Signature'}
        <span className="text-destructive ml-1">*</span>
      </Label>

      {/* Electronic records consent */}
      <label className="flex items-start gap-2 cursor-pointer select-none">
        <Checkbox
          checked={consented}
          onCheckedChange={(c) => toggleConsent(c === true)}
          className="mt-0.5"
        />
        <span className="text-sm leading-relaxed">
          I agree to use{' '}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setShowDisclosure(true); }}
            className="text-primary hover:underline font-medium"
          >
            electronic records and signatures
          </button>
          .
        </span>
      </label>

      <div className={`relative border-2 rounded-lg overflow-hidden ${error ? 'border-destructive' : 'border-border'}`}>
        <SignatureCanvas
          ref={ref}
          penColor="#1e1e2e"
          canvasProps={{
            className: 'w-full',
            style: {
              height: 140,
              background: '#fafafa',
              touchAction: 'none',
              pointerEvents: consented ? 'auto' : 'none',
              opacity: consented ? 1 : 0.5,
            },
          }}
          onEnd={capture}
        />
        {!consented && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-muted-foreground bg-background/80 px-3 py-1 rounded-full">
              Check the box above to enable signing
            </span>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center">
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {consented ? 'Draw your signature above' : 'Consent required before signing'}
          </p>
        )}
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          disabled={!consented}
        >
          <RotateCcw className="h-3 w-3" /> Clear
        </button>
      </div>

      <EsignDisclosureModal open={showDisclosure} onClose={() => setShowDisclosure(false)} />
    </div>
  );
}

// ── E-signature disclosure modal ──────────────────────────────
function EsignDisclosureModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Electronic records & signatures — consumer disclosure</DialogTitle>
          <DialogDescription className="sr-only">
            Terms for signing this document electronically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm text-foreground">
          <p>
            By ticking the agreement box, you consent to use electronic records and
            electronic signatures for this document, and to conduct business with us
            through our online signing system instead of on paper. Your electronic
            signature has the same legal effect as a handwritten one.
          </p>

          <div>
            <p className="font-semibold">Getting paper copies</p>
            <p>
              You may request a paper copy of any record we send you electronically,
              at no charge, by contacting the business. You may also print or save
              this document from your device after signing.
            </p>
          </div>

          <div>
            <p className="font-semibold">Withdrawing consent</p>
            <p>
              You may withdraw your consent to receive electronic records at any time
              by contacting us. Withdrawal of consent does not affect the validity of
              documents already signed electronically.
            </p>
          </div>

          <div>
            <p className="font-semibold">System requirements</p>
            <p>
              To sign electronically you need an internet-connected device with a
              modern web browser, a valid email address on file, and the ability to
              view and download PDF documents.
            </p>
          </div>

          <div>
            <p className="font-semibold">How to contact us</p>
            <p>
              Contact the business directly (by phone, email, or in person) to request
              paper copies, update your contact details, or withdraw consent.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Centered screen wrapper ───────────────────────────────────
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-muted/30">
      <div className="flex flex-col items-center text-center max-w-sm">{children}</div>
    </div>
  );
}
