import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CalendarDays } from 'lucide-react';
import { useSupabaseProfiles } from '@/hooks/useSupabaseProfiles';
import { StaffScheduleEditor } from './StaffScheduleEditor';
import { useTranslation } from 'react-i18next';

/**
 * Top-level Settings section for managing per-staff weekly schedules + date overrides.
 * Lists all staff users (staff/admin/beautician) and shows the schedule editor for
 * the selected staff member inline.
 */
export const StaffSchedulesSection: React.FC = () => {
  const { t } = useTranslation('scheduling');
  const { profiles, loading } = useSupabaseProfiles();
  const [selectedId, setSelectedId] = useState<string>('');

  const schedulableStaff = profiles.filter(
    p => p.is_active && (p.role === 'staff' || p.role === 'admin' || p.role === 'beautician')
  );

  const selectedProfile = schedulableStaff.find(p => p.id === selectedId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            {t('staffSchedulesSection.title')}
          </CardTitle>
          <CardDescription>
            {t('staffSchedulesSection.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="staff-picker">{t('staffSchedulesSection.chooseStaff')}</Label>
            <Select
              value={selectedId}
              onValueChange={setSelectedId}
              disabled={loading || schedulableStaff.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={
                  loading ? t('staffSchedulesSection.loadingStaff') :
                  schedulableStaff.length === 0 ? t('staffSchedulesSection.noStaff') :
                  t('staffSchedulesSection.selectStaff')
                } />
              </SelectTrigger>
              <SelectContent>
                {schedulableStaff.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}
                    <span className="text-xs text-muted-foreground ms-2">({t(`common:roles.${p.role}`, { defaultValue: p.role })})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedProfile && (
        <StaffScheduleEditor
          staffId={selectedProfile.id}
          staffName={selectedProfile.full_name || selectedProfile.email}
        />
      )}
    </div>
  );
};
