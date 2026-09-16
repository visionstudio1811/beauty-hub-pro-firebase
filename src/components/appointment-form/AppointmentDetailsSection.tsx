
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Calendar as CalendarIcon, AlertCircle, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { getDateFnsLocale } from '@/i18n/dateLocale';
import { cn } from '@/lib/utils';

interface Treatment {
  id: string;
  name: string;
  duration: number;
  price?: number;
  staff_ids?: string[];
}

interface AddonOption {
  id: string;
  name: string;
  price: number;
  duration_minutes?: number | null;
}

interface StaffProfile {
  id: string;
  full_name?: string;
  email: string;
}

interface TimeSlot {
  time: string;
  available: boolean;
  availableCount: number;
  maxCount: number;
  displayText: string;
}

interface AppointmentFormData {
  treatmentId: string;
  staffId: string;
  time: string;
  notes: string;
  price: string;
  selectedAddonIds: string[];
}

interface CustomTimeConflict {
  appointment_time: string;
  appointment_end: string;
  duration: number;
}

interface AppointmentDetailsSectionProps {
  selectedDate: Date;
  onDateChange: (date: Date | undefined) => void;
  formData: AppointmentFormData;
  onFormDataChange: (updates: Partial<AppointmentFormData>) => void;
  availableTreatments: Treatment[];
  availableAddons: AddonOption[];
  addonsTotalPrice: number;
  addonsTotalDuration: number;
  totalDuration: number;
  staffProfiles: StaffProfile[];
  availableTimeSlots: TimeSlot[];
  selectedPackage: any;
  onTimeChange: (value: string) => void;
  // Custom-time override (Phase 1)
  useCustomTime: boolean;
  setUseCustomTime: (v: boolean) => void;
  customTime: string;
  setCustomTime: (v: string) => void;
  customTimeConflict: CustomTimeConflict | null;
  loading: {
    treatments: boolean;
    addons?: boolean;
    staff: boolean;
    businessHours: boolean;
    slots?: boolean;
  };
}

