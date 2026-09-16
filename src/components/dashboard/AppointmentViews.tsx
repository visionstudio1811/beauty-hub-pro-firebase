
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Phone } from 'lucide-react';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Appointment } from '../AppointmentModal';
import { formatTimeDisplay } from '@/lib/timeUtils';
import { safeFormatters } from '@/lib/safeDateFormatter';
import { getDateFnsLocale } from '@/i18n/dateLocale';

// useAppointmentStatus.getStatusColor already returns logical `border-s-*`
// classes; this only normalises any legacy `border-l-*` value defensively so
// the accent bar always sits on the start edge in RTL.
const toStartBorder = (classes: string) => classes.replace(/\bborder-l-/g, 'border-s-');
// Grid view uses a full border instead of an accent bar.
const toFullBorder = (classes: string) => classes.replace(/\bborder-[ls]-/g, 'border-');

interface AppointmentViewsProps {
  appointments: Appointment[];
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onAppointmentClick: (appointment: Appointment) => void;
  getStatusColor: (status: Appointment['status']) => string;
  getStatusBadge: (status: Appointment['status']) => JSX.Element;
}

export const AppointmentViews = ({
  appointments,
  selectedDate,
  onDateSelect,
  onAppointmentClick,
  getStatusColor,
  getStatusBadge
}: AppointmentViewsProps) => {
  const { t } = useTranslation('dashboard');
  const renderListView = () => (
    <div className="space-y-4">
      {appointments.map((appointment) => (
        <div 
          key={appointment.id} 
          className={`p-4 rounded-lg border-s-4 cursor-pointer transition-all duration-200 hover:shadow-md ${toStartBorder(getStatusColor(appointment.status))}`}
          onClick={() => onAppointmentClick(appointment)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 rtl:space-x-reverse">
              <div className="text-sm font-medium text-purple-700">
                {formatTimeDisplay(appointment.time)}
              </div>
              <div>
                <p className="font-medium text-gray-900">{appointment.client}</p>
                <p className="text-sm text-gray-600">{appointment.treatment}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="h-3 w-3 text-gray-400" />
                  <span className="text-xs text-gray-500">{t('appointmentViews.minutes', { count: appointment.duration })}</span>
                  <Phone className="h-3 w-3 text-gray-400 ms-2" />
                  <span className="text-xs text-gray-500 ltr-inline">{appointment.phone}</span>
                </div>
              </div>
            </div>
            <div className="text-end">
              {getStatusBadge(appointment.status)}
              <p className="text-sm text-gray-500 mt-1">{appointment.staff}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderGridView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {appointments.map((appointment) => (
        <div 
          key={appointment.id} 
          className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 hover:shadow-lg ${toFullBorder(getStatusColor(appointment.status))}`}
          onClick={() => onAppointmentClick(appointment)}
        >
          <div className="flex justify-between items-start mb-2">
            <div className="text-lg font-semibold text-purple-700">{formatTimeDisplay(appointment.time)}</div>
            {getStatusBadge(appointment.status)}
          </div>
          <h3 className="font-medium text-gray-900 mb-1">{appointment.client}</h3>
          <p className="text-sm text-gray-600 mb-2">{appointment.treatment}</p>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{t('appointmentViews.minutes', { count: appointment.duration })}</span>
            </div>
            <span>{appointment.staff}</span>
          </div>
        </div>
      ))}
    </div>
  );

  const renderCalendarView = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <CalendarComponent
          mode="single"
          selected={selectedDate}
          onSelect={(date) => date && onDateSelect(date)}
          className="rounded-md border pointer-events-auto"
          locale={getDateFnsLocale()}
        />
      </div>
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900 mb-3">
          {t('appointmentViews.appointmentsFor', { date: safeFormatters.shortDate(selectedDate) })}
        </h4>
        {appointments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>{t('appointmentViews.noAppointmentsForDate')}</p>
          </div>
        ) : (
          appointments.map((appointment) => (
            <div 
              key={appointment.id} 
              className={`p-3 rounded-lg border-s-4 cursor-pointer transition-all duration-200 hover:shadow-md ${toStartBorder(getStatusColor(appointment.status))}`}
              onClick={() => onAppointmentClick(appointment)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-purple-700">{formatTimeDisplay(appointment.time)}</span>
                    <span className="text-sm font-medium text-gray-900">{appointment.client}</span>
                  </div>
                  <p className="text-xs text-gray-600">{appointment.treatment} ({t('appointmentViews.minutes', { count: appointment.duration })})</p>
                </div>
                {getStatusBadge(appointment.status)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return {
    renderListView,
    renderGridView,
    renderCalendarView
  };
};
