import React, { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  CheckCircle2,
  XCircle,
  Package,
  Edit,
  Trash2,
  Bell,
  Clock,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Client } from '@/hooks/useClients';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/i18n/LanguageProvider';

interface HistoryEntry {
  id: string;
  type: string;
  reason?: string;
  packageName?: string;
  packageId?: string;
  purchaseId?: string;
  totalSessions?: number;
  price?: number;
  expiryDate?: string;
  newSessions?: number;
  newExpiry?: string | null;
  daysLeft?: number;
  createdAt: string;
}

interface MembershipHistoryTabProps {
  client: Client;
}

// `label` is the key under clients:membershipHistory.events — resolved with t() at render.
const EVENT_CONFIG: Record<
  string,
  { icon: React.ElementType; label: string; color: string; badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  package_assigned: {
    icon: Package,
    label: 'package_assigned',
    color: 'text-green-600',
    badgeVariant: 'default',
  },
  membership_activated: {
    icon: CheckCircle2,
    label: 'membership_activated',
    color: 'text-green-600',
    badgeVariant: 'default',
  },
  membership_deactivated: {
    icon: XCircle,
    label: 'membership_deactivated',
    color: 'text-red-600',
    badgeVariant: 'destructive',
  },
  sessions_edited: {
    icon: Edit,
    label: 'sessions_edited',
    color: 'text-blue-600',
    badgeVariant: 'secondary',
  },
  package_removed: {
    icon: Trash2,
    label: 'package_removed',
    color: 'text-red-600',
    badgeVariant: 'destructive',
  },
  package_expired: {
    icon: AlertTriangle,
    label: 'package_expired',
    color: 'text-amber-600',
    badgeVariant: 'outline',
  },
  expiry_reminder: {
    icon: Bell,
    label: 'expiry_reminder',
    color: 'text-violet-600',
    badgeVariant: 'secondary',
  },
};

const DEFAULT_EVENT = {
  icon: Clock,
  label: 'default',
  color: 'text-gray-600',
  badgeVariant: 'outline' as const,
};

export const MembershipHistoryTab: React.FC<MembershipHistoryTabProps> = ({ client }) => {
  const { t } = useTranslation('clients');
  const { locale } = useLanguage();
  const { currentOrganization } = useOrganization();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePurchasesCount, setActivePurchasesCount] = useState(0);

  const load = useCallback(async () => {
    if (!currentOrganization?.id || !client?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Fetch membership history
      const historySnap = await getDocs(
        query(
          collection(
            db,
            'organizations',
            currentOrganization.id,
            'clients',
            client.id,
            'membershipHistory',
          ),
          orderBy('createdAt', 'desc'),
        ),
      );

      setEntries(
        historySnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            type: data.type || 'unknown',
            reason: data.reason,
            packageName: data.packageName,
            packageId: data.packageId,
            purchaseId: data.purchaseId,
            totalSessions: data.totalSessions,
            price: data.price,
            expiryDate: data.expiryDate,
            newSessions: data.newSessions,
            newExpiry: data.newExpiry,
            daysLeft: data.daysLeft,
            createdAt:
              data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
          };
        }),
      );

      // Count active purchases
      const purchasesSnap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'purchases'),
          where('client_id', '==', client.id),
          where('payment_status', '==', 'active'),
        ),
      );
      setActivePurchasesCount(purchasesSnap.size);
    } catch (err) {
      console.error('Error loading membership history:', err);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization?.id, client?.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <SummaryCard
          label={t('membershipHistory.summary.status')}
          value={activePurchasesCount > 0 ? t('membershipHistory.summary.active') : t('membershipHistory.summary.inactive')}
          color={activePurchasesCount > 0 ? 'text-green-600' : 'text-gray-500'}
        />
        <SummaryCard
          label={t('membershipHistory.summary.activePackages')}
          value={String(activePurchasesCount)}
          color="text-violet-600"
        />
        <SummaryCard
          label={t('membershipHistory.summary.totalEvents')}
          value={String(entries.length)}
          color="text-blue-600"
        />
      </div>

      {/* Timeline */}
      {entries.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Clock className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">{t('membershipHistory.emptyTitle')}</p>
          <p className="text-sm mt-1">
            {t('membershipHistory.emptyDescription')}
          </p>
        </div>
      ) : (
        <div className="relative space-y-0">
          {/* Vertical line */}
          <div className="absolute start-[19px] top-2 bottom-2 w-px bg-border" />

          {entries.map((entry) => {
            const cfg = EVENT_CONFIG[entry.type] ?? DEFAULT_EVENT;
            const Icon = cfg.icon;
            const date = new Date(entry.createdAt);

            return (
              <div key={entry.id} className="relative flex gap-4 pb-5">
                {/* Dot on timeline */}
                <div
                  className={`z-10 flex-shrink-0 w-10 h-10 rounded-full bg-background border-2 border-border flex items-center justify-center ${cfg.color}`}
                >
                  <Icon className="h-4 w-4" />
                </div>

                {/* Content */}
                <Card className="flex-1">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <Badge variant={cfg.badgeVariant} className="text-xs">
                        {t(`membershipHistory.events.${cfg.label}`)}
                      </Badge>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {date.toLocaleDateString(locale)} {date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Details based on event type */}
                    <div className="text-sm text-foreground mt-2 space-y-1">
                      {entry.packageName && (
                        <p>
                          {t('membershipHistory.package')} <strong>{entry.packageName}</strong>
                        </p>
                      )}
                      {entry.totalSessions != null && (
                        <p>{t('membershipHistory.sessions', { count: entry.totalSessions })}</p>
                      )}
                      {entry.price != null && <p>{t('membershipHistory.price', { price: entry.price })}</p>}
                      {entry.expiryDate && (
                        <p>{t('membershipHistory.expires', { date: new Date(entry.expiryDate).toLocaleDateString(locale) })}</p>
                      )}
                      {entry.newSessions != null && (
                        <p>{t('membershipHistory.newSessionsRemaining', { count: entry.newSessions })}</p>
                      )}
                      {entry.newExpiry && (
                        <p>{t('membershipHistory.newExpiry', { date: new Date(entry.newExpiry).toLocaleDateString(locale) })}</p>
                      )}
                      {entry.daysLeft != null && (
                        <p>{t('membershipHistory.daysUntilExpiry', { count: entry.daysLeft })}</p>
                      )}
                      {entry.reason && entry.type === 'package_expired' && (
                        <p className="text-muted-foreground text-xs">
                          {t('membershipHistory.reason', {
                            reason: entry.reason === 'all_sessions_used'
                              ? t('membershipHistory.reasons.allSessionsUsed')
                              : t('membershipHistory.reasons.expiryDatePassed'),
                          })}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-muted/40 border border-border rounded-lg p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
