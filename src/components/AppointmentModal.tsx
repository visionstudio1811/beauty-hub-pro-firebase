
import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { User, Clock, Phone, Mail, AlertTriangle, Calendar, Trash2 } from 'lucide-react';
import { formatTimeDisplay } from '@/lib/timeUtils';
import { safeFormatters } from '@/lib/safeDateFormatter';

export interface Appointment {
  id: string;
  time: string;
  date: string;
  client: string;
  treatment: string;
  staff: string;
  duration: number;
  status: 'scheduled' | 'confirmed' | 'in-progress' | 'completed' | 'no-show' | 'cancelled';
  phone: string;
  email: string;
  notes: string;
  allergies?: string;
}

interface AppointmentModalProps {
  appointment: Appointment | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (appointmentId: string, newStatus: Appointment['status'], notes?: string) => void;
  onDelete?: (appointmentId: string) => void;
}

const AppointmentModal = ({ appointment, isOpen, onClose, onStatusChange, onDelete }: AppointmentModalProps) => {
  const [notes, setNotes] = useState('');

  if (!appointment) return null;

  const getStatusColor = (status: Appointment['status']) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'in-progress': return 'bg-yellow-100 text-yellow-800';
      case 'completed': return 'bg-purple-100 text-purple-800';
      case 'no-show': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleStatusChange = (newStatus: Appointment['status']) => {
    onStatusChange(appointment.id, newStatus, notes);
    setNotes('');
    onClose();
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(appointment.id);
      onClose();
    }
  };

  const getStatusActions = () => {
    switch (appointment.status) {
      case 'scheduled':
        return (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={() => handleStatusChange('confirmed')} className="bg-green-600 hover:bg-green-700 w-full sm:w-auto">
              Mark as Confirmed
            </Button>
            <Button onClick={() => handleStatusChange('no-show')} variant="destructive" className="w-full sm:w-auto">
              No Show
            </Button>
            <Button onClick={() => handleStatusChange('cancelled')} variant="outline" className="w-full sm:w-auto">
              Cancel
            </Button>
          </div>
        );
      case 'confirmed':
        return (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={() => handleStatusChange('in-progress')} className="bg-yellow-600 hover:bg-yellow-700 w-full sm:w-auto">
              Start Treatment
            </Button>
            <Button onClick={() => handleStatusChange('no-show')} variant="destructive" className="w-full sm:w-auto">
              No Show
            </Button>
          </div>
        );
      case 'in-progress':
        return (
          <Button onClick={() => handleStatusChange('completed')} className="bg-purple-600 hover:bg-purple-700 w-full">
            Complete Treatment
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto mx-4 sm:mx-auto">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center justify-between text-lg md:text-xl">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Appointment Details
            </div>
            {onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Appointment</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this appointment? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:gap-6">
          {/* Status */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <Label className="text-sm font-medium">Status</Label>
            <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(appointment.status)} w-fit`}>
              {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1).replace('-', ' ')}
            </span>
          </div>

          {/* Date and Time Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <div>
                <Label className="text-sm font-medium text-gray-600">Date</Label>
                <p className="font-medium">{safeFormatters.shortDate(appointment.date)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <div>
                <Label className="text-sm font-medium text-gray-600">Time</Label>
                <p className="font-medium">{formatTimeDisplay(appointment.time)} ({appointment.duration} min)</p>
              </div>
            </div>
          </div>

          {/* Client Information */}
          <div>
            <Label className="text-sm font-medium text-gray-600">Client</Label>
            <p className="text-lg font-semibold">{appointment.client}</p>
          </div>

          {/* Contact Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-gray-500" />
              <div>
                <Label className="text-sm font-medium text-gray-600">Phone</Label>
                <p className="font-medium">{appointment.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gray-500" />
              <div>
                <Label className="text-sm font-medium text-gray-600">Email</Label>
                <p className="font-medium break-all">{appointment.email}</p>
              </div>
            </div>
          </div>

          {/* Treatment Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-gray-600">Treatment</Label>
              <p className="font-medium">{appointment.treatment}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-600">Staff</Label>
              <p className="font-medium">{appointment.staff}</p>
            </div>
          </div>

          {/* Allergies/Alerts */}
          {appointment.allergies && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <Label className="text-sm font-medium text-red-800">Allergies/Medical Alerts</Label>
              </div>
              <p className="text-sm text-red-700">{appointment.allergies}</p>
            </div>
          )}

          {/* Current Notes */}
          {appointment.notes && (
            <div>
              <Label className="text-sm font-medium text-gray-600">Current Notes</Label>
              <p className="text-sm text-gray-800 mt-1 p-3 bg-gray-50 rounded">{appointment.notes}</p>
            </div>
          )}

          {/* Add Notes */}
          <div>
            <Label htmlFor="notes" className="text-sm font-medium text-gray-600">Add Notes</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
              rows={3}
              placeholder="Add any notes about this appointment..."
            />
          </div>
        </div>

        <DialogFooter className="flex flex-col gap-2 pt-4">
          <div className="w-full">
            {getStatusActions()}
          </div>
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AppointmentModal;
