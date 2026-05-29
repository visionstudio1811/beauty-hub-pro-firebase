
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Calendar, Sparkles } from 'lucide-react';
import { useSupabaseBusinessHours, DayHours } from '@/hooks/useSupabaseBusinessHours';
import { useSupabaseBusinessInfo } from '@/hooks/useSupabaseBusinessInfo';
import { useToast } from '@/hooks/use-toast';

// Mon-first ordering matches the businessHours data
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface SchedulingTemplate {
  label: string;
  description: string;
  enabledDays: number[];        // 0=Mon..6=Sun
  openTime: string;
  closeTime: string;
  slotIntervalMinutes: number;  // applied to org-wide booking step
}

const TEMPLATES: SchedulingTemplate[] = [
  {
    label: 'Mon–Fri 10–6 · 30 min',
    description: 'Weekdays, half-hour slots',
    enabledDays: [0, 1, 2, 3, 4],
    openTime: '10:00',
    closeTime: '18:00',
    slotIntervalMinutes: 30,
  },
  {
    label: 'Mon–Sat 10–6 · 30 min',
    description: 'Six days, half-hour slots',
    enabledDays: [0, 1, 2, 3, 4, 5],
    openTime: '10:00',
    closeTime: '18:00',
    slotIntervalMinutes: 30,
  },
  {
    label: 'All Week 10–6 · 1 hour',
    description: 'Every day, hourly slots',
    enabledDays: [0, 1, 2, 3, 4, 5, 6],
    openTime: '10:00',
    closeTime: '18:00',
    slotIntervalMinutes: 60,
  },
];

export const BusinessHours: React.FC = () => {
  const { businessHours, loading, updateBusinessHours } = useSupabaseBusinessHours();
  const { businessInfo, updateBusinessInfo, loading: infoLoading } = useSupabaseBusinessInfo();
  const { toast } = useToast();

  const timeOptions = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0');
    return [`${hour}:00`, `${hour}:30`];
  }).flat();

  const updateDay = (dayIndex: number, field: keyof DayHours, value: boolean | string) => {
    const newHours = [...businessHours];
    newHours[dayIndex] = { ...newHours[dayIndex], [field]: value };
    updateBusinessHours(newHours);
  };

  const applyTemplate = async (tpl: SchedulingTemplate) => {
    const enabled = new Set(tpl.enabledDays);
    const newHours: DayHours[] = DAY_NAMES.map((day, idx) => ({
      day,
      enabled: enabled.has(idx),
      openTime: tpl.openTime,
      closeTime: tpl.closeTime,
    }));
    await updateBusinessHours(newHours);
    await updateBusinessInfo({
      name: businessInfo?.name ?? '',
      address: businessInfo?.address ?? null,
      phone: businessInfo?.phone ?? null,
      email: businessInfo?.email ?? null,
      website: businessInfo?.website ?? null,
      slot_interval_minutes: tpl.slotIntervalMinutes,
    });
    toast({ title: 'Template applied', description: tpl.label });
  };

  const updateInterval = async (next: number | null) => {
    await updateBusinessInfo({
      name: businessInfo?.name ?? '',
      address: businessInfo?.address ?? null,
      phone: businessInfo?.phone ?? null,
      email: businessInfo?.email ?? null,
      website: businessInfo?.website ?? null,
      slot_interval_minutes: next ?? undefined,
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-sm text-gray-500">Loading business hours...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full overflow-hidden">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <Calendar className="h-5 w-5 text-purple-600" />
          <CardTitle>Business Hours</CardTitle>
        </div>
        <CardDescription>
          Set your operating hours - these will control available time slots across all booking systems
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-hidden">
        {/* Quick Templates — one-click presets for new orgs / clients */}
        <div className="mb-4 rounded-lg border border-dashed border-purple-200 bg-purple-50/40 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-purple-600" />
            <span className="text-sm font-medium">Quick Templates</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            One click sets hours + booking slot interval. You can fine-tune anything afterwards.
          </p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((tpl) => (
              <Button
                key={tpl.label}
                size="sm"
                variant="outline"
                onClick={() => applyTemplate(tpl)}
                disabled={infoLoading}
                className="bg-white"
                title={tpl.description}
              >
                {tpl.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Slot interval selector */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2">
          <Label className="text-sm font-medium sm:w-48 shrink-0">Booking Slot Interval</Label>
          <Select
            value={businessInfo?.slot_interval_minutes?.toString() ?? 'auto'}
            onValueChange={(v) => updateInterval(v === 'auto' ? null : parseInt(v, 10))}
            disabled={infoLoading}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (treatment-based)</SelectItem>
              <SelectItem value="15">Every 15 minutes</SelectItem>
              <SelectItem value="30">Every 30 minutes</SelectItem>
              <SelectItem value="60">Every hour</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            How often a bookable time appears on the picker
          </span>
        </div>

        <div className="space-y-3 sm:space-y-4">
          {businessHours.map((dayHour, index) => (
            <div key={dayHour.day} className="flex flex-col space-y-3 p-3 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Switch
                    checked={dayHour.enabled}
                    onCheckedChange={(checked) => updateDay(index, 'enabled', checked)}
                  />
                  <Label className="font-medium text-sm sm:text-base">{dayHour.day}</Label>
                </div>
                
                {!dayHour.enabled && (
                  <span className="text-muted-foreground text-sm">Closed</span>
                )}
              </div>
              
              {dayHour.enabled && (
                <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-2 sm:justify-end">
                  <Select
                    value={dayHour.openTime}
                    onValueChange={(value) => updateDay(index, 'openTime', value)}
                  >
                    <SelectTrigger className="w-full sm:w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <span className="text-muted-foreground text-center text-sm">to</span>
                  
                  <Select
                    value={dayHour.closeTime}
                    onValueChange={(value) => updateDay(index, 'closeTime', value)}
                  >
                    <SelectTrigger className="w-full sm:w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
