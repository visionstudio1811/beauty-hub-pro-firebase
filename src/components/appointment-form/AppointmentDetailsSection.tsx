
import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Treatment {
  id: string;
  name: string;
  duration: number;
  price?: number;
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
}

interface AppointmentDetailsSectionProps {
  selectedDate: Date;
  onDateChange: (date: Date | undefined) => void;
  formData: AppointmentFormData;
  onFormDataChange: (updates: Partial<AppointmentFormData>) => void;
  availableTreatments: Treatment[];
  staffProfiles: StaffProfile[];
  availableTimeSlots: TimeSlot[];
  selectedPackage: any;
  onTimeChange: (value: string) => void;
  loading: {
    treatments: boolean;
    staff: boolean;
    businessHours: boolean;
    schedulingConfig: boolean;
  };
}

export const AppointmentDetailsSection: React.FC<AppointmentDetailsSectionProps> = ({
  selectedDate,
  onDateChange,
  formData,
  onFormDataChange,
  availableTreatments,
  staffProfiles,
  availableTimeSlots,
  selectedPackage,
  onTimeChange,
  loading
}) => {
  // Count available vs total slots for display
  const availableSlotCount = availableTimeSlots.filter(slot => slot.available).length;
  const totalSlotCount = availableTimeSlots.length;

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
            onValueChange={(value) => onFormDataChange({ treatmentId: value, time: '' })}
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
              {staffProfiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.full_name || profile.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Time Slot Selection with Enhanced Feedback */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label htmlFor="time">Available Time Slots</Label>
          {formData.staffId && formData.treatmentId && !loading.businessHours && !loading.schedulingConfig && (
            <div className="text-sm text-muted-foreground">
              {availableSlotCount > 0 ? (
                <span className="text-green-600">{availableSlotCount}/{totalSlotCount} slots available</span>
              ) : (
                <span className="text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  No slots available
                </span>
              )}
            </div>
          )}
        </div>
        
        <Select 
          value={formData.time} 
          onValueChange={onTimeChange}
          disabled={!formData.staffId || !formData.treatmentId || loading.businessHours || loading.schedulingConfig}
        >
          <SelectTrigger>
            <SelectValue placeholder={
              loading.businessHours || loading.schedulingConfig ? "Loading..." :
              !formData.staffId || !formData.treatmentId ? "Select treatment and staff first" :
              availableSlotCount === 0 ? "No available slots for this date" :
              "Select available time"
            } />
          </SelectTrigger>
          <SelectContent>
            {availableTimeSlots.length === 0 ? (
              <SelectItem value="no-slots" disabled>
                {loading.businessHours || loading.schedulingConfig 
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
        
        {/* Additional availability info */}
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
