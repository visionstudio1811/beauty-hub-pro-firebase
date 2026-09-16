import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Calendar, Users, Package, CheckCircle2, DollarSign } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageProvider';

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
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  iconBg: string;
  iconColor: string;
  href?: string;
  format?: (n: number, locale: string) => string;
}

const STAT_ITEMS: StatItem[] = [
  {
    key: 'appointments',
    labelKey: 'stats.todaysAppointments',
    icon: Calendar,
    accent: 'border-[hsl(231_97%_68%)]',
    iconBg: 'bg-[hsl(231_97%_68%/0.1)]',
    iconColor: 'text-[hsl(231_97%_68%)]',
  },
  {
    key: 'todayRevenue',
    labelKey: 'stats.todaysRevenue',
    icon: DollarSign,
    accent: 'border-rose-500',
    iconBg: 'bg-rose-50 dark:bg-rose-950/30',
    iconColor: 'text-rose-600 dark:text-rose-400',
    href: '/admin/sales',
    format: (n, locale) =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(n),
  },
  {
    key: 'newClients',
    labelKey: 'stats.newClients',
    icon: Users,
    accent: 'border-emerald-500',
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    key: 'activePackages',
    labelKey: 'stats.activeMembers',
    icon: Package,
    accent: 'border-violet-500',
    iconBg: 'bg-violet-50 dark:bg-violet-950/30',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    key: 'pendingReviews',
    labelKey: 'stats.confirmedToday',
    icon: CheckCircle2,
    accent: 'border-amber-500',
    iconBg: 'bg-amber-50 dark:bg-amber-950/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
];

const DashboardStats = ({ stats }: DashboardStatsProps) => {
  const { t } = useTranslation('dashboard');
  const { locale } = useLanguage();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {STAT_ITEMS.map(({ key, labelKey, icon: Icon, accent, iconBg, iconColor, href, format }) => {
        const label = t(labelKey);
        const display = format ? format(stats[key], locale) : String(stats[key]);
        const cardInner = (
          <div
            className={`bg-card border border-border rounded-lg p-5 border-s-4 ${accent} shadow-sm hover:shadow-md transition-shadow duration-200 h-full`}
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
