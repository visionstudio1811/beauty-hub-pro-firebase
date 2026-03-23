
import React from 'react';
import { Appointment } from '../components/AppointmentModal';
import { StatusBadge } from '@/components/ui/status-badge';

export const useAppointmentStatus = () => {
  const getStatusColor = (status: Appointment['status']) => {
    switch (status) {
      case 'scheduled':   return 'border-l-[hsl(231_97%_68%)] bg-[hsl(231_97%_68%/0.05)] dark:bg-[hsl(231_97%_68%/0.08)]';
      case 'confirmed':   return 'border-l-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20';
      case 'in-progress': return 'border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/20';
      case 'completed':   return 'border-l-blue-500 bg-blue-50/60 dark:bg-blue-950/20';
      case 'no-show':     return 'border-l-orange-500 bg-orange-50/60 dark:bg-orange-950/20';
      case 'cancelled':   return 'border-l-slate-400 bg-slate-50/60 dark:bg-slate-800/20';
      default:            return 'border-l-slate-400 bg-slate-50/60 dark:bg-slate-800/20';
    }
  };

  const getStatusBadge = (status: Appointment['status']) => (
    <StatusBadge status={status} variant="appointment" />
  );

  return {
    getStatusColor,
    getStatusBadge
  };
};
