import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { User, ArrowRight } from 'lucide-react';
import { formatTimeDisplay } from '@/lib/timeUtils';

interface StaffTransferModalProps {
  appointment: Appointment | null;
  isOpen: boolean;
  onClose: () => void;
  onTransfer: (appointmentId: string, newStaff: string, reason: string) => void;
  staff: string[];
}

const StaffTransferModal = ({
  appointment,
  isOpen,
  onClose,
  onTransfer,
  staff
}: StaffTransferModalProps) => {
  const { toast } = useToast();
  const [selectedStaff, setSelectedStaff] = useState('');
  const [reason, setReason] = useState('');

  const handleTransfer = () => {
    if (!appointment || !selectedStaff) return;

    onTransfer(appointment.id, selectedStaff, reason);
    toast({
      title: "Appointment Transferred",
      description: `Appointment transferred from ${appointment.staff} to ${selectedStaff}`
    });
    setSelectedStaff('');
    setReason('');
    onClose();
  };

  if (!appointment) return null;

  const availableStaff = staff.filter(member => member !== appointment.staff);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer Appointment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Assignment */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Current Assignment</h4>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-gray-500" />
              <span className="font-medium">{appointment.staff}</span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {formatTimeDisplay(appointment.time)} - {appointment.client} ({appointment.treatment})
            </p>
          </div>

          {/* Transfer To */}
          <div className="flex items-center justify-center">
            <ArrowRight className="h-6 w-6 text-gray-400" />
          </div>

          <div>
            <Label htmlFor="newStaff">Transfer to Staff Member</Label>
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger>
                <SelectValue placeholder="Select staff member" />
              </SelectTrigger>
              <SelectContent>
                {availableStaff.map((member) => (
                  <SelectItem key={member} value={member}>
                    {member}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="reason">Transfer Reason (Optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for transfer..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleTransfer}
            disabled={!selectedStaff}
            className="bg-purple-600 hover:bg-purple-700"
          >
            Transfer Appointment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StaffTransferModal;
