
import React from 'react';
import { Clock, Phone } from 'lucide-react';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Appointment } from '../AppointmentModal';
import { formatTimeDisplay } from '@/lib/timeUtils';
import { safeFormatters } from '@/lib/safeDateFormatter';

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
  
  const renderListView = () => (
    <div className="space-y-4">
      {appointments.map((appointment) => (
        <div 
          key={appointment.id} 
          className={`p-4 rounded-lg border-l-4 cursor-pointer transition-all duration-200 hover:shadow-md ${getStatusColor(appointment.status)}`}
          onClick={() => onAppointmentClick(appointment)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-sm font-medium text-purple-700">
                {formatTimeDisplay(appointment.time)}
              </div>
              <div>
                <p className="font-medium text-gray-900">{appointment.client}</p>
                <p className="text-sm text-gray-600">{appointment.treatment}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="h-3 w-3 text-gray-400" />
                  <span className="text-xs text-gray-500">{appointment.duration} min</span>
                  <Phone className="h-3 w-3 text-gray-400 ml-2" />
                  <span className="text-xs text-gray-500">{appointment.phone}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
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
          className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 hover:shadow-lg ${getStatusColor(appointment.status).replace('border-l-', 'border-')}`}
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
              <span>{appointment.duration} min</span>
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
        />
      </div>
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900 mb-3">
          Appointments for {safeFormatters.shortDate(selectedDate)}
        </h4>
        {appointments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No appointments for this date</p>
          </div>
        ) : (
          appointments.map((appointment) => (
            <div 
              key={appointment.id} 
              className={`p-3 rounded-lg border-l-4 cursor-pointer transition-all duration-200 hover:shadow-md ${getStatusColor(appointment.status)}`}
              onClick={() => onAppointmentClick(appointment)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-purple-700">{formatTimeDisplay(appointment.time)}</span>
                    <span className="text-sm font-medium text-gray-900">{appointment.client}</span>
                  </div>
                  <p className="text-xs text-gray-600">{appointment.treatment} ({appointment.duration} min)</p>
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
