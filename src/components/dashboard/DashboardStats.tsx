import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Users, Package, CheckCircle2, DollarSign } from 'lucide-react';

interface StatsData {
  appointments: number;
  newClients: number;
  activePackages: number;
  pendingReviews: number;
  todayRevenue: number;
}

interface DashboardStatsProps {
  stats: StatsData;
}

interface StatItem {
  key: keyof StatsData;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  iconBg: string;
  iconColor: string;
  href?: string;
  format?: (n: number) => string;
}

const currencyFmt = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const STAT_ITEMS: StatItem[] = [
  {
    key: 'appointments',
    label: "Today's Appointments",
    icon: Calendar,
    accent: 'border-[hsl(231_97%_68%)]',
    iconBg: 'bg-[hsl(231_97%_68%/0.1)]',
    iconColor: 'text-[hsl(231_97%_68%)]',
  },
  {
    key: 'todayRevenue',
    label: "Today's Revenue",
    icon: DollarSign,
    accent: 'border-rose-500',
    iconBg: 'bg-rose-50 dark:bg-rose-950/30',
    iconColor: 'text-rose-600 dark:text-rose-400',
    href: '/admin/sales',
    format: (n) => currencyFmt.format(n),
  },
  {
    key: 'newClients',
    label: 'New Clients',
    icon: Users,
    accent: 'border-emerald-500',
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    key: 'activePackages',
    label: 'Active Members',
    icon: Package,
    accent: 'border-violet-500',
    iconBg: 'bg-violet-50 dark:bg-violet-950/30',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    key: 'pendingReviews',
    label: 'Confirmed Today',
    icon: CheckCircle2,
    accent: 'border-amber-500',
    iconBg: 'bg-amber-50 dark:bg-amber-950/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
];

const DashboardStats = ({ stats }: DashboardStatsProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {STAT_ITEMS.map(({ key, label, icon: Icon, accent, iconBg, iconColor, href, format }) => {
        const display = format ? format(stats[key]) : String(stats[key]);
        const cardInner = (
          <div
            className={`bg-card border border-border rounded-lg p-5 border-l-4 ${accent} shadow-sm hover:shadow-md transition-shadow duration-200 h-full`}
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 truncate">
                  {label}
                </p>
                <p className="text-3xl font-bold text-foreground tabular-nums truncate">
                  {display}
                </p>
              </div>
              <div className={`p-2.5 rounded-lg ${iconBg} shrink-0`}>
                <Icon className={`h-5 w-5 ${iconColor}`} />
              </div>
            </div>
          </div>
        );
        return href ? (
          <Link key={key} to={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
            {cardInner}
          </Link>
        ) : (
          <div key={key}>{cardInner}</div>
        );
      })}
    </div>
  );
};

export default DashboardStats;