export const AppointmentDetailsSection: React.FC<AppointmentDetailsSectionProps> = ({
  selectedDate,
  onDateChange,
  formData,
  onFormDataChange,
  availableTreatments,
  availableAddons,
  addonsTotalPrice,
  addonsTotalDuration,
  totalDuration,
  staffProfiles,
  availableTimeSlots,
  selectedPackage,
  onTimeChange,
  useCustomTime,
  setUseCustomTime,
  customTime,
  setCustomTime,
  customTimeConflict,
  loading
}) => {
  const { t } = useTranslation('appointments');
  const toggleAddon = (addonId: string) => {
    const isSelected = formData.selectedAddonIds.includes(addonId);
    const nextIds = isSelected
      ? formData.selectedAddonIds.filter(id => id !== addonId)
      : [...formData.selectedAddonIds, addonId];
    onFormDataChange({ selectedAddonIds: nextIds, time: '' });
  };
  const packageAddonCapReached = !!selectedPackage && formData.selectedAddonIds.length >= 1;
  // Count available vs total slots for display
  const availableSlotCount = availableTimeSlots.filter(slot => slot.available).length;
  const totalSlotCount = availableTimeSlots.length;

  // Filter staff profiles by the selected treatment's staff_ids (if any).
  // Empty/missing staff_ids = any active staff can perform the treatment.
  const selectedTreatment = availableTreatments.find(t => t.id === formData.treatmentId);
  const eligibleStaff = React.useMemo(() => {
    if (!selectedTreatment?.staff_ids || selectedTreatment.staff_ids.length === 0) {
      return staffProfiles;
    }
    const allowed = new Set(selectedTreatment.staff_ids);
    return staffProfiles.filter(p => allowed.has(p.id));
  }, [staffProfiles, selectedTreatment?.staff_ids]);

  return (
    <>
      {/* Date Selection */}
      <div>
        <Label htmlFor="date">{t('form.details.date')}</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-start font-normal",
                !selectedDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="me-2 h-4 w-4" />
              {selectedDate ? format(selectedDate, "PPP", { locale: getDateFnsLocale() }) : <span>{t('form.details.pickDate')}</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={onDateChange}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              initialFocus
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Treatment and Staff Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="treatment">{t('form.details.treatment')}</Label>
          <Select
            value={formData.treatmentId}
            onValueChange={(value) => {
              const treatment = availableTreatments.find(t => t.id === value);
              const autoPrice = !selectedPackage && treatment?.price != null
                ? String(treatment.price)
                : '';
              onFormDataChange({ treatmentId: value, time: '', price: autoPrice });
            }}
            disabled={loading.treatments}
          >
            <SelectTrigger>
              <SelectValue placeholder={loading.treatments ? t('form.details.loadingTreatments') : t('form.details.selectTreatment')} />
            </SelectTrigger>
            <SelectContent>
              {availableTreatments.map((treatment) => (
                <SelectItem key={treatment.id} value={treatment.id}>
                  <div className="flex items-center justify-between w-full">
                    <span>{treatment.name} ({t('durationMin', { count: treatment.duration })})</span>
                    {selectedPackage ? (
                      <Badge variant="default" className="ms-2 bg-green-100 text-green-800">
                        {t('form.details.free')}
                      </Badge>
                    ) : (
                      treatment.price && (
                        <span className="ms-2 text-sm text-gray-600" dir="ltr">
                          ${treatment.price}
                        </span>
                      )
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedPackage && availableTreatments.length === 0 && (
            <p className="text-sm text-amber-600 mt-1">
              {t('form.details.noTreatmentsForPackage')}
            </p>
          )}
          {formData.treatmentId && addonsTotalDuration > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {t('form.details.totalTimeWithAddons', { count: totalDuration })}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="staff">{t('form.details.staff')}</Label>
          <Select
            value={formData.staffId}
            onValueChange={(value) => onFormDataChange({ staffId: value, time: '' })}
            disabled={loading.staff}
          >
            <SelectTrigger>
              <SelectValue placeholder={loading.staff ? t('form.details.loading') : t('form.details.selectStaff')} />
            </SelectTrigger>
            <SelectContent>
              {eligibleStaff.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.full_name || profile.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedTreatment?.staff_ids && selectedTreatment.staff_ids.length > 0 && eligibleStaff.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              {t('form.details.noEligibleStaff')}
            </p>
          )}
        </div>
      </div>

      {/* Add-ons */}
      {availableAddons.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>{t('form.details.addons')}</Label>
            {selectedPackage && (
              <span className="text-xs text-muted-foreground">
                {t('form.details.packageAddonCap')}
              </span>
            )}
          </div>
          <div className="space-y-2 border rounded-md p-2 max-h-44 overflow-y-auto">
            {availableAddons.map((addon) => {
              const isSelected = formData.selectedAddonIds.includes(addon.id);
              const disabled = packageAddonCapReached && !isSelected;
              return (
                <label
                  key={addon.id}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded p-2 text-sm cursor-pointer hover:bg-accent',
                    disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={disabled}
                      onChange={() => toggleAddon(addon.id)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span className="truncate">{addon.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="text-xs" dir="ltr">{t('form.details.addonPrice', { price: addon.price })}</Badge>
                    {addon.duration_minutes && addon.duration_minutes > 0 ? (
                      <Badge variant="outline" className="text-xs">{t('form.details.addonDuration', { count: addon.duration_minutes })}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">{t('form.details.noExtraTime')}</Badge>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Price */}
      {selectedPackage ? (
        formData.treatmentId && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
            {addonsTotalPrice > 0
              ? t('form.details.packageSessionWithAddons', { price: addonsTotalPrice.toFixed(2) })
              : t('form.details.packageSessionNoCharge')}
          </div>
        )
      ) : (
        <div>
          <Label>{t('form.details.treatmentPrice')}</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={formData.price}
            onChange={(e) => onFormDataChange({ price: e.target.value })}
            placeholder="0.00"
            className="mt-1"
          />
          {addonsTotalPrice > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {t('form.details.addonsTotal', {
                addons: addonsTotalPrice.toFixed(2),
                total: ((parseFloat(formData.price) || 0) + addonsTotalPrice).toFixed(2),
              })}
            </p>
          )}
        </div>
      )}

      {/* Time selection — slot picker (default) or custom time override */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label htmlFor="time">{useCustomTime ? t('form.details.customTime') : t('form.details.availableTimeSlots')}</Label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('form.details.customTimeToggle')}</span>
            <Switch
              checked={useCustomTime}
              onCheckedChange={(v) => {
                setUseCustomTime(v);
                // Clear the other side's value when switching modes
                if (v) onFormDataChange({ time: '' });
                else setCustomTime('');
              }}
              aria-label={t('form.details.toggleCustomTime')}
            />
          </div>
        </div>

        {useCustomTime ? (
          <>
            <Input
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              disabled={!formData.staffId || !formData.treatmentId}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t('form.details.customTimeHelp')}
            </p>
            {customTimeConflict && (
              <div className="mt-2 p-2 rounded border border-amber-300 bg-amber-50 text-sm text-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  {t('form.details.customTimeConflict', {
                    start: customTimeConflict.appointment_time,
                    end: customTimeConflict.appointment_end,
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2 text-sm">
              {formData.staffId && formData.treatmentId && !loading.businessHours && !loading.slots && (
                <div className="text-muted-foreground">
                  {availableSlotCount > 0 ? (
                    <span className="text-green-600">{t('form.details.slotsAvailable', { available: availableSlotCount, total: totalSlotCount })}</span>
                  ) : (
                    <span className="text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {t('form.details.noSlotsFlipToggle')}
                    </span>
                  )}
                </div>
              )}
            </div>

            <Select
              value={formData.time}
              onValueChange={onTimeChange}
              disabled={!formData.staffId || !formData.treatmentId || loading.businessHours || loading.slots}
            >
              <SelectTrigger>
                <SelectValue placeholder={
                  loading.businessHours || loading.slots ? t('form.details.loading') :
                  !formData.staffId || !formData.treatmentId ? t('form.details.selectTreatmentAndStaffFirst') :
                  availableSlotCount === 0 ? t('form.details.noSlotsForDate') :
                  t('form.details.selectAvailableTime')
                } />
              </SelectTrigger>
              <SelectContent>
                {availableTimeSlots.length === 0 ? (
                  <SelectItem value="no-slots" disabled>
                    {loading.businessHours || loading.slots
                      ? t('form.details.loadingTimeSlots')
                      : !formData.staffId || !formData.treatmentId
                      ? t('form.details.selectTreatmentAndStaffFirst')
                      : t('form.details.noSlotsForDate')}
                  </SelectItem>
                ) : (
                  availableTimeSlots.map((slot) => (
                    <SelectItem
                      key={slot.time}
                      value={slot.time}
                      disabled={!slot.available}
                      className={!slot.available ? "opacity-50 cursor-not-allowed" : ""}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={!slot.available ? "line-through" : ""}>
                          {slot.displayText}
                        </span>
                        {!slot.available && (
                          <Badge variant="destructive" className="ms-2 text-xs">
                            {t('form.details.full')}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {formData.time && availableTimeSlots.length > 0 && (
              <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                {(() => {
                  const selectedSlot = availableTimeSlots.find(slot => slot.time === formData.time);
                  if (selectedSlot) {
                    return (
                      <div className="flex items-center justify-between">
                        <span>{t('form.details.selected', { time: selectedSlot.time })}</span>
                        <Badge variant={selectedSlot.available ? "default" : "destructive"}>
                          {selectedSlot.available
                            ? t('form.details.slotAvailability', { available: selectedSlot.availableCount, max: selectedSlot.maxCount })
                            : t('form.details.full')
                          }
                        </Badge>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </>
        )}
      </div>

      {/* Notes */}
      <div>
        <Label htmlFor="notes">{t('form.details.notes')}</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => onFormDataChange({ notes: e.target.value })}
          placeholder={t('form.details.notesPlaceholder')}
          rows={3}
        />
      </div>
    </>
  );
};
