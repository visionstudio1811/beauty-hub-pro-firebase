
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
import { CheckCircle2, Loader2, AlertCircle, RotateCcw } from 'lucide-react';

// ── Block types ──────────────────────────────────────────────
export type BlockType = 'text' | 'checkbox' | 'yes_no' | 'short_answer';

export interface WaiverBlock {
  id: string;
  type: BlockType;
  value?: string;   // for text blocks
  label?: string;   // for question blocks
  required?: boolean;
}

interface WaiverData {
  waiver_id: string;
  template_title: string;
  template_blocks: WaiverBlock[];
  client_name: string;
}

// ── Helpers ───────────────────────────────────────────────────
async function uploadPdf(blob: Blob, token: string): Promise<string> {
  const path = `waivers/${token}.pdf`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: 'application/pdf' });
  return getDownloadURL(storageRef);
}

async function buildPdf(
  title: string,
  signerName: string,
  blocks: WaiverBlock[],
  answers: Record<string, string | boolean>,
  sigDataUrl: string,
): Promise<Blob> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const contentW = pageW - margin * 2;
  let y = margin;

  const addText = (text: string, size: number, bold = false, color = '#111111') => {
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(text, contentW);
    lines.forEach((line: string) => {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += size * 1.4;
    });
    y += 4;
  };

  // Title
  addText(title, 20, true);
  addText(`Signed by: ${signerName}`, 11, false, '#555555');
  addText(`Date: ${new Date().toLocaleString()}`, 11, false, '#555555');
  y += 12;

  // Blocks
  blocks.forEach((block) => {
    if (block.type === 'text' && block.value) {
      addText(block.value, 10, false, '#333333');
      y += 4;
    } else if (block.label) {
      addText(block.label, 11, true);
      const answer = answers[block.id];
      const answerText =
        typeof answer === 'boolean'
          ? answer ? 'Yes / Agreed' : 'No'
          : String(answer ?? '—');
      addText(`  Answer: ${answerText}`, 10, false, '#444444');
      y += 6;
    }
  });

  // Signature
  y += 16;
  addText('Signature:', 11, true);
  const sigImg = new Image();
  await new Promise<void>((resolve) => {
    sigImg.onload = () => resolve();
    sigImg.src = sigDataUrl;
  });
  const imgH = 80;
  const imgW = 240;
  if (y + imgH + margin > doc.internal.pageSize.getHeight()) {
    doc.addPage();
    y = margin;
  }
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
  const [done, setDone] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
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
          template_blocks: tpl?.content ?? [],
          client_name: wd.clientName ?? '',
        });
        setSignerName(wd.clientName ?? '');
      } catch (err) {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const setAnswer = (blockId: string, value: string | boolean) => {
    setAnswers((prev) => ({ ...prev, [blockId]: value }));
    setErrors((prev) => { const next = { ...prev }; delete next[blockId]; return next; });
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!signerName.trim()) newErrors['__name'] = 'Please enter your full name.';
    if (!waiver) return newErrors;
    waiver.template_blocks.forEach((block) => {
      if (!block.required || block.type === 'text') return;
      const ans = answers[block.id];
      if (ans === undefined || ans === '' || ans === null) {
        newErrors[block.id] = 'This field is required.';
      }
    });
    if (!sigRef.current || sigRef.current.isEmpty()) {
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
      const sigDataUrl = sigRef.current!.getTrimmedCanvas().toDataURL('image/png');
      const pdfBlob = await buildPdf(waiver.template_title, signerName, waiver.template_blocks, answers, sigDataUrl);
      const pdfUrl  = await uploadPdf(pdfBlob, token!);

      // Re-read token doc by ID to get orgId and waiverId
      const tokenSnap = await getDoc(doc(db, 'waiverTokens', token!));
      if (!tokenSnap.exists()) throw new Error('Token not found');
      const { organizationId: orgId, waiverId } = tokenSnap.data();

      // Update the waiver with signature data
      await updateDoc(doc(db, 'organizations', orgId, 'clientWaivers', waiverId), {
        status: 'signed',
        signer_name: signerName,
        answers,
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
          <h1 className="text-white text-xl font-bold">{waiver.template_title}</h1>
          <p className="text-primary-foreground/80 text-sm mt-1">Please read carefully and complete all required fields.</p>
        </div>

        <div className="p-6 space-y-6">
          {/* Blocks */}
          {waiver.template_blocks.map((block) => (
            <BlockRenderer
              key={block.id}
              block={block}
              answer={answers[block.id]}
              onAnswer={(v) => setAnswer(block.id, v)}
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
            />
            {errors['__name'] && <p className="text-xs text-destructive">{errors['__name']}</p>}
          </div>

          {/* Signature pad */}
          <div className="space-y-1.5">
            <Label className="font-medium">
              Signature <span className="text-destructive">*</span>
            </Label>
            <div className={`border-2 rounded-lg overflow-hidden ${errors['__sig'] ? 'border-destructive' : 'border-border'}`}>
              <SignatureCanvas
                ref={sigRef}
                penColor="#1e1e2e"
                canvasProps={{ className: 'w-full', style: { height: 140, background: '#fafafa', touchAction: 'none' } }}
                onEnd={() => setErrors((p) => { const n = { ...p }; delete n['__sig']; return n; })}
              />
            </div>
            <div className="flex justify-between items-center">
              {errors['__sig'] ? (
                <p className="text-xs text-destructive">{errors['__sig']}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Draw your signature above</p>
              )}
              <button
                type="button"
                onClick={() => sigRef.current?.clear()}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-3 w-3" /> Clear
              </button>
            </div>
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
  block, answer, onAnswer, error,
}: {
  block: WaiverBlock;
  answer: string | boolean | undefined;
  onAnswer: (v: string | boolean) => void;
  error?: string;
}) {
  if (block.type === 'text') {
    return (
      <div className="prose prose-sm max-w-none bg-muted/40 rounded-lg px-4 py-3 text-sm text-foreground whitespace-pre-wrap">
        {block.value}
      </div>
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

  return null;
}

// ── Centered screen wrapper ───────────────────────────────────
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-muted/30">
      <div className="flex flex-col items-center text-center max-w-sm">{children}</div>
    </div>
  );
}
