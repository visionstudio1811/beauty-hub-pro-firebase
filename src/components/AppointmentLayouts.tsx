import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Edit, ArrowRightLeft, Clock, User, Scissors } from 'lucide-react';
import { formatTimeDisplay } from '@/lib/timeUtils';
import { safeToLocaleDateString } from '@/lib/safeDateFormatter';

export interface Appointment {
  id: string;
  time: string;
  date: string;
  client: string;
  treatment: string;
  staff: string;
  duration: number;
  status: 'scheduled' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
  phone: string;
  email: string;
  notes: string;
  allergies?: string;
}

interface AppointmentLayoutsProps {
  appointments: Appointment[];
  layoutMode: 'list' | 'grid' | 'calendar';
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onAppointmentClick: (appointment: Appointment) => void;
  onEditClick: (appointment: Appointment) => void;
  onTransferClick: (appointment: Appointment) => void;
  getStatusColor: (status: string) => string;
  getStatusBadge: (status: string) => React.ReactNode;
}

const AppointmentLayouts: React.FC<AppointmentLayoutsProps> = ({
  appointments,
  layoutMode,
  selectedDate,
  onDateSelect,
  onAppointmentClick,
  onEditClick,
  onTransferClick,
  getStatusColor,
  getStatusBadge
}) => {
  // List View
  const ListView = () => (
    <div className="space-y-3 sm:space-y-4 w-full">
      {appointments.map((appointment) => (
        <Card key={appointment.id} className="hover:shadow-md transition-shadow cursor-pointer w-full">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 min-w-0 flex-1">
                <div className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex-shrink-0">
                  {formatTimeDisplay(appointment.time)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-900 dark:text-white truncate">{appointment.client}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 truncate">{appointment.treatment}</div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
                <div className="text-left sm:text-right min-w-0">
                  <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 truncate">
                    {appointment.staff} • {appointment.duration} min
                  </div>
                  <div className="mt-1">
                    {getStatusBadge(appointment.status)}
                  </div>
                </div>
                <div className="flex space-x-2 flex-shrink-0">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditClick(appointment);
                    }} 
                    className="h-9 w-9 sm:h-10 sm:w-10"
                    title="Edit appointment details"
                  >
                    <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onTransferClick(appointment)} className="h-9 w-9 sm:h-10 sm:w-10">
                    <ArrowRightLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  // Grid View
  const GridView = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 w-full">
      {appointments.map((appointment) => (
        <Card key={appointment.id} className="hover:shadow-md transition-shadow cursor-pointer w-full min-w-0">
          <CardHeader className="pb-2 sm:pb-3">
            <div className="flex justify-between items-start">
              <CardTitle className="text-sm sm:text-base truncate pr-2">{appointment.client}</CardTitle>
              <div className="flex-shrink-0">
                {getStatusBadge(appointment.status)}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              <div className="flex items-center text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                <Clock className="h-3 w-3 sm:h-4 sm:w-4 mr-2 flex-shrink-0" />
                <span className="truncate">{formatTimeDisplay(appointment.time)} • {appointment.duration} min</span>
              </div>
              <div className="flex items-center text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                <Scissors className="h-3 w-3 sm:h-4 sm:w-4 mr-2 flex-shrink-0" />
                <span className="truncate">{appointment.treatment}</span>
              </div>
              <div className="flex items-center text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                <User className="h-3 w-3 sm:h-4 sm:w-4 mr-2 flex-shrink-0" />
                <span className="truncate">{appointment.staff}</span>
              </div>
            </div>
            <div className="flex space-x-2 mt-3 sm:mt-4">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={(e) => {
                  e.stopPropagation();
                  onEditClick(appointment);
                }} 
                className="flex-1 h-9 text-xs"
                title="Edit appointment details"
              >
                <Edit className="h-3 w-3 mr-1" />
                <span className="hidden sm:inline">Edit</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => onTransferClick(appointment)} className="flex-1 h-9 text-xs">
                <ArrowRightLeft className="h-3 w-3 mr-1" />
                <span className="hidden sm:inline">Transfer</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  // Modified Calendar View - Mini calendar + List view for selected date
  const CalendarViewLayout = () => {
    const selectedDateAppointments = appointments.filter(apt => 
      apt.date === selectedDate.toISOString().split('T')[0]
    );

    return (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6 w-full">
        <div className="lg:col-span-1 w-full">
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Select Date</CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && onDateSelect(date)}
                className="rounded-md border w-full"
              />
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-3 w-full min-w-0">
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg truncate">
                Appointments for {safeToLocaleDateString(selectedDate)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedDateAppointments.length === 0 ? (
                <div className="text-center py-6 sm:py-8 text-gray-500">
                  <Calendar className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm sm:text-base">No appointments scheduled for this date</p>
                </div>
              ) : (
                <div className="space-y-3 w-full">
                  {selectedDateAppointments.map((appointment) => (
                    <div 
                      key={appointment.id} 
                      className={`p-3 sm:p-4 rounded-lg border-l-4 cursor-pointer transition-all duration-200 hover:shadow-md w-full ${getStatusColor(appointment.status)}`}
                      onClick={() => onAppointmentClick(appointment)}
                    >
                      <div className="flex flex-col space-y-2 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-4 min-w-0 flex-1">
                          <div className="text-sm font-medium text-purple-700 flex-shrink-0">
                            {formatTimeDisplay(appointment.time)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900 truncate">{appointment.client}</p>
                            <p className="text-sm text-gray-600 truncate">{appointment.treatment}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-gray-400" />
                                <span className="text-xs text-gray-500">{appointment.duration} min</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3 text-gray-400" />
                                <span className="text-xs text-gray-500 truncate">{appointment.staff}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="text-left sm:text-right flex-shrink-0">
                          <div className="mb-2">
                            {getStatusBadge(appointment.status)}
                          </div>
                          <div className="flex space-x-1">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditClick(appointment);
                              }} 
                              className="h-8 w-8"
                              title="Edit appointment details"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={(e) => {
                              e.stopPropagation();
                              onTransferClick(appointment);
                            }} className="h-8 w-8">
                              <ArrowRightLeft className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // Switch based on layout mode (timeline view removed)
  switch (layoutMode) {
    case 'grid':
      return <GridView />;
    case 'calendar':
      return <CalendarViewLayout />;
    default:
      return <ListView />;
  }
};

export default AppointmentLayouts;
