
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Edit, Trash, Settings, Clock, Image as ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseTreatments, Treatment, TreatmentAvailabilityWindow } from '@/hooks/useSupabaseTreatments';
import { useSupabaseProfiles } from '@/hooks/useSupabaseProfiles';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/i18n/LanguageProvider';

interface CategoryOption {
  id: string;
  name: string;
}

const PRESET_COLORS = [
  '#FFD700', // warm yellow
  '#10B981', // signature green
  '#F472B6', // blush
  '#60A5FA', // sky
  '#C084FC', // lavender
  '#FB923C', // orange
  '#14B8A6', // teal
  '#F43F5E', // rose
];

// Mon-first ordering (matches the businessHours + scheduling utility convention).
const SCHED_DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const SCHED_DAY_SHORT_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

interface DayRow {
  enabled: boolean;
  start_time: string;
  end_time: string;
}

const defaultDayRow = (): DayRow => ({ enabled: true, start_time: '10:00', end_time: '18:00' });

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const deleteImageQuietly = async (path: string) => {
  try {
    await deleteObject(storageRef(storage, path));
  } catch {
    /* already gone, or no permission: nothing to clean up */
  }
};

const availabilityToRows = (availability: TreatmentAvailabilityWindow[] | undefined): DayRow[] => {
  // Returns 7 rows (Mon..Sun). Days not present in `availability` start as
  // enabled=false (= closed for this treatment in strict mode).
  const rows: DayRow[] = Array.from({ length: 7 }, () => ({
    enabled: false,
    start_time: '10:00',
    end_time: '18:00',
  }));
  for (const a of availability ?? []) {
    if (a.day_of_week < 0 || a.day_of_week > 6) continue;
    rows[a.day_of_week] = {
      enabled: a.is_active,
      start_time: a.start_time,
      end_time: a.end_time,
    };
  }
  return rows;
};

const rowsToAvailability = (rows: DayRow[]): TreatmentAvailabilityWindow[] =>
  rows.map((row, dow) => ({
    day_of_week: dow,
    start_time: row.start_time,
    end_time: row.end_time,
    is_active: row.enabled,
  }));

