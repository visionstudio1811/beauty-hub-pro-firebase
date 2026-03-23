import React from 'react';
import { cn } from '@/lib/utils';

type AppointmentStatus = 'confirmed' | 'completed' | 'cancelled' | 'pending' | 'no-show' | string;
type ClientStatus = 'Have Membership' | "Don't Have Membership" | string;

const APPOINTMENT_STYLES: Record<string, string> = {
  confirmed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800',
  completed:  'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:ring-blue-800',
  cancelled:  'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-800',
  'no-show':  'bg-orange-50 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:ring-orange-800',
  pending:    'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800',
};

const CLIENT_STYLES: Record<string, string> = {
  'Have Membership':       'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800',
  "Don't Have Membership": 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:ring-slate-700',
};

const FALLBACK = 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:ring-slate-700';

interface StatusBadgeProps {
  status: AppointmentStatus | ClientStatus;
  variant?: 'appointment' | 'client';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  variant = 'appointment',
  className,
}) => {
  const map = variant === 'client' ? CLIENT_STYLES : APPOINTMENT_STYLES;
  const styles = map[status] ?? FALLBACK;

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        styles,
        className
      )}
    >
      {status}
    </span>
  );
};
