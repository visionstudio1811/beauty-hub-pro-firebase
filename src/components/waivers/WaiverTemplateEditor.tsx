
import React, { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  type UniqueIdentifier,
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
import { httpsCallable } from 'firebase/functions';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { db, functions } from '@/lib/firebase';
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
  Package as PackageIcon,
  DollarSign,
  Hash,
  CalendarCheck,
  CalendarX,
  MapPin,
  Megaphone,
} from 'lucide-react';
import type { BlockType, WaiverBlock } from '@/pages/WaiverForm';
import { PURCHASE_BLOCK_TYPES } from '@/pages/WaiverForm';
import { TemplatePreviewModal } from './TemplatePreviewModal';

// ── Block meta ───────────────────────────────────────────────
// Presentational types store their content in `value` and never collect input.
// Purchase types are read-only and prefilled from the linked purchase snapshot.
const PRESENTATIONAL_TYPES: BlockType[] = ['text', 'heading', 'subheading'];
const isPresentational = (t: BlockType) => PRESENTATIONAL_TYPES.includes(t);
const isPurchaseBlock = (t: BlockType) => PURCHASE_BLOCK_TYPES.includes(t);

// Label matchers for the personal-info quick-add, applied to the lower-cased
// block label. Byte-for-byte the same predicates as
// functions/src/addStandardFieldsToTemplates.ts so quick-add and "Apply to all"
// detect exactly the same English and Hebrew labels.
//
// English predicates are the historical ones ("average age of children" is
// NOT an age field). Hebrew: the bare word, optionally with the definite
// article ("הגיל"), a possessive suffix ("גילך") and trailing punctuation
// ("גיל:"), anchored as a whole word so "גילוי" (disclosure) never counts as
// an age field. "מין" only matches on its own (it also means "type/kind", as in
// "מין הטיפול"), and bare "הפניה" / "המלצה" are intentionally NOT matched
// (they appear in unrelated medical labels like "הפניה מרופא").
function isAgeLabel(l: string): boolean {
  if (l === 'age' || l.endsWith(' age') || l.startsWith('age ')) return true;
  return /(^|\s)ה?גיל(ך|כם|כן)?(?=$|\s|[:?*.])/.test(l);
}

function isGenderLabel(l: string): boolean {
  if (l.includes('gender') || l === 'sex') return true;
  return /(^|\s)ה?מגדר(?=$|\s|[:?*.])|^מין[:?*.]?$/.test(l);
}

function isReferralLabel(l: string): boolean {
  if (
    l.includes('how did you hear') || l.includes('referral') ||
    l.includes('find us') || l.includes('hear about us')
  ) return true;
  return /איך שמעת|שמעת עלינו|שמעתם עלינו|הגעת אלינו|הגעתם אלינו|איך הגעת|מקור ה?הפניה|מקור ה?פנייה/.test(l);
}

// Labels + descriptions live in the `waivers` namespace under
// waiverTemplateEditor.blockTypes.<type>.{label,description}.
const BLOCK_TYPES: { type: BlockType; icon: React.ElementType }[] = [
  { type: 'heading',          icon: Heading1 },
  { type: 'subheading',       icon: Heading2 },
  { type: 'text',             icon: AlignLeft },
  { type: 'checkbox',         icon: CheckSquare },
  { type: 'yes_no',           icon: ToggleLeft },
  { type: 'short_answer',     icon: MessageSquare },
  { type: 'email',            icon: Mail },
  { type: 'phone',            icon: Phone },
  { type: 'date',             icon: Calendar },
  { type: 'time',             icon: ClockIcon },
  { type: 'city',             icon: MapPin },
  { type: 'referral_source',  icon: Megaphone },
  { type: 'signature',        icon: PenLine },
  { type: 'image_upload',     icon: ImageUp },
  { type: 'package_name',     icon: PackageIcon },
  { type: 'package_price',    icon: DollarSign },
  { type: 'package_sessions', icon: Hash },
  { type: 'purchase_date',    icon: CalendarCheck },
  { type: 'expiry_date',      icon: CalendarX },
];

