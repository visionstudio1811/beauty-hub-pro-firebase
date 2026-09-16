
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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

export interface AppointmentAddonView {
  addon_id?: string;
  name?: string;
  price?: number;
  duration_minutes?: number;
}

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
  addons?: AppointmentAddonView[];
  addons_total_price?: number;
  addons_total_duration?: number;
  acuity_appointment_id?: string | null;
  sync_status?: string;
  confirmed_via?: 'sms' | 'email' | 'staff';
  cancellation_requested?: boolean;
  reschedule_requested?: boolean;
}

interface AppointmentModalProps {
  appointment: Appointment | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (appointmentId: string, newStatus: Appointment['status'], notes?: string) => void;
  onDelete?: (appointmentId: string) => void;
}

// Acuity sync_status enum -> translation key under appointments:syncStatus.*
const SYNC_STATUS_KEYS: Record<string, string> = {
  pending: 'pending',
  synced: 'synced',
  failed: 'failed',
  skipped: 'skipped',
};

// Firestore status enum -> translation key under appointments:status.*
const STATUS_KEYS: Record<Appointment['status'], string> = {
  scheduled: 'scheduled',
  confirmed: 'confirmed',
  'in-progress': 'inProgress',
  completed: 'completed',
  'no-show': 'noShow',
  cancelled: 'cancelled',
};

const AppointmentModal = ({ appointment, isOpen, onClose, onStatusChange, onDelete }: AppointmentModalProps) => {
  const [notes, setNotes] = useState('');
  const { t } = useTranslation('appointments');

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

  const statusLabel = (status: Appointment['status']) =>
    STATUS_KEYS[status]
      ? t(`status.${STATUS_KEYS[status]}`)
      : String(status).charAt(0).toUpperCase() + String(status).slice(1).replace('-', ' ');

  const syncStatusLabel = (status: string) =>
    SYNC_STATUS_KEYS[status] ? t(`syncStatus.${SYNC_STATUS_KEYS[status]}`) : status;

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
              {t('modal.actions.markConfirmed')}
            </Button>
            <Button onClick={() => handleStatusChange('no-show')} variant="destructive" className="w-full sm:w-auto">
              {t('modal.actions.noShow')}
            </Button>
            <Button onClick={() => handleStatusChange('cancelled')} variant="outline" className="w-full sm:w-auto">
              {t('modal.actions.cancel')}
            </Button>
          </div>
        );
      case 'confirmed':
        return (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={() => handleStatusChange('in-progress')} className="bg-yellow-600 hover:bg-yellow-700 w-full sm:w-auto">
              {t('modal.actions.startTreatment')}
            </Button>
            <Button onClick={() => handleStatusChange('no-show')} variant="destructive" className="w-full sm:w-auto">
              {t('modal.actions.noShow')}
            </Button>
          </div>
        );
      case 'in-progress':
        return (
          <Button onClick={() => handleStatusChange('completed')} className="bg-purple-600 hover:bg-purple-700 w-full">
            {t('modal.actions.completeTreatment')}
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
              {t('modal.title')}
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
                    <AlertDialogTitle>{t('modal.deleteTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('modal.deleteDescription')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                      {t('common:actions.delete')}
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
            <Label className="text-sm font-medium">{t('modal.status')}</Label>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(appointment.status)} w-fit`}>
                {statusLabel(appointment.status)}
              </span>
              {appointment.acuity_appointment_id && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-800">
                  Acuity
                </span>
              )}
              {appointment.sync_status && appointment.sync_status !== 'synced' && appointment.sync_status !== 'skipped' && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                    appointment.sync_status === 'failed'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                  title={t('modal.acuitySyncTitle', { status: syncStatusLabel(appointment.sync_status) })}
                >
                  {t('modal.sync', { status: syncStatusLabel(appointment.sync_status) })}
                </span>
              )}
              {appointment.confirmed_via && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800">
                  {t('modal.confirmedVia', { via: t(`modal.via.${appointment.confirmed_via}`) })}
                </span>
              )}
              {appointment.cancellation_requested && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">
                  {t('modal.cancellationRequested')}
                </span>
              )}
              {appointment.reschedule_requested && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800">
                  {t('modal.rescheduleRequested')}
                </span>
              )}
            </div>
          </div>

          {/* Date and Time Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <div>
                <Label className="text-sm font-medium text-gray-600">{t('modal.date')}</Label>
                <p className="font-medium">{safeFormatters.shortDate(appointment.date)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <div>
                <Label className="text-sm font-medium text-gray-600">{t('modal.time')}</Label>
                <p className="font-medium">{formatTimeDisplay(appointment.time)} ({t('durationMin', { count: appointment.duration })})</p>
              </div>
            </div>
          </div>

          {/* Client Information */}
          <div>
            <Label className="text-sm font-medium text-gray-600">{t('modal.client')}</Label>
            <p className="text-lg font-semibold">{appointment.client}</p>
          </div>

          {/* Contact Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-gray-500" />
              <div>
                <Label className="text-sm font-medium text-gray-600">{t('modal.phone')}</Label>
                <p className="font-medium"><span dir="ltr" className="ltr-inline">{appointment.phone}</span></p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gray-500" />
              <div>
                <Label className="text-sm font-medium text-gray-600">{t('modal.email')}</Label>
                <p className="font-medium break-all"><span dir="ltr" className="ltr-inline">{appointment.email}</span></p>
              </div>
            </div>
          </div>

          {/* Treatment Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-gray-600">{t('modal.treatment')}</Label>
              <p className="font-medium">{appointment.treatment}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-600">{t('modal.staff')}</Label>
              <p className="font-medium">{appointment.staff}</p>
            </div>
          </div>

          {/* Add-ons */}
          {appointment.addons && appointment.addons.length > 0 && (
            <div>
              <Label className="text-sm font-medium text-gray-600">{t('modal.addons')}</Label>
              <ul className="mt-1 space-y-0.5">
                {appointment.addons.map((a, i) => (
                  <li key={a.addon_id ?? i} className="text-sm flex items-center justify-between">
                    <span>{a.name || t('modal.addon')}</span>
                    <span className="text-muted-foreground" dir="ltr">
                      +${(a.price ?? 0).toFixed(2)}
                      {a.duration_minutes ? ` · +${t('durationMin', { count: a.duration_minutes })}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Allergies/Alerts */}
          {appointment.allergies && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <Label className="text-sm font-medium text-red-800">{t('modal.allergies')}</Label>
              </div>
              <p className="text-sm text-red-700">{appointment.allergies}</p>
            </div>
          )}

          {/* Current Notes */}
          {appointment.notes && (
            <div>
              <Label className="text-sm font-medium text-gray-600">{t('modal.currentNotes')}</Label>
              <p className="text-sm text-gray-800 mt-1 p-3 bg-gray-50 rounded">{appointment.notes}</p>
            </div>
          )}

          {/* Add Notes */}
          <div>
            <Label htmlFor="notes" className="text-sm font-medium text-gray-600">{t('modal.addNotes')}</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
              rows={3}
              placeholder={t('modal.notesPlaceholder')}
            />
          </div>
        </div>

        <DialogFooter className="flex flex-col gap-2 pt-4">
          <div className="w-full">
            {getStatusActions()}
          </div>
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            {t('common:actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AppointmentModal;
