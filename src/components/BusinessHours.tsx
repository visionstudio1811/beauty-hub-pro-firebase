
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
import { useTranslation } from 'react-i18next';

// Mon-first ordering matches the businessHours data
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface SchedulingTemplate {
  key: 'weekdays' | 'sixDays' | 'allWeek';
  enabledDays: number[];        // 0=Mon..6=Sun
  openTime: string;
  closeTime: string;
  slotIntervalMinutes: number;  // applied to org-wide booking step
}

const TEMPLATES: SchedulingTemplate[] = [
  {
    key: 'weekdays',
    enabledDays: [0, 1, 2, 3, 4],
    openTime: '10:00',
    closeTime: '18:00',
    slotIntervalMinutes: 30,
  },
  {
    key: 'sixDays',
    enabledDays: [0, 1, 2, 3, 4, 5],
    openTime: '10:00',
    closeTime: '18:00',
    slotIntervalMinutes: 30,
  },
  {
    key: 'allWeek',
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
  const { t } = useTranslation('scheduling');

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
    toast({ title: t('businessHours.templateApplied'), description: t(`businessHours.templates.${tpl.key}.label`) });
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
            <div className="text-sm text-gray-500">{t('businessHours.loading')}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full overflow-hidden">
      <CardHeader>
        <div className="flex items-center space-x-2 rtl:space-x-reverse">
          <Calendar className="h-5 w-5 text-purple-600" />
          <CardTitle>{t('businessHours.title')}</CardTitle>
        </div>
        <CardDescription>
          {t('businessHours.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-hidden">
        {/* Quick Templates — one-click presets for new orgs / clients */}
        <div className="mb-4 rounded-lg border border-dashed border-purple-200 bg-purple-50/40 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-purple-600" />
            <span className="text-sm font-medium">{t('businessHours.quickTemplates')}</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            {t('businessHours.quickTemplatesHelp')}
          </p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((tpl) => (
              <Button
                key={tpl.key}
                size="sm"
                variant="outline"
                onClick={() => applyTemplate(tpl)}
                disabled={infoLoading}
                className="bg-white"
                title={t(`businessHours.templates.${tpl.key}.description`)}
              >
                {t(`businessHours.templates.${tpl.key}.label`)}
              </Button>
            ))}
          </div>
        </div>

        {/* Slot interval selector */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2">
          <Label className="text-sm font-medium sm:w-48 shrink-0">{t('businessHours.slotInterval')}</Label>
          <Select
            value={businessInfo?.slot_interval_minutes?.toString() ?? 'auto'}
            onValueChange={(v) => updateInterval(v === 'auto' ? null : parseInt(v, 10))}
            disabled={infoLoading}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{t('businessHours.intervalOptions.auto')}</SelectItem>
              <SelectItem value="15">{t('businessHours.intervalOptions.15')}</SelectItem>
              <SelectItem value="30">{t('businessHours.intervalOptions.30')}</SelectItem>
              <SelectItem value="60">{t('businessHours.intervalOptions.60')}</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {t('businessHours.slotIntervalHelp')}
          </span>
        </div>

        <div className="space-y-3 sm:space-y-4">
          {businessHours.map((dayHour, index) => (
            <div key={dayHour.day} className="flex flex-col space-y-3 p-3 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <Switch
                    checked={dayHour.enabled}
                    onCheckedChange={(checked) => updateDay(index, 'enabled', checked)}
                  />
                  <Label className="font-medium text-sm sm:text-base">{t(`common:days.${dayHour.day.toLowerCase()}`, { defaultValue: dayHour.day })}</Label>
                </div>
                
                {!dayHour.enabled && (
                  <span className="text-muted-foreground text-sm">{t('businessHours.closed')}</span>
                )}
              </div>
              
              {dayHour.enabled && (
                <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-2 rtl:space-x-reverse sm:justify-end">
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
                  
                  <span className="text-muted-foreground text-center text-sm">{t('businessHours.to')}</span>
                  
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
