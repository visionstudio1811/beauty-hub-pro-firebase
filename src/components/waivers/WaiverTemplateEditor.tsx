
import React, { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { KeyboardSensor } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  GripVertical,
  Plus,
  Trash2,
  AlignLeft,
  CheckSquare,
  ToggleLeft,
  MessageSquare,
  FileText,
  Edit2,
  Check,
  X,
  Loader2,
  ImageUp,
  Mail,
  Phone,
  PenLine,
  Calendar,
  Clock as ClockIcon,
  Heading1,
  Heading2,
} from 'lucide-react';
import type { BlockType, WaiverBlock } from '@/pages/WaiverForm';

// ── Block meta ───────────────────────────────────────────────
// Presentational types store their content in `value` and never collect input.
const PRESENTATIONAL_TYPES: BlockType[] = ['text', 'heading', 'subheading'];
const isPresentational = (t: BlockType) => PRESENTATIONAL_TYPES.includes(t);

const BLOCK_TYPES: { type: BlockType; label: string; icon: React.ElementType; description: string }[] = [
  { type: 'heading',      label: 'Heading',              icon: Heading1,     description: 'A large section title' },
  { type: 'subheading',   label: 'Sub Heading',          icon: Heading2,     description: 'A smaller section label below a heading' },
  { type: 'text',         label: 'Text Block',           icon: AlignLeft,    description: 'A paragraph of informational or legal text' },
  { type: 'checkbox',     label: 'Checkbox Agreement',   icon: CheckSquare,  description: 'A statement the client must tick to agree' },
  { type: 'yes_no',       label: 'Yes / No Question',    icon: ToggleLeft,   description: 'A binary question (Yes or No)' },
  { type: 'short_answer', label: 'Short Answer',         icon: MessageSquare,description: 'A free-text question' },
  { type: 'email',        label: 'Email Address',        icon: Mail,         description: 'Collect an email (e.g. emergency contact)' },
  { type: 'phone',        label: 'Phone Number',         icon: Phone,        description: 'Collect a phone number' },
  { type: 'date',         label: 'Date',                 icon: Calendar,     description: 'Calendar date picker' },
  { type: 'time',         label: 'Time',                 icon: ClockIcon,    description: 'Time-of-day picker' },
  { type: 'signature',    label: 'Signature Pad',        icon: PenLine,      description: 'Client draws a signature (e.g. guardian or initial)' },
  { type: 'image_upload', label: 'Image Upload',         icon: ImageUp,      description: 'Client uploads photos (e.g. affected area)' },
];

const BADGE_COLORS: Record<BlockType, string> = {
  text:         'bg-blue-100 text-blue-700',
  heading:      'bg-slate-200 text-slate-800',
  subheading:   'bg-slate-100 text-slate-700',
  checkbox:     'bg-green-100 text-green-700',
  yes_no:       'bg-amber-100 text-amber-700',
  short_answer: 'bg-purple-100 text-purple-700',
  email:        'bg-sky-100 text-sky-700',
  phone:        'bg-teal-100 text-teal-700',
  date:         'bg-orange-100 text-orange-700',
  time:         'bg-yellow-100 text-yellow-700',
  signature:    'bg-indigo-100 text-indigo-700',
  image_upload: 'bg-pink-100 text-pink-700',
};

function newBlock(type: BlockType): WaiverBlock {
  const presentational = isPresentational(type);
  return {
    id:       crypto.randomUUID(),
    type,
    value:    presentational ? '' : undefined,
    label:    presentational ? undefined : '',
    required: !presentational,
    ...(type === 'image_upload' ? { maxImages: 5 } : {}),
  };
}

