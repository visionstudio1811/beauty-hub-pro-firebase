import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, PenLine, Upload } from 'lucide-react';
import type { WaiverBlock } from '@/pages/WaiverForm';

interface Props {
  title: string;
  headline: string;
  subHeadline: string;
  blocks: WaiverBlock[];
}

export function TemplatePreviewModal({ title, headline, subHeadline, blocks }: Props) {
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});

  const setAnswer = (id: string, v: string | boolean) =>
    setAnswers((prev) => ({ ...prev, [id]: v }));

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Eye className="h-4 w-4" /> Preview
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Form Preview — {title}</DialogTitle>
          </DialogHeader>

          {/* Mimics the live WaiverForm layout */}
          <div className="min-h-full bg-muted/30">
            <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
              {/* Header */}
              <div className="bg-primary px-6 py-5">
                <h1 className="text-white text-xl font-bold">
                  {headline || title || 'Form Preview'}
                </h1>
                <p className="text-primary-foreground/80 text-sm mt-1 whitespace-pre-wrap">
                  {subHeadline || 'Please read carefully and complete all required fields.'}
                </p>
              </div>

              <div className="p-6 space-y-6">
                {blocks.map((block) => (
                  <PreviewBlock
                    key={block.id}
                    block={block}
                    answer={answers[block.id]}
                    onAnswer={(v) => setAnswer(block.id, v)}
                  />
                ))}

                {/* Footer note — not submittable */}
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 text-center">
                  This is a preview only — submissions are disabled.
                </div>

                <Button className="w-full" size="lg" disabled>
                  Submit & Sign
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Preview block renderer ─────────────────────────────────────
function PreviewBlock({
  block,
  answer,
  onAnswer,
}: {
  block: WaiverBlock;
  answer: string | boolean | undefined;
  onAnswer: (v: string | boolean) => void;
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
      <h3 className="text-base font-semibold text-foreground/90">{block.value}</h3>
    );
  }

  if (block.type === 'checkbox') {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
        <Checkbox
          id={`prev-${block.id}`}
          checked={answer === true}
          onCheckedChange={(c) => onAnswer(c === true)}
          className="mt-0.5"
        />
        <label htmlFor={`prev-${block.id}`} className="text-sm cursor-pointer leading-relaxed">
          {block.label}
          {block.required && <span className="text-destructive ml-1">*</span>}
        </label>
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
      </div>
    );
  }

  if (block.type === 'short_answer') {
    return (
      <div className="space-y-1.5">
        <Label className="font-medium">
          {block.label}
          {block.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          value={typeof answer === 'string' ? answer : ''}
          onChange={(e) => onAnswer(e.target.value)}
          placeholder="Your answer"
        />
      </div>
    );
  }

  if (block.type === 'email') {
    return (
      <div className="space-y-1.5">
        <Label className="font-medium">
          {block.label || 'Email'}
          {block.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          type="email"
          value={typeof answer === 'string' ? answer : ''}
          onChange={(e) => onAnswer(e.target.value)}
          placeholder="name@example.com"
        />
      </div>
    );
  }

  if (block.type === 'phone') {
    return (
      <div className="space-y-1.5">
        <Label className="font-medium">
          {block.label || 'Phone'}
          {block.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          type="tel"
          value={typeof answer === 'string' ? answer : ''}
          onChange={(e) => onAnswer(e.target.value)}
          placeholder="+1 555 123 4567"
        />
      </div>
    );
  }

  if (block.type === 'date') {
    return (
      <div className="space-y-1.5">
        <Label className="font-medium">
          {block.label || 'Date'}
          {block.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          type="date"
          value={typeof answer === 'string' ? answer : ''}
          onChange={(e) => onAnswer(e.target.value)}
        />
      </div>
    );
  }

  if (block.type === 'time') {
    return (
      <div className="space-y-1.5">
        <Label className="font-medium">
          {block.label || 'Time'}
          {block.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          type="time"
          value={typeof answer === 'string' ? answer : ''}
          onChange={(e) => onAnswer(e.target.value)}
        />
      </div>
    );
  }

  if (block.type === 'signature') {
    return (
      <div className="space-y-2">
        <Label className="font-medium">
          {block.label || 'Signature'}
          <span className="text-destructive ml-1">*</span>
        </Label>
        <div className="flex items-center justify-center gap-2 h-[100px] rounded-lg border-2 border-dashed border-border bg-muted/30 text-muted-foreground text-sm">
          <PenLine className="h-4 w-4" />
          Signature pad (interactive when sent to client)
        </div>
      </div>
    );
  }

  if (block.type === 'image_upload') {
    return (
      <div className="space-y-2">
        <Label className="font-medium">
          {block.label || 'Upload photo(s)'}
          {block.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <div className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-lg px-4 py-6 text-muted-foreground">
          <Upload className="h-5 w-5" />
          <span className="text-sm">Image upload (up to {block.maxImages ?? 5} photos)</span>
        </div>
      </div>
    );
  }

  return null;
}