const blockTypeLabel = (type: BlockType) => i18n.t(`waivers:waiverTemplateEditor.blockTypes.${type}.label`);
const blockTypeDescription = (type: BlockType) => i18n.t(`waivers:waiverTemplateEditor.blockTypes.${type}.description`);

const BADGE_COLORS: Record<BlockType, string> = {
  text:             'bg-blue-100 text-blue-700',
  heading:          'bg-slate-200 text-slate-800',
  subheading:       'bg-slate-100 text-slate-700',
  checkbox:         'bg-green-100 text-green-700',
  yes_no:           'bg-amber-100 text-amber-700',
  short_answer:     'bg-purple-100 text-purple-700',
  email:            'bg-sky-100 text-sky-700',
  phone:            'bg-teal-100 text-teal-700',
  date:             'bg-orange-100 text-orange-700',
  time:             'bg-yellow-100 text-yellow-700',
  city:             'bg-rose-100 text-rose-700',
  referral_source:  'bg-fuchsia-100 text-fuchsia-700',
  signature:        'bg-indigo-100 text-indigo-700',
  image_upload:     'bg-pink-100 text-pink-700',
  package_name:     'bg-emerald-100 text-emerald-700',
  package_price:    'bg-emerald-100 text-emerald-700',
  package_sessions: 'bg-emerald-100 text-emerald-700',
  purchase_date:    'bg-emerald-100 text-emerald-700',
  expiry_date:      'bg-emerald-100 text-emerald-700',
};

/**
 * New block with the historical default shape. Purchase blocks are persisted
 * with a default label (as they always were); `labelLang` picks the language
 * of that client-facing label — callers pass the org language, falling back to
 * the UI language. (WaiverForm still falls back to `waiverForm:purchaseLabels`
 * if a template ever has an empty purchase label.)
 */
function newBlock(type: BlockType, labelLang: string = i18n.language): WaiverBlock {
  const presentational = isPresentational(type);
  const purchase = isPurchaseBlock(type);
  return {
    id:       crypto.randomUUID(),
    type,
    value:    presentational ? '' : undefined,
    label:    presentational ? undefined : (purchase ? defaultPurchaseLabel(type, labelLang) : ''),
    required: !presentational && !purchase,
    ...(type === 'image_upload' ? { maxImages: 5 } : {}),
  };
}