// ── Sortable block card ───────────────────────────────────────
function SortableBlock({
  block,
  onUpdate,
  onDelete,
}: {
  block: WaiverBlock;
  onUpdate: (b: WaiverBlock) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(block.value ?? block.label ?? '');
  const [required, setRequired] = useState(block.required ?? false);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const meta = BLOCK_TYPES.find((b) => b.type === block.type)!;
  const Icon = meta.icon;
  const preview = block.value ?? block.label ?? '';

  const saveEdit = () => {
    const updated: WaiverBlock = {
      ...block,
      ...(isPresentational(block.type) ? { value: draft } : { label: draft }),
      required,
    };
    onUpdate(updated);
    setEditing(false);
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-white border border-border rounded-lg p-3 flex gap-3 group">
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing mt-0.5"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${BADGE_COLORS[block.type]}`}>
            {meta.label}
          </span>
          {block.required && !isPresentational(block.type) && (
            <span className="text-xs text-muted-foreground">required</span>
          )}
        </div>

        {editing ? (
          <div className="space-y-2">
            {block.type === 'text' ? (
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="text-sm min-h-[80px]"
                placeholder="Enter the text content…"
                autoFocus
              />
            ) : (
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="text-sm"
                placeholder={
                  block.type === 'heading' ? 'e.g. Medical history'
                  : block.type === 'subheading' ? 'e.g. Past treatments'
                  : block.type === 'checkbox' ? 'Agreement statement…'
                  : block.type === 'image_upload' ? 'e.g. Upload photos of affected area'
                  : block.type === 'email' ? 'e.g. Emergency contact email'
                  : block.type === 'phone' ? 'e.g. Emergency contact phone'
                  : block.type === 'signature' ? 'e.g. Parent / guardian signature'
                  : 'Question text…'
                }
                autoFocus
              />
            )}
            {!isPresentational(block.type) && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                  className="h-3.5 w-3.5 rounded"
                />
                Required
              </label>
            )}
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={saveEdit}>
                <Check className="h-3.5 w-3.5 mr-1" /> Save
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" onClick={() => { setDraft(preview); setEditing(false); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <p className={`text-sm leading-relaxed truncate ${preview ? 'text-foreground' : 'text-muted-foreground italic'}`}>
            {preview || 'Click edit to add content…'}
          </p>
        )}
      </div>

      {/* Actions */}
      {!editing && (
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label="Edit block"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(block.id)}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            aria-label="Delete block"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Add block picker ──────────────────────────────────────────
function AddBlockPicker({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((p) => !p)} className="gap-1.5">
        <Plus className="h-4 w-4" /> Add Block
      </Button>
      {open && (
        <div className="absolute top-full mt-1 right-0 z-50 bg-popover border border-border rounded-lg shadow-lg p-1 w-64 max-h-96 overflow-y-auto">
          {BLOCK_TYPES.map(({ type, label, icon: Icon, description }) => (
            <button
              key={type}
              className="w-full flex items-start gap-3 px-3 py-2 rounded hover:bg-muted transition-colors text-left"
              onClick={() => { onAdd(type); setOpen(false); }}
            >
              <Icon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{label}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Template item in sidebar ──────────────────────────────────
type TemplateKind = 'waiver' | 'intake';
type TemplateRow = {
  id: string;
  title: string;
  headline: string;
  sub_headline: string;
  content: WaiverBlock[];
  updated_at: string;
  kind: TemplateKind;
};

const KIND_COPY: Record<TemplateKind, { title: string; newLabel: string; placeholder: string }> = {
  waiver: { title: 'Waiver', newLabel: 'New Waiver', placeholder: 'e.g. General Consent Waiver' },
  intake: { title: 'Intake Form', newLabel: 'New Intake Form', placeholder: 'e.g. New Client Intake Form' },
};

// ── Main editor ───────────────────────────────────────────────
export function WaiverTemplateEditor({ kind = 'waiver' }: { kind?: TemplateKind } = {}) {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const copy = KIND_COPY[kind];

  const [templates, setTemplates]       = useState<TemplateRow[]>([]);
  const [selected, setSelected]         = useState<TemplateRow | null>(null);
  const [title, setTitle]               = useState('');
  const [headline, setHeadline]         = useState('');
  const [subHeadline, setSubHeadline]   = useState('');
  const [blocks, setBlocks]             = useState<WaiverBlock[]>([]);
  const [loadingList, setLoadingList]   = useState(true);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyordinates }),
  );

  // Load templates
  const loadTemplates = useCallback(async () => {
    if (!currentOrganization) return;
    setLoadingList(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'waiverTemplates'),
          orderBy('updated_at', 'desc')
        )
      );
      const all = snap.docs.map(d => ({
        id: d.id,
        title: d.data().title ?? '',
        headline: d.data().headline ?? '',
        sub_headline: d.data().sub_headline ?? '',
        content: d.data().content ?? [],
        updated_at: d.data().updated_at ?? '',
        kind: (d.data().kind as TemplateKind) ?? 'waiver',
      }));
      setTemplates(all.filter(t => t.kind === kind));
    } catch (err) {
      console.error('Error loading templates:', err);
    } finally {
      setLoadingList(false);
    }
  }, [currentOrganization, kind]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const selectTemplate = (t: TemplateRow) => {
    setSelected(t);
    setTitle(t.title);
    setHeadline(t.headline ?? '');
    setSubHeadline(t.sub_headline ?? '');
    setBlocks(t.content ?? []);
  };

  const createNew = () => {
    setSelected(null);
    setTitle(copy.newLabel);
    setHeadline('');
    setSubHeadline('');
    setBlocks([]);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setBlocks((prev) => {
        const oldIdx = prev.findIndex((b) => b.id === active.id);
        const newIdx = prev.findIndex((b) => b.id === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  };

  const addBlock = (type: BlockType) => setBlocks((prev) => [...prev, newBlock(type)]);
  const updateBlock = (b: WaiverBlock) => setBlocks((prev) => prev.map((x) => x.id === b.id ? b : x));
  const deleteBlock = (id: string) => setBlocks((prev) => prev.filter((b) => b.id !== id));

  const save = async () => {
    if (!currentOrganization) return;
    if (!title.trim()) { toast({ title: 'Please enter a title', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const trimmedHeadline = headline.trim();
      const trimmedSubHeadline = subHeadline.trim();
      if (selected) {
        await updateDoc(
          doc(db, 'organizations', currentOrganization.id, 'waiverTemplates', selected.id),
          { title, headline: trimmedHeadline, sub_headline: trimmedSubHeadline, content: blocks, kind, updated_at: now, updated_at_ts: serverTimestamp() }
        );
      } else {
        const newRef = await addDoc(
          collection(db, 'organizations', currentOrganization.id, 'waiverTemplates'),
          { title, headline: trimmedHeadline, sub_headline: trimmedSubHeadline, content: blocks, kind, organization_id: currentOrganization.id, created_at: now, updated_at: now, created_at_ts: serverTimestamp() }
        );
        setSelected({ id: newRef.id, title, headline: trimmedHeadline, sub_headline: trimmedSubHeadline, content: blocks, updated_at: now, kind });
      }
      toast({ title: `${copy.title} template saved` });
      await loadTemplates();
    } catch (err: unknown) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async () => {
    if (!selected || !currentOrganization) return;
    if (!window.confirm(`Delete "${selected.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'organizations', currentOrganization.id, 'waiverTemplates', selected.id));
      toast({ title: 'Template deleted' });
      setSelected(null); setTitle(''); setHeadline(''); setSubHeadline(''); setBlocks([]);
      await loadTemplates();
    } catch (err: unknown) {
      toast({ title: 'Delete failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex gap-4 min-h-[520px]">
      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 flex flex-col gap-2">
        <Button size="sm" className="w-full gap-1.5" onClick={createNew}>
          <Plus className="h-4 w-4" /> New {copy.title}
        </Button>
        <div className="flex-1 space-y-1 overflow-y-auto">
          {loadingList ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No templates yet.</p>
          ) : templates.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTemplate(t)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors truncate flex items-center gap-2 ${
                selected?.id === t.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-foreground'
              }`}
            >
              <FileText className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{t.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {selected === null && blocks.length === 0 && title === '' ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-3 border-2 border-dashed border-border rounded-xl p-10">
            <FileText className="h-10 w-10" />
            <p className="text-sm">Select a template from the list or create a new one.</p>
          </div>
        ) : (
          <>
            {/* Title */}
            <div className="space-y-1">
              <Label htmlFor="tpl-title" className="font-medium">Template Title</Label>
              <Input
                id="tpl-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={copy.placeholder}
              />
              <p className="text-xs text-muted-foreground">Internal name shown in the templates list.</p>
            </div>

            {/* Headline + Sub-headline (shown to clients on the form) */}
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="space-y-1">
                <Label htmlFor="tpl-headline" className="font-medium">Headline</Label>
                <Input
                  id="tpl-headline"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder={kind === 'intake' ? 'e.g. Welcome — let’s get to know you' : 'e.g. Consent & Treatment Waiver'}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tpl-subheadline" className="font-medium">Sub Headline</Label>
                <Textarea
                  id="tpl-subheadline"
                  value={subHeadline}
                  onChange={(e) => setSubHeadline(e.target.value)}
                  placeholder="e.g. Please read carefully and complete all required fields."
                  className="min-h-[60px]"
                />
              </div>
              <p className="text-xs text-muted-foreground">Shown at the top of the form your clients see. Falls back to the template title if left blank.</p>
            </div>

            {/* Blocks */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-medium">Form Blocks</Label>
                <AddBlockPicker onAdd={addBlock} />
              </div>

              {blocks.length === 0 ? (
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
                  Add your first block using the "Add Block" button above.
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {blocks.map((block) => (
                        <SortableBlock
                          key={block.id}
                          block={block}
                          onUpdate={updateBlock}
                          onDelete={deleteBlock}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              {selected ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={deleteTemplate}
                  disabled={deleting}
                  className="text-destructive hover:text-destructive gap-1.5"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete Template
                </Button>
              ) : <div />}
              <Button onClick={save} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save Template
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// dnd-kit keyboard helper alias
const sortableKeyordinates = sortableKeyboardCoordinates;
