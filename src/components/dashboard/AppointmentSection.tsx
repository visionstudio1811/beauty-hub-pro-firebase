import React from 'react';
import { Calendar, LayoutList, Grid3x3, CalendarX } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Appointment } from '../AppointmentModal';
import { AppointmentViews } from './AppointmentViews';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatInBusinessTime } from '@/lib/timeUtils';
import { sanitizeString } from '@/lib/dataSanitization';

interface AppointmentSectionProps {
  appointments: Appointment[];
  viewMode: 'list' | 'grid' | 'calendar';
  selectedDate: Date;
  onViewModeChange: (mode: 'list' | 'grid' | 'calendar') => void;
  onDateSelect: (date: Date) => void;
  onAppointmentClick: (appointment: Appointment) => void;
  getStatusColor: (status: Appointment['status']) => string;
  getStatusBadge: (status: Appointment['status']) => JSX.Element;
}

const AppointmentSection = ({
  appointments,
  viewMode,
  selectedDate,
  onViewModeChange,
  onDateSelect,
  onAppointmentClick,
  getStatusColor,
  getStatusBadge
}: AppointmentSectionProps) => {
  const isMobile = useIsMobile();
  
  const views = AppointmentViews({
    appointments,
    selectedDate,
    onDateSelect,
    onAppointmentClick,
    getStatusColor,
    getStatusBadge
  });

  const renderAppointmentContent = () => {
    // Show empty state if no appointments
    if (appointments.length === 0) {
      const isToday = selectedDate.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
      
      return (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
          <CalendarX className="h-16 w-16 mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">
            No appointments {isToday ? 'today' : `for ${formatInBusinessTime(selectedDate, 'MMMM d, yyyy')}`}
          </h3>
          <p className="text-sm text-center max-w-md">
            {isToday 
              ? "You don't have any appointments scheduled for today. Create a new appointment to get started."
              : "No appointments are scheduled for this date. Try selecting a different date or create a new appointment."
            }
          </p>
        </div>
      );
    }

    switch (viewMode) {
      case 'grid':
        return views.renderGridView();
      case 'calendar':
        return views.renderCalendarView();
      default:
        return views.renderListView();
    }
  };

  // Use safe date formatting with sanitization
  const selectedDateFormatted = sanitizeString(
    formatInBusinessTime(selectedDate, 'MMMM d, yyyy'),
    'Invalid Date'
  );
  const isToday = selectedDate.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 w-full">
      <div className="p-3 sm:p-4 lg:p-6 border-b border-gray-200 dark:border-gray-800">
        <div className="flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 truncate">
              {isToday ? "Today's Appointments" : `Appointments - ${selectedDateFormatted}`}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {appointments.length > 0 
                ? `${appointments.length} appointment${appointments.length !== 1 ? 's' : ''} scheduled`
                : isMobile ? "Tap + to add appointment" : "Click + to add an appointment"
              }
            </p>
          </div>
          
          <div className="flex justify-center sm:justify-end">
            <ToggleGroup 
              type="single" 
              value={viewMode} 
              onValueChange={(value) => value && onViewModeChange(value as 'list' | 'grid' | 'calendar')}
              className="border border-gray-200 dark:border-gray-600 rounded-md"
            >
              <ToggleGroupItem 
                value="list" 
                aria-label="List view" 
                size="sm"
                className="h-9 w-9 sm:h-10 sm:w-10"
              >
                <LayoutList className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="grid" 
                aria-label="Grid view" 
                size="sm"
                className="h-9 w-9 sm:h-10 sm:w-10"
              >
                <Grid3x3 className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="calendar" 
                aria-label="Calendar view" 
                size="sm"
                className="h-9 w-9 sm:h-10 sm:w-10"
              >
                <Calendar className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>
      
      <div className="p-3 sm:p-4 lg:p-6">
        <div className="w-full overflow-hidden">
          {renderAppointmentContent()}
        </div>
      </div>
    </div>
  );
};

export default AppointmentSection;
