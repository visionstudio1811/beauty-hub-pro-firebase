
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Appointment } from './AppointmentModal';
import { formatTimeDisplay } from '@/lib/timeUtils';

interface AppointmentEditModalProps {
  appointment: Appointment | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (appointment: Appointment) => void;
  staff: string[];
  treatments: string[];
}

const AppointmentEditModal = ({
  appointment,
  isOpen,
  onClose,
  onSave,
  staff,
  treatments
}: AppointmentEditModalProps) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    time: '',
    date: '',
    client: '',
    treatment: '',
    staff: '',
    duration: 60,
    phone: '',
    email: '',
    notes: ''
  });

  useEffect(() => {
    if (appointment) {
      setFormData({
        time: formatTimeDisplay(appointment.time),
        date: appointment.date || new Date().toISOString().split('T')[0],
        client: appointment.client,
        treatment: appointment.treatment,
        staff: appointment.staff,
        duration: appointment.duration,
        phone: appointment.phone,
        email: appointment.email,
        notes: appointment.notes
      });
    }
  }, [appointment]);

  const handleSave = () => {
    if (!appointment) return;

    // Validate required fields
    if (!formData.client || !formData.phone || !formData.treatment || !formData.staff || !formData.date || !formData.time) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields (client name, phone, treatment, staff, date, and time).",
        variant: "destructive"
      });
      return;
    }

    // Validate email format if provided
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid email address.",
        variant: "destructive"
      });
      return;
    }

    // Validate phone format
    if (!/^[\d\s\-\+\(\)]+$/.test(formData.phone)) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid phone number.",
        variant: "destructive"
      });
      return;
    }

    // Validate duration
    if (formData.duration < 15 || formData.duration > 480) {
      toast({
        title: "Validation Error",
        description: "Duration must be between 15 and 480 minutes.",
        variant: "destructive"
      });
      return;
    }

    const updatedAppointment: Appointment = {
      ...appointment,
      time: formData.time,
      date: formData.date,
      client: formData.client,
      treatment: formData.treatment,
      staff: formData.staff,
      duration: formData.duration,
      phone: formData.phone,
      email: formData.email,
      notes: formData.notes
    };

    onSave(updatedAppointment);
    toast({
      title: "Appointment Updated",
      description: "The appointment has been successfully updated."
    });
    onClose();
  };

  if (!appointment) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto mx-4 sm:mx-auto">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-lg md:text-xl">Edit Appointment</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date" className="text-sm font-medium">Date *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time" className="text-sm font-medium">Time *</Label>
              <Input
                id="time"
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                className="w-full"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client" className="text-sm font-medium">Client Name *</Label>
            <Input
              id="client"
              value={formData.client}
              onChange={(e) => setFormData({ ...formData, client: e.target.value })}
              className="w-full"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="treatment" className="text-sm font-medium">Treatment *</Label>
              <Select value={formData.treatment} onValueChange={(value) => setFormData({ ...formData, treatment: value })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select treatment" />
                </SelectTrigger>
                <SelectContent>
                  {treatments.map((treatment) => (
                    <SelectItem key={treatment} value={treatment}>
                      {treatment}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff" className="text-sm font-medium">Staff *</Label>
              <Select value={formData.staff} onValueChange={(value) => setFormData({ ...formData, staff: value })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((member) => (
                    <SelectItem key={member} value={member}>
                      {member}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration" className="text-sm font-medium">Duration (minutes) *</Label>
            <Input
              id="duration"
              type="number"
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 60 })}
              className="w-full"
              min="15"
              max="480"
              step="15"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-medium">Phone *</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full"
                placeholder="(123) 456-7890"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full"
                placeholder="client@example.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm font-medium">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full resize-none"
              placeholder="Add notes about this appointment..."
            />
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-4">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button onClick={handleSave} className="w-full sm:w-auto">
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AppointmentEditModal;
