
import React from 'react';
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
        <Label htmlFor="date">Appointment Date</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !selectedDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
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
          <Label htmlFor="treatment">Treatment</Label>
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
              <SelectValue placeholder={loading.treatments ? "Loading treatments..." : "Select treatment"} />
            </SelectTrigger>
            <SelectContent>
              {availableTreatments.map((treatment) => (
                <SelectItem key={treatment.id} value={treatment.id}>
                  <div className="flex items-center justify-between w-full">
                    <span>{treatment.name} ({treatment.duration} min)</span>
                    {selectedPackage ? (
                      <Badge variant="default" className="ml-2 bg-green-100 text-green-800">
                        FREE
                      </Badge>
                    ) : (
                      treatment.price && (
                        <span className="ml-2 text-sm text-gray-600">
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
              No treatments available for the selected package
            </p>
          )}
          {formData.treatmentId && addonsTotalDuration > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Total time with add-ons: {totalDuration} min
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="staff">Staff Member</Label>
          <Select
            value={formData.staffId}
            onValueChange={(value) => onFormDataChange({ staffId: value, time: '' })}
            disabled={loading.staff}
          >
            <SelectTrigger>
              <SelectValue placeholder={loading.staff ? "Loading..." : "Select staff"} />
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
              No eligible staff for this treatment. Update the treatment's "Staff who can perform this" list in Settings.
            </p>
          )}
        </div>
      </div>

      {/* Add-ons */}
      {availableAddons.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Add-ons (optional)</Label>
            {selectedPackage && (
              <span className="text-xs text-muted-foreground">
                Package sessions include one add-on max
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
                    <Badge variant="secondary" className="text-xs">+${addon.price}</Badge>
                    {addon.duration_minutes && addon.duration_minutes > 0 ? (
                      <Badge variant="outline" className="text-xs">+{addon.duration_minutes} min</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">No extra time</Badge>
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
              ? `Package session — treatment free, add-ons $${addonsTotalPrice.toFixed(2)}`
              : 'Package session — no additional charge'}
          </div>
        )
      ) : (
        <div>
          <Label>Treatment Price ($)</Label>
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
              + ${addonsTotalPrice.toFixed(2)} in add-ons. Total: $
              {((parseFloat(formData.price) || 0) + addonsTotalPrice).toFixed(2)}
            </p>
          )}
        </div>
      )}

      {/* Time selection — slot picker (default) or custom time override */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label htmlFor="time">{useCustomTime ? 'Custom Time' : 'Available Time Slots'}</Label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Custom time</span>
            <Switch
              checked={useCustomTime}
              onCheckedChange={(v) => {
                setUseCustomTime(v);
                // Clear the other side's value when switching modes
                if (v) onFormDataChange({ time: '' });
                else setCustomTime('');
              }}
              aria-label="Toggle custom time"
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
              Bypasses schedule + advance-booking rules. Use for walk-ins, VIPs, or after-hours bookings.
            </p>
            {customTimeConflict && (
              <div className="mt-2 p-2 rounded border border-amber-300 bg-amber-50 text-sm text-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  Overlaps an existing appointment at {customTimeConflict.appointment_time}
                  &ndash;{customTimeConflict.appointment_end}. You can book anyway.
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
                    <span className="text-green-600">{availableSlotCount}/{totalSlotCount} slots available</span>
                  ) : (
                    <span className="text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      No slots available — flip the "Custom time" toggle to override
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
                  loading.businessHours || loading.slots ? "Loading..." :
                  !formData.staffId || !formData.treatmentId ? "Select treatment and staff first" :
                  availableSlotCount === 0 ? "No available slots for this date" :
                  "Select available time"
                } />
              </SelectTrigger>
              <SelectContent>
                {availableTimeSlots.length === 0 ? (
                  <SelectItem value="no-slots" disabled>
                    {loading.businessHours || loading.slots
                      ? "Loading time slots..."
                      : !formData.staffId || !formData.treatmentId
                      ? "Select treatment and staff first"
                      : "No available slots for this date"}
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
                          <Badge variant="destructive" className="ml-2 text-xs">
                            FULL
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
                        <span>Selected: {selectedSlot.time}</span>
                        <Badge variant={selectedSlot.available ? "default" : "destructive"}>
                          {selectedSlot.available
                            ? `${selectedSlot.availableCount}/${selectedSlot.maxCount} available`
                            : "FULL"
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
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => onFormDataChange({ notes: e.target.value })}
          placeholder="Any special notes or requirements..."
          rows={3}
        />
      </div>
    </>
  );
};
