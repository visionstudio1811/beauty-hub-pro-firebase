import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, Plus, Trash2, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseBusinessHours } from '@/hooks/useSupabaseBusinessHours';
import {
  useStaffAvailability,
  useUpsertStaffAvailability,
  useDeleteStaffAvailability,
  weeklyDocId,
  overrideDocId,
} from '@/hooks/scheduling/useStaffAvailability';
import type { StaffAvailabilityDoc } from '@/lib/scheduling/types';

interface StaffScheduleEditorProps {
  staffId: string;
  staffName: string;
}

// Mon-first order (matches the business hours convention used elsewhere)
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface WeeklyRow {
  is_active: boolean;
  start_time: string;
  end_time: string;
}

const defaultWeekly = (): WeeklyRow => ({ is_active: false, start_time: '09:00', end_time: '18:00' });

interface StaffTemplate {
  label: string;
  enabledDays: number[];
  openTime: string;
  closeTime: string;
}

const STAFF_TEMPLATES: StaffTemplate[] = [
  { label: 'Mon–Fri 10–6', enabledDays: [0, 1, 2, 3, 4], openTime: '10:00', closeTime: '18:00' },
  { label: 'Mon–Sat 10–6', enabledDays: [0, 1, 2, 3, 4, 5], openTime: '10:00', closeTime: '18:00' },
  { label: 'All Week 10–6', enabledDays: [0, 1, 2, 3, 4, 5, 6], openTime: '10:00', closeTime: '18:00' },
];

