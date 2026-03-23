
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
} from 'lucide-react';
import type { BlockType, WaiverBlock } from '@/pages/WaiverForm';

// ── Block meta ───────────────────────────────────────────────
const BLOCK_TYPES: { type: BlockType; label: string; icon: React.ElementType; description: string }[] = [
  { type: 'text',         label: 'Text Block',           icon: AlignLeft,    description: 'A paragraph of informational or legal text' },
  { type: 'checkbox',     label: 'Checkbox Agreement',   icon: CheckSquare,  description: 'A statement the client must tick to agree' },
  { type: 'yes_no',       label: 'Yes / No Question',    icon: ToggleLeft,   description: 'A binary question (Yes or No)' },
  { type: 'short_answer', label: 'Short Answer',         icon: MessageSquare,description: 'A free-text question' },
];

const BADGE_COLORS: Record<BlockType, string> = {
  text:         'bg-blue-100 text-blue-700',
  checkbox:     'bg-green-100 text-green-700',
  yes_no:       'bg-amber-100 text-amber-700',
  short_answer: 'bg-purple-100 text-purple-700',
};

function newBlock(type: BlockType): WaiverBlock {
  return {
    id:       crypto.randomUUID(),
    type,
    value:    type === 'text' ? '' : undefined,
    label:    type !== 'text' ? '' : undefined,
    required: type !== 'text',
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
      ...(block.type === 'text' ? { value: draft } : { label: draft }),
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
          {block.required && block.type !== 'text' && (
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
                placeholder={block.type === 'checkbox' ? 'Agreement statement…' : 'Question text…'}
                autoFocus
              />
            )}
            {block.type !== 'text' && (
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
        <div className="absolute top-full mt-1 left-0 z-50 bg-popover border border-border rounded-lg shadow-lg p-1 w-64">
          {BLOCK_TYPES.map(({ type, label, icon: Icon, description }) => (
            <button
              key={type}
              className="w-full flex items-start gap-3 px-3 py-2 rounded hover:bg-muted transition-colors text-left"
              onClick={() => { onAdd(type); setOpen(false); }}
            >
              <Icon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Template item in sidebar ──────────────────────────────────
type TemplateRow = { id: string; title: string; content: WaiverBlock[]; updated_at: string };

// ── Main editor ───────────────────────────────────────────────
export function WaiverTemplateEditor() {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();

  const [templates, setTemplates]       = useState<TemplateRow[]>([]);
  const [selected, setSelected]         = useState<TemplateRow | null>(null);
  const [title, setTitle]               = useState('');
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
      setTemplates(snap.docs.map(d => ({
        id: d.id,
        title: d.data().title ?? '',
        content: d.data().content ?? [],
        updated_at: d.data().updated_at ?? '',
      })));
    } catch (err) {
      console.error('Error loading waiver templates:', err);
    } finally {
      setLoadingList(false);
    }
  }, [currentOrganization]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const selectTemplate = (t: TemplateRow) => {
    setSelected(t);
    setTitle(t.title);
    setBlocks(t.content ?? []);
  };

  const createNew = () => {
    setSelected(null);
    setTitle('New Waiver');
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
      if (selected) {
        await updateDoc(
          doc(db, 'organizations', currentOrganization.id, 'waiverTemplates', selected.id),
          { title, content: blocks, updated_at: now, updated_at_ts: serverTimestamp() }
        );
      } else {
        const newRef = await addDoc(
          collection(db, 'organizations', currentOrganization.id, 'waiverTemplates'),
          { title, content: blocks, organization_id: currentOrganization.id, created_at: now, updated_at: now, created_at_ts: serverTimestamp() }
        );
        setSelected({ id: newRef.id, title, content: blocks, updated_at: now });
      }
      toast({ title: 'Waiver template saved' });
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
      setSelected(null); setTitle(''); setBlocks([]);
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
          <Plus className="h-4 w-4" /> New Template
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
                placeholder="e.g. General Consent Waiver"
              />
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
