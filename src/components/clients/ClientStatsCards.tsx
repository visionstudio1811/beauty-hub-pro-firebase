
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserPlus, Star, DollarSign } from 'lucide-react';
import { Client } from '@/hooks/useClients';

interface ClientStatsCardsProps {
  clients: Client[];
  totalCount?: number;
}

export const ClientStatsCards: React.FC<ClientStatsCardsProps> = ({ clients, totalCount }) => {
  const totalClients = totalCount ?? clients.length;
  const newClients = clients.filter(client => client.status === 'New').length;
  const vipClients = clients.filter(client => client.status === 'VIP').length;
  const totalRevenue = clients.reduce((sum, client) => sum + (client.totalRevenue || 0), 0);

  // Get clients who visited in the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentClients = clients.filter(client => {
    const lastVisit = new Date(client.lastVisit);
    return lastVisit >= thirtyDaysAgo;
  }).length;

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
    {
      title: 'Total Revenue',
      value: `$${totalRevenue.toLocaleString()}`,
      icon: DollarSign,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
