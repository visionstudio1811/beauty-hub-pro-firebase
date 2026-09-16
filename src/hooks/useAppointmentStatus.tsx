
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Appointment } from '../components/AppointmentModal';
import { StatusBadge } from '@/components/ui/status-badge';

const STATUS_KEYS: Record<string, string> = {
  scheduled: 'scheduled',
  confirmed: 'confirmed',
  'in-progress': 'inProgress',
  completed: 'completed',
  cancelled: 'cancelled',
  'no-show': 'noShow',
};

export const useAppointmentStatus = () => {
  const { t } = useTranslation('appointments');
  const statusLabel = (status: string) => {
    const key = STATUS_KEYS[status];
    return key ? t(`status.${key}`) : status;
  };
  const getStatusColor = (status: Appointment['status']) => {
    switch (status) {
      case 'scheduled':   return 'border-s-[hsl(231_97%_68%)] bg-[hsl(231_97%_68%/0.05)] dark:bg-[hsl(231_97%_68%/0.08)]';
      case 'confirmed':   return 'border-s-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20';
      case 'in-progress': return 'border-s-amber-500 bg-amber-50/60 dark:bg-amber-950/20';
      case 'completed':   return 'border-s-blue-500 bg-blue-50/60 dark:bg-blue-950/20';
      case 'no-show':     return 'border-s-orange-500 bg-orange-50/60 dark:bg-orange-950/20';
      case 'cancelled':   return 'border-s-slate-400 bg-slate-50/60 dark:bg-slate-800/20';
      default:            return 'border-s-slate-400 bg-slate-50/60 dark:bg-slate-800/20';
    }
  };

  const getStatusBadge = (status: Appointment['status']) => (
    <StatusBadge status={status} variant="appointment" label={statusLabel(status)} />
  );

  return {
    getStatusColor,
    getStatusBadge,
    statusLabel,
  };
};
