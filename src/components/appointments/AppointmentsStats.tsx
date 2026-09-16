
import React from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('appointments');

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalAppointments}</div>
        <div className="text-sm text-gray-600 dark:text-gray-400">{t('stats.total')}</div>
      </div>
      <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
        <div className="text-2xl font-bold text-green-600">{confirmedAppointments}</div>
        <div className="text-sm text-gray-600 dark:text-gray-400">{t('stats.confirmed')}</div>
      </div>
      <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
        <div className="text-2xl font-bold text-blue-600">{scheduledAppointments}</div>
        <div className="text-sm text-gray-600 dark:text-gray-400">{t('stats.scheduled')}</div>
      </div>
      <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
        <div className="text-2xl font-bold text-purple-600">{completedAppointments}</div>
        <div className="text-sm text-gray-600 dark:text-gray-400">{t('stats.completed')}</div>
      </div>
    </div>
  );
};

export default AppointmentsStats;