export const TreatmentManagement: React.FC = () => {
  const { t } = useTranslation('scheduling');
  const { locale } = useLanguage();
  const formatPrice = (n: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(n);
  const { treatments, loading, addTreatment, updateTreatment } = useSupabaseTreatments();
  const { currentOrganization } = useOrganization();
  const { profiles } = useSupabaseProfiles();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTreatment, setEditingTreatment] = useState<Treatment | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    member_price: '',
    duration: '',
    description: '',
    image_url: null as string | null,
    image_storage_path: null as string | null,
    category: '',
    color: '',
    staff_ids: [] as string[],
    // Per-treatment scheduling fields. Empty / "limit" toggles off = inherit
    // org defaults (preserves pre-Phase-2 behavior).
    buffer_before_minutes: '',
    buffer_after_minutes: '',
    advance_min_hours: '',
    advance_max_days: '',
    limit_availability: false,                                  // master toggle
    day_rows: Array.from({ length: 7 }, defaultDayRow) as DayRow[],
  });
  const { toast } = useToast();
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // The photo already saved on the treatment being edited. Any other path in
  // formData is an upload from this dialog session that must be cleaned up
  // if the dialog closes without saving.
  const savedImagePath = editingTreatment?.image_storage_path ?? null;

  // Staff who can perform treatments — staff/admin/beautician roles.
  const eligibleStaff = profiles.filter(
    p => p.is_active && (p.role === 'staff' || p.role === 'admin' || p.role === 'beautician')
  );

  useEffect(() => {
    if (!currentOrganization?.id) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'organizations', currentOrganization.id, 'productCategories'),
            where('is_active', '==', true),
            orderBy('sort_order'),
          ),
        );
        const list: CategoryOption[] = [];
        snap.docs.forEach(d => {
          const data = d.data();
          const appliesTo: string[] = Array.isArray(data.applies_to) ? data.applies_to : ['product'];
          if (!appliesTo.includes('treatment')) return;
          list.push({ id: d.id, name: data.name || '' });
        });
        setCategories(list);
      } catch (err) {
        console.error('Failed to load categories', err);
      }
    })();
  }, [currentOrganization?.id, isDialogOpen]);

  const resetForm = () => {
    setFormData({
      name: '', price: '', member_price: '', duration: '', description: '', category: '', color: '',
      image_url: null, image_storage_path: null,
      staff_ids: [],
      buffer_before_minutes: '', buffer_after_minutes: '',
      advance_min_hours: '', advance_max_days: '',
      limit_availability: false,
      day_rows: Array.from({ length: 7 }, defaultDayRow),
    });
    setEditingTreatment(null);
  };

  const openAddDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (treatment: Treatment) => {
    setEditingTreatment(treatment);
    setFormData({
      name: treatment.name,
      price: treatment.price?.toString() || '',
      member_price: typeof treatment.member_price === 'number' ? treatment.member_price.toString() : '',
      duration: treatment.duration.toString(),
      description: treatment.description || '',
      image_url: treatment.image_url ?? null,
      image_storage_path: treatment.image_storage_path ?? null,
      category: treatment.category || '',
      color: treatment.color || '',
      staff_ids: treatment.staff_ids ?? [],
      buffer_before_minutes: treatment.buffer_before_minutes?.toString() ?? '',
      buffer_after_minutes: treatment.buffer_after_minutes?.toString() ?? '',
      advance_min_hours: treatment.advance_min_hours?.toString() ?? '',
      advance_max_days: treatment.advance_max_days?.toString() ?? '',
      limit_availability: (treatment.availability ?? []).length > 0,
      day_rows: availabilityToRows(treatment.availability),
    });
    setIsDialogOpen(true);
  };

  const discardUnsavedImage = () => {
    if (formData.image_storage_path && formData.image_storage_path !== savedImagePath) {
      void deleteImageQuietly(formData.image_storage_path);
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) discardUnsavedImage();
    setIsDialogOpen(open);
  };

  const handleImageUpload = async (file: File) => {
    const orgId = currentOrganization?.id;
    if (!orgId) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: t('treatmentManagement.image.invalid'), variant: 'destructive' });
      return;
    }
    if (file.size >= IMAGE_MAX_BYTES) {
      toast({ title: t('treatmentManagement.image.tooLarge'), variant: 'destructive' });
      return;
    }
    setUploadingImage(true);
    try {
      const ext = EXTENSION_BY_MIME[file.type] ?? 'jpg';
      const path = `organizations/${orgId}/treatments/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, file, { contentType: file.type });
      const url = await getDownloadURL(fileRef);
      const previous = formData.image_storage_path;
      if (previous && previous !== savedImagePath) void deleteImageQuietly(previous);
      setFormData(f => ({ ...f, image_url: url, image_storage_path: path }));
    } catch (error) {
      console.error('Treatment image upload failed', error);
      toast({ title: t('treatmentManagement.image.uploadFailed'), variant: 'destructive' });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    if (formData.image_storage_path && formData.image_storage_path !== savedImagePath) {
      void deleteImageQuietly(formData.image_storage_path);
    }
    setFormData(f => ({ ...f, image_url: null, image_storage_path: null }));
  };

  const handleSave = async () => {
    if (!formData.name || !formData.duration) {
      toast({
        title: t('treatmentManagement.requiredError.title'),
        description: t('treatmentManagement.requiredError.description'),
        variant: "destructive",
      });
      return;
    }

    try {
      const parseOptInt = (s: string): number | undefined => {
        const n = parseInt(s, 10);
        return Number.isFinite(n) && n >= 0 ? n : undefined;
      };

      const parsedMemberPrice = parseFloat(formData.member_price);
      const treatmentData = {
        name: formData.name,
        price: formData.price ? parseFloat(formData.price) : undefined,
        // Blank clears the member price. null (not undefined) so updateDoc
        // actually removes a previously saved value.
        member_price:
          formData.member_price.trim() !== '' && Number.isFinite(parsedMemberPrice) && parsedMemberPrice >= 0
            ? parsedMemberPrice
            : null,
        duration: parseInt(formData.duration),
        // null (not undefined) so clearing the field removes it from the
        // public booking page too.
        description: formData.description.trim() || null,
        image_url: formData.image_url,
        image_storage_path: formData.image_storage_path,
        category: formData.category || undefined,
        color: formData.color || undefined,
        is_active: true,
        // Empty array means "any staff." Store undefined in that case so the
        // doc stays clean and the scheduling utility's check (length > 0)
        // continues to treat absence as no restriction.
        staff_ids: formData.staff_ids.length > 0 ? formData.staff_ids : undefined,
        // Scheduling fields. Empty inputs → undefined (use org/staff defaults).
        buffer_before_minutes: parseOptInt(formData.buffer_before_minutes),
        buffer_after_minutes: parseOptInt(formData.buffer_after_minutes),
        advance_min_hours: parseOptInt(formData.advance_min_hours),
        advance_max_days: parseOptInt(formData.advance_max_days),
        // Save the day grid only when "Limit availability" is on. Otherwise
        // store undefined so the algorithm inherits staff/business hours.
        availability: formData.limit_availability
          ? rowsToAvailability(formData.day_rows)
          : undefined,
      };

      if (editingTreatment) {
        await updateTreatment(editingTreatment.id, treatmentData);
        if (savedImagePath && savedImagePath !== treatmentData.image_storage_path) {
          void deleteImageQuietly(savedImagePath);
        }
      } else {
        await addTreatment(treatmentData);
      }

      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving treatment:', error);
    }
  };

  const handleDelete = async (treatmentId: string) => {
    try {
      await updateTreatment(treatmentId, { is_active: false });
    } catch (error) {
      console.error('Error deleting treatment:', error);
    }
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-sm text-gray-500">{t('treatmentManagement.loading')}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col space-y-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="flex items-center space-x-2 rtl:space-x-reverse min-w-0 flex-1">
            <Settings className="h-5 w-5 text-purple-600 flex-shrink-0" />
            <CardTitle className="text-lg truncate">{t('treatmentManagement.title')}</CardTitle>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openAddDialog} className="w-full sm:w-auto shrink-0">
                <Plus className="h-4 w-4 me-2" />
                {t('treatmentManagement.addTreatment')}
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-3xl mx-auto max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-base">
                  {editingTreatment ? t('treatmentManagement.editTreatment') : t('treatmentManagement.addNewTreatment')}
                </DialogTitle>
                <DialogDescription className="text-sm">
                  {editingTreatment
                    ? t('treatmentManagement.updateDescription')
                    : t('treatmentManagement.createDescription')
                  }
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-6 py-4">
                {/* Photo beside the basics; both show on public booking links. */}
                <div className="grid gap-5 sm:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="grid gap-2 content-start">
                    <Label className="text-sm">{t('treatmentManagement.image.label')}</Label>
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) void handleImageUpload(file);
                        }}
                      />
                      {formData.image_url ? (
                        <div className="space-y-2">
                          <div className="overflow-hidden rounded-md border bg-muted">
                            <img
                              src={formData.image_url}
                              alt={t('treatmentManagement.image.alt')}
                              className="w-full aspect-[4/3] object-cover"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="flex-1 text-xs"
                              disabled={uploadingImage}
                              onClick={() => imageInputRef.current?.click()}
                            >
                              {uploadingImage
                                ? <Loader2 className="h-3.5 w-3.5 me-1 animate-spin" />
                                : <Upload className="h-3.5 w-3.5 me-1" />}
                              {t('treatmentManagement.image.replace')}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="flex-1 text-xs text-red-600 hover:text-red-700"
                              disabled={uploadingImage}
                              onClick={handleRemoveImage}
                            >
                              <X className="h-3.5 w-3.5 me-1" />
                              {t('treatmentManagement.image.remove')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={uploadingImage}
                          onClick={() => imageInputRef.current?.click()}
                          className="w-full aspect-[4/3] flex flex-col items-center justify-center rounded-md border-2 border-dashed border-input bg-background px-4 text-center hover:bg-accent transition-colors disabled:opacity-60"
                        >
                          {uploadingImage ? (
                            <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin text-muted-foreground" />
                          ) : (
                            <ImageIcon className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                          )}
                          <p className="text-sm font-medium">
                            {uploadingImage ? t('treatmentManagement.image.uploading') : t('treatmentManagement.image.upload')}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">{t('treatmentManagement.image.hint')}</p>
                        </button>
                      )}
                    <p className="text-xs text-muted-foreground">{t('treatmentManagement.image.sectionHelp')}</p>
                  </div>
                  <div className="grid gap-4 content-start">
                    <div className="grid gap-2">
                      <Label htmlFor="name" className="text-sm">{t('treatmentManagement.fields.name')}</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder={t('treatmentManagement.fields.namePlaceholder')}
                        className="w-full text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-2">
                        <Label htmlFor="price" className="text-sm">{t('treatmentManagement.fields.price')}</Label>
                        <Input
                          id="price"
                          type="number"
                          value={formData.price}
                          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                          placeholder={t('treatmentManagement.fields.pricePlaceholder')}
                          className="w-full text-sm"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="duration" className="text-sm">{t('treatmentManagement.fields.duration')}</Label>
                        <Input
                          id="duration"
                          type="number"
                          value={formData.duration}
                          onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                          placeholder={t('treatmentManagement.fields.durationPlaceholder')}
                          className="w-full text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="member_price" className="text-sm">{t('treatmentManagement.fields.memberPrice')}</Label>
                      <Input
                        id="member_price"
                        type="number"
                        min={0}
                        step="0.01"
                        value={formData.member_price}
                        onChange={(e) => setFormData({ ...formData, member_price: e.target.value })}
                        placeholder={t('treatmentManagement.fields.memberPricePlaceholder')}
                        className="w-full text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('treatmentManagement.fields.memberPriceHelp')}
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="category" className="text-sm">{t('treatmentManagement.fields.category')}</Label>
                      <Select
                        value={formData.category || '__none__'}
                        onValueChange={(v) => setFormData({ ...formData, category: v === '__none__' ? '' : v })}
                      >
                        <SelectTrigger id="category" className="w-full text-sm">
                          <SelectValue placeholder={t('treatmentManagement.fields.categoryPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t('treatmentManagement.fields.categoryNone')}</SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {categories.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          {t('treatmentManagement.fields.categoryTip')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description" className="text-sm">{t('treatmentManagement.fields.description')}</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t('treatmentManagement.fields.descriptionPlaceholder')}
                    rows={4}
                    maxLength={2000}
                    className="w-full resize-y text-sm"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="color" className="text-sm">{t('treatmentManagement.fields.color')}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        id="color"
                        className="flex items-center gap-3 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent transition-colors w-full text-start"
                      >
                        <span
                          className="h-6 w-6 rounded border border-border shrink-0"
                          style={{
                            backgroundColor: formData.color || '#e5e7eb',
                            backgroundImage: formData.color
                              ? undefined
                              : 'linear-gradient(45deg, transparent 47%, #9ca3af 47%, #9ca3af 53%, transparent 53%)',
                          }}
                        />
                        <span className="text-muted-foreground">
                          {formData.color ? <span dir="ltr">{formData.color.toUpperCase()}</span> : t('treatmentManagement.fields.noColor')}
                        </span>
                        {formData.color && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setFormData({ ...formData, color: '' });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setFormData({ ...formData, color: '' });
                              }
                            }}
                            className="ms-auto text-xs text-muted-foreground hover:text-foreground"
                          >
                            {t('treatmentManagement.fields.clearColor')}
                          </span>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="start">
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={t('treatmentManagement.fields.pickColor', { color: c })}
                            onClick={() => setFormData({ ...formData, color: c })}
                            className={`h-9 w-full rounded-md border-2 transition-transform hover:scale-105 ${
                              formData.color?.toLowerCase() === c.toLowerCase()
                                ? 'border-foreground ring-2 ring-ring ring-offset-1'
                                : 'border-border'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="custom-color" className="text-xs whitespace-nowrap">{t('treatmentManagement.fields.custom')}</Label>
                        <Input
                          id="custom-color"
                          type="color"
                          value={formData.color || '#10B981'}
                          onChange={(e) => setFormData({ ...formData, color: e.target.value.toUpperCase() })}
                          className="h-8 w-12 cursor-pointer p-1"
                        />
                        <Input
                          type="text"
                          value={formData.color}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '' || /^#[0-9a-fA-F]{0,6}$/.test(v)) {
                              setFormData({ ...formData, color: v.toUpperCase() });
                            }
                          }}
                          placeholder="#FFD700"
                          dir="ltr"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground">
                    {t('treatmentManagement.fields.colorHelp')}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label className="text-sm">{t('treatmentManagement.fields.staff')}</Label>
                  {eligibleStaff.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t('treatmentManagement.fields.noStaff')}
                    </p>
                  ) : (
                    <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                      {eligibleStaff.map(p => {
                        const checked = formData.staff_ids.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            className="flex items-center gap-2 p-1 text-sm cursor-pointer hover:bg-accent rounded"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...formData.staff_ids, p.id]
                                  : formData.staff_ids.filter(id => id !== p.id);
                                setFormData({ ...formData, staff_ids: next });
                              }}
                              className="h-4 w-4 rounded border-input"
                            />
                            <span className="truncate">{p.full_name || p.email}</span>
                            <span className="text-xs text-muted-foreground">({t(`common:roles.${p.role}`, { defaultValue: p.role })})</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t('treatmentManagement.fields.staffHelp')}
                  </p>
                </div>

                {/* ============ Scheduling section ============ */}
                <div className="rounded-md border border-dashed bg-muted/20 p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-purple-600" />
                    <Label className="text-sm font-medium">{t('treatmentManagement.scheduling.title')}</Label>
                  </div>

                  {/* Buffers */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">{t('treatmentManagement.scheduling.bufferBefore')}</Label>
                      <Input
                        type="number"
                        min={0}
                        value={formData.buffer_before_minutes}
                        onChange={(e) =>
                          setFormData({ ...formData, buffer_before_minutes: e.target.value })
                        }
                        placeholder="0"
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t('treatmentManagement.scheduling.bufferAfter')}</Label>
                      <Input
                        type="number"
                        min={0}
                        value={formData.buffer_after_minutes}
                        onChange={(e) =>
                          setFormData({ ...formData, buffer_after_minutes: e.target.value })
                        }
                        placeholder="0"
                        className="text-sm"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('treatmentManagement.scheduling.bufferHelp')}
                  </p>

                  {/* Advance booking window */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">{t('treatmentManagement.scheduling.earliestBooking')}</Label>
                      <Input
                        type="number"
                        min={0}
                        value={formData.advance_min_hours}
                        onChange={(e) =>
                          setFormData({ ...formData, advance_min_hours: e.target.value })
                        }
                        placeholder="0"
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t('treatmentManagement.scheduling.latestBooking')}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={formData.advance_max_days}
                        onChange={(e) =>
                          setFormData({ ...formData, advance_max_days: e.target.value })
                        }
                        placeholder="60"
                        className="text-sm"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('treatmentManagement.scheduling.advanceHelp')}
                  </p>

                  {/* Limit availability toggle */}
                  <div className="flex items-start gap-3 pt-2 border-t border-dashed">
                    <Switch
                      checked={formData.limit_availability}
                      onCheckedChange={(v) =>
                        setFormData({ ...formData, limit_availability: v })
                      }
                      aria-label={t('treatmentManagement.scheduling.limitAria')}
                    />
                    <div className="flex-1">
                      <Label className="text-sm">{t('treatmentManagement.scheduling.limitLabel')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('treatmentManagement.scheduling.limitHelp')}
                      </p>
                    </div>
                  </div>

                  {formData.limit_availability && (
                    <div className="space-y-2 pt-1">
                      {SCHED_DAY_KEYS.map((dayKey, dow) => {
                        const row = formData.day_rows[dow];
                        return (
                          <div
                            key={dow}
                            className="grid grid-cols-[80px_60px_1fr_1fr] gap-2 items-center"
                          >
                            <div className="text-xs font-medium">{t(`common:days.${SCHED_DAY_SHORT_KEYS[dow]}`)}</div>
                            <Switch
                              checked={row.enabled}
                              onCheckedChange={(v) => {
                                const rows = [...formData.day_rows];
                                rows[dow] = { ...rows[dow], enabled: v };
                                setFormData({ ...formData, day_rows: rows });
                              }}
                              aria-label={t('treatmentManagement.scheduling.toggleDay', { day: t(`common:days.${dayKey}`) })}
                            />
                            <Input
                              type="time"
                              value={row.start_time}
                              disabled={!row.enabled}
                              onChange={(e) => {
                                const rows = [...formData.day_rows];
                                rows[dow] = { ...rows[dow], start_time: e.target.value };
                                setFormData({ ...formData, day_rows: rows });
                              }}
                              className="text-xs h-8"
                            />
                            <Input
                              type="time"
                              value={row.end_time}
                              disabled={!row.enabled}
                              onChange={(e) => {
                                const rows = [...formData.day_rows];
                                rows[dow] = { ...rows[dow], end_time: e.target.value };
                                setFormData({ ...formData, day_rows: rows });
                              }}
                              className="text-xs h-8"
                            />
                          </div>
                        );
                      })}
                      <p className="text-xs text-muted-foreground">
                        {t('treatmentManagement.scheduling.daysOffHelp')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => handleDialogOpenChange(false)} className="w-full sm:w-auto text-sm">
                  {t('common:actions.cancel')}
                </Button>
                <Button onClick={handleSave} disabled={uploadingImage} className="w-full sm:w-auto text-sm">
                  {editingTreatment ? t('treatmentManagement.updateTreatment') : t('treatmentManagement.addTreatment')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <CardDescription className="text-sm">
          {t('treatmentManagement.subtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {treatments.map((treatment) => (
            <div key={treatment.id} className="p-3 border rounded-lg space-y-3">
              <div className="flex gap-3">
                {treatment.image_url && (
                  <img
                    src={treatment.image_url}
                    alt=""
                    className="h-16 w-16 rounded-md object-cover shrink-0 border"
                  />
                )}
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {treatment.color && (
                      <span
                        className="h-3 w-3 rounded-full border border-border shrink-0"
                        style={{ backgroundColor: treatment.color }}
                        aria-label={t('treatmentManagement.card.colorAria', { color: treatment.color })}
                        title={treatment.color}
                      />
                    )}
                    <h4 className="font-medium text-sm break-words">{treatment.name}</h4>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {treatment.price && <Badge variant="secondary" className="text-xs">{formatPrice(treatment.price)}</Badge>}
                    {typeof treatment.member_price === 'number' && (
                      <Badge variant="outline" className="text-xs border-amber-300 bg-amber-50 text-amber-800">
                        {t('treatmentManagement.card.memberPrice', { price: formatPrice(treatment.member_price) })}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">{t('treatmentManagement.card.minutes', { count: treatment.duration })}</Badge>
                    {treatment.category && <Badge variant="outline" className="text-xs">{treatment.category}</Badge>}
                  </div>
                  {treatment.description && (
                    <p className="text-xs text-muted-foreground break-words line-clamp-3">{treatment.description}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(treatment)}
                    className="flex-1 text-xs h-8"
                  >
                    <Edit className="h-3 w-3 me-1" />
                    {t('common:actions.edit')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(treatment.id)}
                    className="flex-1 text-red-600 hover:text-red-700 text-xs h-8"
                  >
                    <Trash className="h-3 w-3 me-1" />
                    {t('common:actions.delete')}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
