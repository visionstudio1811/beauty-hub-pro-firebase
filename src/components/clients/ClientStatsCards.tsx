
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserPlus, Star, DollarSign } from 'lucide-react';
import { Client } from '@/hooks/useClients';
import { useIsAdmin } from '@/hooks/useIsAdmin';

interface ClientStatsCardsProps {
  clients: Client[];
  totalCount?: number;
  // Org-wide aggregates computed in usePaginatedClients over the full filtered
  // client universe (not the paginated slice). Passing these keeps Total Revenue,
  // VIP, and New Clients constant across page changes and coherent with totalCount.
  totalRevenue?: number;
  vipCount?: number;
  newCount?: number;
}

export const ClientStatsCards: React.FC<ClientStatsCardsProps> = ({
  clients,
  totalCount,
  totalRevenue: totalRevenueProp,
  vipCount,
  newCount,
}) => {
  const isAdmin = useIsAdmin();
  const totalClients = totalCount ?? clients.length;
  const newClients = newCount ?? 0;
  const vipClients = vipCount ?? 0;
  const totalRevenue = totalRevenueProp ?? 0;

  const stats = [
    {
      title: 'Total Clients',
      value: totalClients,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      title: 'New Clients',
      value: newClients,
      icon: UserPlus,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      title: 'VIP Clients',
      value: vipClients,
      icon: Star,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    // Total Revenue is admin-only — front-desk users don't see financial totals.
    ...(isAdmin
      ? [{
          title: 'Total Revenue',
          value: `$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          icon: DollarSign,
          color: 'text-emerald-600',
          bgColor: 'bg-emerald-100',
        }]
      : []),
  ];

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 ${isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Card key={index} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-full ${stat.bgColor}`}>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {stat.value}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
