
import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';

interface AppointmentsHeaderProps {
  onNewAppointmentClick: () => void;
  loading: boolean;
}

const AppointmentsHeader = ({ onNewAppointmentClick, loading }: AppointmentsHeaderProps) => {
  const isMobile = useIsMobile();

  return (
    <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:justify-between sm:items-center border-b border-gray-200 dark:border-gray-800 pb-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Appointments</h1>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">
          {loading ? "Loading appointments..." : "Manage and view all appointments"}
        </p>
      </div>
      <div className="flex-shrink-0 w-full sm:w-auto">
        <Button 
          onClick={onNewAppointmentClick}
          className="bg-purple-600 hover:bg-purple-700 w-full sm:w-auto"
          size={isMobile ? "default" : "default"}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Appointment
        </Button>
      </div>
    </div>
  );
};

export default AppointmentsHeader;
