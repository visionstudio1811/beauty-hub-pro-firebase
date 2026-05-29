
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Edit, Trash, Settings, Clock } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseTreatments, Treatment, TreatmentAvailabilityWindow } from '@/hooks/useSupabaseTreatments';
import { useSupabaseProfiles } from '@/hooks/useSupabaseProfiles';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';

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
const SCHED_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface DayRow {
  enabled: boolean;
  start_time: string;
  end_time: string;
}

const defaultDayRow = (): DayRow => ({ enabled: true, start_time: '10:00', end_time: '18:00' });

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
  const { treatments, loading, addTreatment, updateTreatment } = useSupabaseTreatments();
  const { currentOrganization } = useOrganization();
  const { profiles } = useSupabaseProfiles();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTreatment, setEditingTreatment] = useState<Treatment | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    duration: '',
    description: '',
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
      name: '', price: '', duration: '', description: '', category: '', color: '',
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
      duration: treatment.duration.toString(),
      description: treatment.description || '',
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

  const handleSave = async () => {
    if (!formData.name || !formData.duration) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    try {
      const parseOptInt = (s: string): number | undefined => {
        const n = parseInt(s, 10);
        return Number.isFinite(n) && n >= 0 ? n : undefined;
      };

      const treatmentData = {
        name: formData.name,
        price: formData.price ? parseFloat(formData.price) : undefined,
        duration: parseInt(formData.duration),
        description: formData.description || undefined,
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
            <div className="text-sm text-gray-500">Loading treatments...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col space-y-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="flex items-center space-x-2 min-w-0 flex-1">
            <Settings className="h-5 w-5 text-purple-600 flex-shrink-0" />
            <CardTitle className="text-lg truncate">Services & Treatments</CardTitle>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openAddDialog} className="w-full sm:w-auto shrink-0">
                <Plus className="h-4 w-4 mr-2" />
                Add Treatment
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-md mx-auto max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-base">
                  {editingTreatment ? 'Edit Treatment' : 'Add New Treatment'}
                </DialogTitle>
                <DialogDescription className="text-sm">
                  {editingTreatment 
                    ? 'Update the treatment details below.'
                    : 'Create a new treatment with pricing and duration.'
                  }
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name" className="text-sm">Treatment Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter treatment name"
                    className="w-full text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="price" className="text-sm">Price ($)</Label>
                    <Input
                      id="price"
                      type="number"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="0"
                      className="w-full text-sm"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="duration" className="text-sm">Duration (min) *</Label>
                    <Input
                      id="duration"
                      type="number"
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                      placeholder="60"
                      className="w-full text-sm"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category" className="text-sm">Category</Label>
                  <Select
                    value={formData.category || '__none__'}
                    onValueChange={(v) => setFormData({ ...formData, category: v === '__none__' ? '' : v })}
                  >
                    <SelectTrigger id="category" className="w-full text-sm">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {categories.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Tip: add categories in Settings → Categories (scope: Facials).
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="color" className="text-sm">Calendar Color</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        id="color"
                        className="flex items-center gap-3 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent transition-colors w-full text-left"
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
                          {formData.color ? formData.color.toUpperCase() : 'No color'}
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
                            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                          >
                            Clear
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
                            aria-label={`Pick ${c}`}
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
                        <Label htmlFor="custom-color" className="text-xs whitespace-nowrap">Custom:</Label>
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
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground">
                    Used to color appointment blocks on the calendar.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label className="text-sm">Staff who can perform this treatment</Label>
                  {eligibleStaff.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No active staff yet. Add staff under Settings → Users first.
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
                            <span className="text-xs text-muted-foreground">({p.role})</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Leave empty to let any active staff perform this treatment.
                  </p>
                </div>

                {/* ============ Scheduling section ============ */}
                <div className="rounded-md border border-dashed bg-muted/20 p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-purple-600" />
                    <Label className="text-sm font-medium">Scheduling</Label>
                  </div>

                  {/* Buffers */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Buffer before (min)</Label>
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
                      <Label className="text-xs">Buffer after (min)</Label>
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
                    Padding before and after each appointment for cleanup / prep. Leave blank for none.
                  </p>

                  {/* Advance booking window */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Earliest booking (hours)</Label>
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
                      <Label className="text-xs">Latest booking (days)</Label>
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
                    "Earliest" blocks bookings closer than this many hours from now.
                    "Latest" blocks bookings further out than this many days.
                  </p>

                  {/* Limit availability toggle */}
                  <div className="flex items-start gap-3 pt-2 border-t border-dashed">
                    <Switch
                      checked={formData.limit_availability}
                      onCheckedChange={(v) =>
                        setFormData({ ...formData, limit_availability: v })
                      }
                      aria-label="Limit availability to specific days"
                    />
                    <div className="flex-1">
                      <Label className="text-sm">Limit to specific days/hours</Label>
                      <p className="text-xs text-muted-foreground">
                        Off: this treatment is bookable whenever staff & business hours are open.
                        On: only the days/hours you enable below are bookable.
                      </p>
                    </div>
                  </div>

                  {formData.limit_availability && (
                    <div className="space-y-2 pt-1">
                      {SCHED_DAYS.map((dayName, dow) => {
                        const row = formData.day_rows[dow];
                        return (
                          <div
                            key={dow}
                            className="grid grid-cols-[80px_60px_1fr_1fr] gap-2 items-center"
                          >
                            <div className="text-xs font-medium">{dayName.slice(0, 3)}</div>
                            <Switch
                              checked={row.enabled}
                              onCheckedChange={(v) => {
                                const rows = [...formData.day_rows];
                                rows[dow] = { ...rows[dow], enabled: v };
                                setFormData({ ...formData, day_rows: rows });
                              }}
                              aria-label={`Toggle ${dayName}`}
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
                        Days toggled off are closed for this treatment regardless of staff schedule.
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description" className="text-sm">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of the treatment"
                    rows={3}
                    className="w-full resize-none text-sm"
                  />
                </div>
              </div>
              <DialogFooter className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto text-sm">
                  Cancel
                </Button>
                <Button onClick={handleSave} className="w-full sm:w-auto text-sm">
                  {editingTreatment ? 'Update' : 'Add'} Treatment
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <CardDescription className="text-sm">
          Manage your treatment services, pricing, and duration
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {treatments.map((treatment) => (
            <div key={treatment.id} className="p-3 border rounded-lg space-y-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {treatment.color && (
                    <span
                      className="h-3 w-3 rounded-full border border-border shrink-0"
                      style={{ backgroundColor: treatment.color }}
                      aria-label={`Color ${treatment.color}`}
                      title={treatment.color}
                    />
                  )}
                  <h4 className="font-medium text-sm break-words">{treatment.name}</h4>
                </div>
                <div className="flex flex-wrap gap-1">
                  {treatment.price && <Badge variant="secondary" className="text-xs">${treatment.price}</Badge>}
                  <Badge variant="outline" className="text-xs">{treatment.duration} min</Badge>
                  {treatment.category && <Badge variant="outline" className="text-xs">{treatment.category}</Badge>}
                </div>
                {treatment.description && (
                  <p className="text-xs text-muted-foreground break-words">{treatment.description}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(treatment)}
                    className="flex-1 text-xs h-8"
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(treatment.id)}
                    className="flex-1 text-red-600 hover:text-red-700 text-xs h-8"
                  >
                    <Trash className="h-3 w-3 mr-1" />
                    Delete
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