export const StaffScheduleEditor: React.FC<StaffScheduleEditorProps> = ({ staffId, staffName }) => {
  const { toast } = useToast();
  const { data: availability, isLoading } = useStaffAvailability(staffId);
  const { businessHours } = useSupabaseBusinessHours();
  const upsert = useUpsertStaffAvailability();
  const remove = useDeleteStaffAvailability();

  // Local edit state for the 7 weekly rows.
  const [weekly, setWeekly] = useState<WeeklyRow[]>(() => Array.from({ length: 7 }, defaultWeekly));
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from server docs on first load. If no docs exist yet, seed from
  // current businessHours so the admin starts from the org default rather
  // than blank rows.
  useEffect(() => {
    if (isLoading || hydrated) return;
    const docs = availability ?? [];
    if (docs.length > 0) {
      const rows = Array.from({ length: 7 }, defaultWeekly);
      docs.forEach(d => {
        if (d.type !== 'weekly') return;
        if (d.day_of_week < 0 || d.day_of_week > 6) return;
        rows[d.day_of_week] = { is_active: d.is_active, start_time: d.start_time, end_time: d.end_time };
      });
      setWeekly(rows);
    } else if (businessHours.length === 7) {
      // Seed from businessHours (Mon-first indexed)
      setWeekly(
        businessHours.map(bh => ({
          is_active: bh.enabled,
          start_time: bh.openTime,
          end_time: bh.closeTime,
        }))
      );
    }
    setHydrated(true);
  }, [availability, businessHours, isLoading, hydrated]);

  const overrides = useMemo(() => {
    return (availability ?? [])
      .filter((d): d is Extract<StaffAvailabilityDoc, { type: 'override' }> => d.type === 'override')
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [availability]);

  const updateWeeklyRow = (dow: number, patch: Partial<WeeklyRow>) => {
    setWeekly(prev => prev.map((row, i) => (i === dow ? { ...row, ...patch } : row)));
  };

  const applyTemplate = (tpl: StaffTemplate) => {
    const enabled = new Set(tpl.enabledDays);
    setWeekly(
      Array.from({ length: 7 }, (_, dow) => ({
        is_active: enabled.has(dow),
        start_time: tpl.openTime,
        end_time: tpl.closeTime,
      }))
    );
    toast({ title: 'Template applied', description: `${tpl.label} — click Save to persist.` });
  };

  const copyFromBusinessHours = () => {
    if (businessHours.length !== 7) return;
    setWeekly(
      businessHours.map(bh => ({
        is_active: bh.enabled,
        start_time: bh.openTime,
        end_time: bh.closeTime,
      }))
    );
    toast({ title: 'Copied from Business Hours', description: 'Click Save to persist.' });
  };

  const saveAll = async () => {
    try {
      await Promise.all(
        weekly.map((row, dow) =>
          upsert.mutateAsync({
            staffId,
            docId: weeklyDocId(dow),
            data: {
              type: 'weekly',
              day_of_week: dow,
              start_time: row.start_time,
              end_time: row.end_time,
              is_active: row.is_active,
            },
          })
        )
      );
      toast({ title: 'Schedule saved', description: `Weekly hours updated for ${staffName}` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast({ title: 'Save failed', description: msg, variant: 'destructive' });
    }
  };

  // -------- override (vacation / one-off custom hours) UI --------
  const [overrideDate, setOverrideDate] = useState('');
  const [overrideMode, setOverrideMode] = useState<'off' | 'custom'>('off');
  const [overrideStart, setOverrideStart] = useState('09:00');
  const [overrideEnd, setOverrideEnd] = useState('18:00');

  const addOverride = async () => {
    if (!overrideDate || !/^\d{4}-\d{2}-\d{2}$/.test(overrideDate)) {
      toast({ title: 'Pick a date', description: 'Date must be in YYYY-MM-DD format', variant: 'destructive' });
      return;
    }
    try {
      await upsert.mutateAsync({
        staffId,
        docId: overrideDocId(overrideDate),
        data: overrideMode === 'off'
          ? { type: 'override', date: overrideDate, is_active: false }
          : { type: 'override', date: overrideDate, is_active: true, start_time: overrideStart, end_time: overrideEnd },
      });
      setOverrideDate('');
      toast({ title: 'Override saved' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast({ title: 'Save failed', description: msg, variant: 'destructive' });
    }
  };

  const removeOverride = async (date: string) => {
    try {
      await remove.mutateAsync({ staffId, docId: overrideDocId(date) });
      toast({ title: 'Override removed' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast({ title: 'Delete failed', description: msg, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Weekly Hours
          </CardTitle>
          <CardDescription>
            Working days and hours for {staffName}. When set, these override the org's business hours
            for this staff member only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Quick Templates */}
          <div className="rounded-lg border border-dashed border-purple-200 bg-purple-50/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium">Quick Templates</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              One click fills in the weekly grid. Click Save to persist.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="bg-white" onClick={copyFromBusinessHours}>
                Copy from Business Hours
              </Button>
              {STAFF_TEMPLATES.map(tpl => (
                <Button
                  key={tpl.label}
                  size="sm"
                  variant="outline"
                  onClick={() => applyTemplate(tpl)}
                  className="bg-white"
                >
                  {tpl.label}
                </Button>
              ))}
            </div>
          </div>

          {weekly.map((row, dow) => (
            <div
              key={dow}
              className="grid grid-cols-1 md:grid-cols-[120px_80px_1fr_1fr] gap-3 items-center border rounded-md p-3"
            >
              <div className="font-medium">{DAYS[dow]}</div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={row.is_active}
                  onCheckedChange={(v) => updateWeeklyRow(dow, { is_active: v })}
                  aria-label={`Toggle ${DAYS[dow]} active`}
                />
                <span className="text-xs text-muted-foreground">{row.is_active ? 'On' : 'Off'}</span>
              </div>
              <div>
                <Label className="text-xs">Start</Label>
                <Input
                  type="time"
                  value={row.start_time}
                  onChange={(e) => updateWeeklyRow(dow, { start_time: e.target.value })}
                  disabled={!row.is_active}
                />
              </div>
              <div>
                <Label className="text-xs">End</Label>
                <Input
                  type="time"
                  value={row.end_time}
                  onChange={(e) => updateWeeklyRow(dow, { end_time: e.target.value })}
                  disabled={!row.is_active}
                />
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <Button onClick={saveAll} disabled={upsert.isPending}>
              {upsert.isPending ? 'Saving…' : 'Save Weekly Hours'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Date Overrides</CardTitle>
          <CardDescription>
            Day-off, vacation, or custom hours for a specific date. Overrides win over the weekly schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {overrides.length === 0 ? (
            <p className="text-sm text-muted-foreground">No overrides yet.</p>
          ) : (
            <div className="space-y-2">
              {overrides.map(o => (
                <div key={o.date} className="flex items-center justify-between border rounded-md p-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm">{o.date}</span>
                    {o.is_active && o.start_time && o.end_time ? (
                      <Badge variant="outline">{o.start_time}–{o.end_time}</Badge>
                    ) : (
                      <Badge variant="destructive">Day off</Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeOverride(o.date)}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_1fr_1fr_auto] gap-3 items-end border-t pt-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={overrideDate}
                onChange={(e) => setOverrideDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <select
                value={overrideMode}
                onChange={(e) => setOverrideMode(e.target.value as 'off' | 'custom')}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="off">Day off</option>
                <option value="custom">Custom hours</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Start</Label>
              <Input
                type="time"
                value={overrideStart}
                onChange={(e) => setOverrideStart(e.target.value)}
                disabled={overrideMode !== 'custom'}
              />
            </div>
            <div>
              <Label className="text-xs">End</Label>
              <Input
                type="time"
                value={overrideEnd}
                onChange={(e) => setOverrideEnd(e.target.value)}
                disabled={overrideMode !== 'custom'}
              />
            </div>
            <Button onClick={addOverride} disabled={upsert.isPending}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
