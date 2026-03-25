
import React from 'react';
import { Calendar, Users, Package, CheckCircle2 } from 'lucide-react';

interface StatsData {
  appointments: number;
  newClients: number;
  activePackages: number;
  pendingReviews: number;
}

interface DashboardStatsProps {
  stats: StatsData;
}

const STAT_ITEMS = [
  {
    key: 'appointments' as const,
    label: "Today's Appointments",
    icon: Calendar,
    accent: 'border-[hsl(231_97%_68%)]',
    iconBg: 'bg-[hsl(231_97%_68%/0.1)]',
    iconColor: 'text-[hsl(231_97%_68%)]',
  },
  {
    key: 'newClients' as const,
    label: 'New Clients',
    icon: Users,
    accent: 'border-emerald-500',
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    key: 'activePackages' as const,
    label: 'Active Members',
    icon: Package,
    accent: 'border-violet-500',
    iconBg: 'bg-violet-50 dark:bg-violet-950/30',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    key: 'pendingReviews' as const,
    label: 'Confirmed Today',
    icon: CheckCircle2,
    accent: 'border-amber-500',
    iconBg: 'bg-amber-50 dark:bg-amber-950/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
];

const DashboardStats = ({ stats }: DashboardStatsProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {STAT_ITEMS.map(({ key, label, icon: Icon, accent, iconBg, iconColor }) => (
        <div
          key={key}
          className={`bg-card border border-border rounded-lg p-5 border-l-4 ${accent} shadow-sm hover:shadow-md transition-shadow duration-200`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                {label}
              </p>
              <p className="text-3xl font-bold text-foreground tabular-nums">
                {stats[key]}
              </p>
            </div>
            <div className={`p-2.5 rounded-lg ${iconBg}`}>
              <Icon className={`h-5 w-5 ${iconColor}`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default DashboardStats;
