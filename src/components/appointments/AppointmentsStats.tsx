
import React from 'react';

interface AppointmentsStatsProps {
  totalAppointments: number;
  confirmedAppointments: number;
  scheduledAppointments: number;
  completedAppointments: number;
}

const AppointmentsStats = ({
  totalAppointments,
  confirmedAppointments,
  scheduledAppointments,
  completedAppointments
}: AppointmentsStatsProps) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalAppointments}</div>
        <div className="text-sm text-gray-600 dark:text-gray-400">Total Appointments</div>
      </div>
      <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
        <div className="text-2xl font-bold text-green-600">{confirmedAppointments}</div>
        <div className="text-sm text-gray-600 dark:text-gray-400">Confirmed</div>
      </div>
      <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
        <div className="text-2xl font-bold text-blue-600">{scheduledAppointments}</div>
        <div className="text-sm text-gray-600 dark:text-gray-400">Scheduled</div>
      </div>
      <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
        <div className="text-2xl font-bold text-purple-600">{completedAppointments}</div>
        <div className="text-sm text-gray-600 dark:text-gray-400">Completed</div>
      </div>
    </div>
  );
};

export default AppointmentsStats;