/** Default label for purchase blocks; UI language unless `lang` is given. */
function defaultPurchaseLabel(type: BlockType, lang?: string): string {
  switch (type) {
    case 'package_name':
    case 'package_price':
    case 'package_sessions':
    case 'purchase_date':
    case 'expiry_date':
      return i18n.t(`waivers:waiverTemplateEditor.purchaseDefaults.${type}`, lang ? { lng: lang } : undefined);
    default: return '';
  }
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
  const { t } = useTranslation('waivers');
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
  // Purchase blocks with no custom label are localised on the signing form;
  // show the UI-language default here so the card doesn't read as "empty".
  const previewHint = !preview && isPurchaseBlock(block.type)
    ? t('waiverTemplateEditor.block.purchaseDefaultPreview', { label: defaultPurchaseLabel(block.type) })
    : '';

  const saveEdit = () => {
    const updated: WaiverBlock = {
      ...block,
      ...(isPresentational(block.type) ? { value: draft } : { label: draft }),
      required,
    };
    onUpdate(updated);
    setEditing(false);
  };

  const editPlaceholder =
    block.type === 'heading' ? t('waiverTemplateEditor.block.placeholders.heading')
    : block.type === 'subheading' ? t('waiverTemplateEditor.block.placeholders.subheading')
    : block.type === 'checkbox' ? t('waiverTemplateEditor.block.placeholders.checkbox')
    : block.type === 'image_upload' ? t('waiverTemplateEditor.block.placeholders.image_upload')
    : block.type === 'email' ? t('waiverTemplateEditor.block.placeholders.email')
    : block.type === 'phone' ? t('waiverTemplateEditor.block.placeholders.phone')
    : block.type === 'signature' ? t('waiverTemplateEditor.block.placeholders.signature')
    : isPurchaseBlock(block.type) ? t('waiverTemplateEditor.block.placeholders.purchase', { label: defaultPurchaseLabel(block.type) })
    : t('waiverTemplateEditor.block.placeholders.question');

  return (
    <div ref={setNodeRef} style={style} className="bg-white border border-border rounded-lg p-3 flex gap-3 group">
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing mt-0.5"
        aria-label={t('waiverTemplateEditor.block.dragToReorder')}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${BADGE_COLORS[block.type]}`}>
            {blockTypeLabel(block.type)}
          </span>
          {block.required && !isPresentational(block.type) && (
            <span className="text-xs text-muted-foreground">{t('waiverTemplateEditor.block.requiredTag')}</span>
          )}
        </div>

        {editing ? (
          <div className="space-y-2">
            {block.type === 'text' ? (
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="text-sm min-h-[80px]"
                placeholder={t('waiverTemplateEditor.block.textPlaceholder')}
                autoFocus
              />
            ) : (
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="text-sm"
                placeholder={editPlaceholder}
                autoFocus
              />
            )}
            {!isPresentational(block.type) && !isPurchaseBlock(block.type) && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                  className="h-3.5 w-3.5 rounded"
                />
                {t('waiverTemplateEditor.block.requiredLabel')}
              </label>
            )}
            {isPurchaseBlock(block.type) && (
              <p className="text-xs text-muted-foreground">
                {t('waiverTemplateEditor.block.purchaseHint')}
              </p>
            )}
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={saveEdit}>
                <Check className="h-3.5 w-3.5 me-1" /> {t('common:actions.save')}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" onClick={() => { setDraft(preview); setEditing(false); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <p className={`text-sm leading-relaxed truncate ${preview ? 'text-foreground' : 'text-muted-foreground italic'}`}>
            {preview || previewHint || t('waiverTemplateEditor.block.emptyPreview')}
          </p>
        )}
      </div>

      {/* Actions */}
      {!editing && (
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label={t('waiverTemplateEditor.block.editBlock')}
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(block.id)}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            aria-label={t('waiverTemplateEditor.block.deleteBlock')}
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
  const { t } = useTranslation('waivers');
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((p) => !p)} className="gap-1.5">
        <Plus className="h-4 w-4" /> {t('waiverTemplateEditor.addBlock')}
      </Button>
      {open && (
        <div className="absolute top-full mt-1 end-0 z-50 bg-popover border border-border rounded-lg shadow-lg p-1 w-64 max-h-96 overflow-y-auto">
          {BLOCK_TYPES.map(({ type, icon: Icon }) => (
            <button
              key={type}
              className="w-full flex items-start gap-3 px-3 py-2 rounded hover:bg-muted transition-colors text-start"
              onClick={() => { onAdd(type); setOpen(false); }}
            >
              <Icon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{blockTypeLabel(type)}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{blockTypeDescription(type)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Template item in sidebar ──────────────────────────────────
type TemplateKind = 'waiver' | 'intake' | 'agreement';
type TemplateRow = {
  id: string;
  title: string;
  headline: string;
  sub_headline: string;
  content: WaiverBlock[];
  updated_at: string;
  kind: TemplateKind;
};

// ── Main editor ───────────────────────────────────────────────
export function WaiverTemplateEditor({ kind = 'waiver' }: { kind?: TemplateKind } = {}) {
  const { t } = useTranslation('waivers');
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const copy = {
    title: t(`waiverTemplateEditor.kinds.${kind}.title`),
    newLabel: t(`waiverTemplateEditor.kinds.${kind}.newLabel`),
    placeholder: t(`waiverTemplateEditor.kinds.${kind}.placeholder`),
  };

  const [templates, setTemplates]       = useState<TemplateRow[]>([]);
  const [selected, setSelected]         = useState<TemplateRow | null>(null);
  const [title, setTitle]               = useState('');
  const [headline, setHeadline]         = useState('');
  const [subHeadline, setSubHeadline]   = useState('');
  const [blocks, setBlocks]             = useState<WaiverBlock[]>([]);
  const [loadingList, setLoadingList]   = useState(true);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [batchAdding, setBatchAdding]   = useState(false);

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
      setTemplates(all.filter(tpl => tpl.kind === kind));
    } catch (err) {
      console.error('Error loading templates:', err);
    } finally {
      setLoadingList(false);
    }
  }, [currentOrganization, kind]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const selectTemplate = (tpl: TemplateRow) => {
    setSelected(tpl);
    setTitle(tpl.title);
    setHeadline(tpl.headline ?? '');
    setSubHeadline(tpl.sub_headline ?? '');
    setBlocks(tpl.content ?? []);
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

  // Screen-reader copy for the sortable list. dnd-kit ships English defaults
  // ("To pick up a draggable item, press the space bar…"), so we supply the
  // instructions + live announcements in the UI language.
  const dndBlockName = (id: UniqueIdentifier) => {
    const b = blocks.find((x) => x.id === id);
    if (!b) return String(id);
    return (b.value ?? b.label ?? '').trim() || blockTypeLabel(b.type);
  };
  const dndPosition = (id: UniqueIdentifier) => blocks.findIndex((x) => x.id === id) + 1;
  const dndAccessibility: React.ComponentProps<typeof DndContext>['accessibility'] = {
    screenReaderInstructions: { draggable: t('waiverTemplateEditor.dnd.instructions') },
    announcements: {
      onDragStart: ({ active }) =>
        t('waiverTemplateEditor.dnd.dragStart', {
          item: dndBlockName(active.id), position: dndPosition(active.id), total: blocks.length,
        }),
      onDragOver: ({ active, over }) =>
        over
          ? t('waiverTemplateEditor.dnd.dragOver', {
              item: dndBlockName(active.id), position: dndPosition(over.id), total: blocks.length,
            })
          : t('waiverTemplateEditor.dnd.dragOverNone', { item: dndBlockName(active.id) }),
      onDragEnd: ({ active, over }) =>
        over
          ? t('waiverTemplateEditor.dnd.dragEnd', {
              item: dndBlockName(active.id), position: dndPosition(over.id), total: blocks.length,
            })
          : t('waiverTemplateEditor.dnd.dragEndNone', { item: dndBlockName(active.id) }),
      onDragCancel: ({ active }) =>
        t('waiverTemplateEditor.dnd.dragCancel', { item: dndBlockName(active.id) }),
    },
  };

  // Client-facing default labels (purchase blocks) follow the org language.
  const addBlock = (type: BlockType) =>
    setBlocks((prev) => [...prev, newBlock(type, currentOrganization?.language ?? i18n.language)]);
  const updateBlock = (b: WaiverBlock) => setBlocks((prev) => prev.map((x) => x.id === b.id ? b : x));
  const deleteBlock = (id: string) => setBlocks((prev) => prev.filter((b) => b.id !== id));

  // Quick-adds the three personal-info questions our backfill code recognises.
  // Skips any that already exist on the template (matched loosely by label).
  // Labels are client-facing, so they follow the org language (falling back to
  // the UI language) and come from the `intake-fields` namespace, which holds
  // exactly the strings seeded by the addStandardFieldsToTemplates Cloud
  // Function ('Age' / 'גיל', 'Gender' / 'מגדר', ...). The dedup matchers are the
  // same predicates the CF uses, so a template seeded in Hebrew is recognised
  // and never gets English duplicates appended.
  const addPersonalInfoBlocks = () => {
    const labelLang = currentOrganization?.language ?? i18n.language;
    const tl = i18n.getFixedT(labelLang, 'intake-fields');
    const has = (test: (lbl: string) => boolean) =>
      blocks.some((b) => test((b.label ?? '').toLowerCase()));
    const toAdd: WaiverBlock[] = [];
    if (!has(isAgeLabel)) {
      toAdd.push({ ...newBlock('short_answer'), label: tl('standardFields.age'), required: false });
    }
    if (!has(isGenderLabel)) {
      toAdd.push({ ...newBlock('short_answer'), label: tl('standardFields.gender'), required: false });
    }
    if (!has(isReferralLabel)) {
      toAdd.push({ ...newBlock('short_answer'), label: tl('standardFields.referral'), required: false });
    }
    if (toAdd.length === 0) {
      toast({ title: t('waiverTemplateEditor.toasts.alreadyPresent'), description: t('waiverTemplateEditor.toasts.alreadyPresentDescription') });
      return;
    }
    setBlocks((prev) => [...prev, ...toAdd]);
    toast({ title: t('waiverTemplateEditor.toasts.added'), description: t('waiverTemplateEditor.toasts.addedDescription', { count: toAdd.length }) });
  };

  const save = async () => {
    if (!currentOrganization) return;
    if (!title.trim()) { toast({ title: t('waiverTemplateEditor.toasts.titleRequired'), variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const trimmedHeadline = headline.trim();
      const trimmedSubHeadline = subHeadline.trim();
      // Firestore rejects undefined field values — strip them from every block
      const sanitizedBlocks = JSON.parse(JSON.stringify(blocks));
      if (selected) {
        await updateDoc(
          doc(db, 'organizations', currentOrganization.id, 'waiverTemplates', selected.id),
          { title, headline: trimmedHeadline, sub_headline: trimmedSubHeadline, content: sanitizedBlocks, kind, updated_at: now, updated_at_ts: serverTimestamp() }
        );
      } else {
        const newRef = await addDoc(
          collection(db, 'organizations', currentOrganization.id, 'waiverTemplates'),
          { title, headline: trimmedHeadline, sub_headline: trimmedSubHeadline, content: sanitizedBlocks, kind, organization_id: currentOrganization.id, created_at: now, updated_at: now, created_at_ts: serverTimestamp() }
        );
        setSelected({ id: newRef.id, title, headline: trimmedHeadline, sub_headline: trimmedSubHeadline, content: blocks, updated_at: now, kind });
      }
      toast({ title: t('waiverTemplateEditor.toasts.saved', { kind: copy.title }) });
      await loadTemplates();
    } catch (err: unknown) {
      toast({ title: t('waiverTemplateEditor.toasts.saveFailed'), description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const addStandardFieldsToAll = async () => {
    if (!currentOrganization) return;
    setBatchAdding(true);
    try {
      const call = httpsCallable<
        { organizationId: string; kinds: string[] },
        {
          templatesProcessed: number;
          templatesUpdated: number;
          summary: Array<{ id: string; title: string; kind: string; added: string[] }>;
        }
      >(functions, 'addStandardFieldsToTemplates');
      const res = await call({ organizationId: currentOrganization.id, kinds: [kind] });
      const { templatesProcessed, templatesUpdated, summary } = res.data;

      const totalAdded = summary.reduce((sum, s) => sum + s.added.length, 0);
      toast({
        title: templatesUpdated === 0
          ? t('waiverTemplateEditor.toasts.nothingToAdd')
          : t('waiverTemplateEditor.toasts.updatedCount', { updated: templatesUpdated, processed: templatesProcessed, kind: copy.title }),
        description: totalAdded === 0
          ? t('waiverTemplateEditor.toasts.allHaveFields')
          : t('waiverTemplateEditor.toasts.addedAcross', { count: totalAdded, kind: copy.title }),
      });
      await loadTemplates();
      if (selected) {
        const refreshed = await getDocs(query(collection(db, 'organizations', currentOrganization.id, 'waiverTemplates'), orderBy('updated_at_ts', 'desc')));
        const updated = refreshed.docs.find(d => d.id === selected.id);
        if (updated) setBlocks(updated.data().content ?? []);
      }
    } catch (err: unknown) {
      toast({
        title: t('waiverTemplateEditor.toasts.migrationFailed'),
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBatchAdding(false);
    }
  };

  const deleteTemplate = async () => {
    if (!selected || !currentOrganization) return;
    if (!window.confirm(t('waiverTemplateEditor.confirmDelete', { title: selected.title }))) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'organizations', currentOrganization.id, 'waiverTemplates', selected.id));
      toast({ title: t('waiverTemplateEditor.toasts.templateDeleted') });
      setSelected(null); setTitle(''); setHeadline(''); setSubHeadline(''); setBlocks([]);
      await loadTemplates();
    } catch (err: unknown) {
      toast({ title: t('waiverTemplateEditor.toasts.deleteFailed'), description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex gap-4 min-h-[520px]">
      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 flex flex-col gap-2">
        <Button size="sm" className="w-full gap-1.5" onClick={createNew}>
          <Plus className="h-4 w-4" /> {t('waiverTemplateEditor.newKind', { kind: copy.title })}
        </Button>
        {(kind === 'agreement' || kind === 'intake') && templates.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-1.5"
            onClick={addStandardFieldsToAll}
            disabled={batchAdding}
            title={t('waiverTemplateEditor.applyToAllTitle')}
          >
            {batchAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t('waiverTemplateEditor.applyToAll')}
          </Button>
        )}
        <div className="flex-1 space-y-1 overflow-y-auto">
          {loadingList ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">{t('waiverTemplateEditor.noTemplates')}</p>
          ) : templates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => selectTemplate(tpl)}
              className={`w-full text-start px-3 py-2 rounded-lg text-sm transition-colors truncate flex items-center gap-2 ${
                selected?.id === tpl.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-foreground'
              }`}
            >
              <FileText className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{tpl.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {selected === null && blocks.length === 0 && title === '' ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-3 border-2 border-dashed border-border rounded-xl p-10">
            <FileText className="h-10 w-10" />
            <p className="text-sm">{t('waiverTemplateEditor.selectPrompt')}</p>
          </div>
        ) : (
          <>
            {/* Title */}
            <div className="space-y-1">
              <Label htmlFor="tpl-title" className="font-medium">{t('waiverTemplateEditor.templateTitle')}</Label>
              <Input
                id="tpl-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={copy.placeholder}
              />
              <p className="text-xs text-muted-foreground">{t('waiverTemplateEditor.templateTitleHint')}</p>
            </div>

            {/* Headline + Sub-headline (shown to clients on the form) */}
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="space-y-1">
                <Label htmlFor="tpl-headline" className="font-medium">{t('waiverTemplateEditor.headline')}</Label>
                <Input
                  id="tpl-headline"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder={kind === 'intake' ? t('waiverTemplateEditor.headlinePlaceholderIntake') : t('waiverTemplateEditor.headlinePlaceholder')}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tpl-subheadline" className="font-medium">{t('waiverTemplateEditor.subHeadline')}</Label>
                <Textarea
                  id="tpl-subheadline"
                  value={subHeadline}
                  onChange={(e) => setSubHeadline(e.target.value)}
                  placeholder={t('waiverTemplateEditor.subHeadlinePlaceholder')}
                  className="min-h-[60px]"
                />
              </div>
              <p className="text-xs text-muted-foreground">{t('waiverTemplateEditor.headlineHint')}</p>
            </div>

            {/* Blocks */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-medium">{t('waiverTemplateEditor.formBlocks')}</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addPersonalInfoBlocks}
                    className="gap-1.5"
                    title={t('waiverTemplateEditor.personalInfoTitle')}
                  >
                    <Plus className="h-4 w-4" /> {t('waiverTemplateEditor.personalInfo')}
                  </Button>
                  <AddBlockPicker onAdd={addBlock} />
                </div>
              </div>

              {blocks.length === 0 ? (
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
                  {t('waiverTemplateEditor.noBlocks')}
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                  accessibility={dndAccessibility}
                >
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
                  {t('waiverTemplateEditor.deleteTemplate')}
                </Button>
              ) : <div />}
              <div className="flex items-center gap-2">
                <TemplatePreviewModal
                  title={title}
                  headline={headline}
                  subHeadline={subHeadline}
                  blocks={blocks}
                />
                <Button onClick={save} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {t('waiverTemplateEditor.saveTemplate')}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// dnd-kit keyboard helper alias
const sortableKeyordinates = sortableKeyboardCoordinates;
