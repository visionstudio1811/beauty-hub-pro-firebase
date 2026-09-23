import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, limit, onSnapshot, orderBy, query, type Timestamp } from 'firebase/firestore';
import { EyeOff, Loader2, MessageSquare, Minus, Star, ThumbsUp, TrendingDown, TrendingUp, UserRound } from 'lucide-react';
import { db } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useToast } from '@/hooks/use-toast';
import { safeFormatters } from '@/lib/safeDateFormatter';
import { validateDate } from '@/lib/timeUtils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type FeedbackDoc = {
  id: string;
  rating: number;
  recommend: number | null;
  enjoyed: string;
  improve: string;
  treatment_id: string | null;
  treatment_name: string | null;
  appointment_id: string | null;
  client_id: string | null;
  client_name: string | null;
  is_anonymous: boolean;
  language: 'en' | 'he';
  created_at?: Timestamp;
  created_day?: string;
};

type WhoFilter = 'all' | 'named' | 'anonymous';

const LOAD_LIMIT = 200;
const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;
const MAX_TREATMENT_ROWS = 8;

// Anonymous rows carry a UTC day-start timestamp; parsing created_day at local
// noon keeps the displayed date from slipping a day in western timezones.
function dayToLocalNoon(day: string | undefined): Date | null {
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12);
}

function createdMillis(item: FeedbackDoc): number {
  return validateDate(item.created_at)?.getTime() ?? dayToLocalNoon(item.created_day)?.getTime() ?? 0;
}

function displayDate(item: FeedbackDoc): string {
  const source = item.is_anonymous ? dayToLocalNoon(item.created_day) ?? item.created_at : item.created_at;
  return safeFormatters.shortDate(source) || item.created_day || '—';
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function recommendTone(score: number): string {
  if (score >= 9) return 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
  if (score >= 7) return 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
  return 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
}

function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={cn('h-4 w-4', i <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')}
        />
      ))}
    </span>
  );
}

export function FeedbackInbox() {
  const { t } = useTranslation('feedback');
  const { locale } = useLanguage();
  const { toast } = useToast();
  const isAdmin = useIsAdmin();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const tRef = useRef(t);
  tRef.current = t;

  const [items, setItems] = useState<FeedbackDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [who, setWho] = useState<WhoFilter>('all');
  const [minRating, setMinRating] = useState('0');

  useEffect(() => {
    if (!orgId || !isAdmin) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, 'organizations', orgId, 'clientFeedback'),
      orderBy('created_at', 'desc'),
      limit(LOAD_LIMIT),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FeedbackDoc, 'id'>) })));
        setLoading(false);
      },
      (error) => {
        console.error('Failed to load client feedback:', error);
        setLoading(false);
        toast({ title: tRef.current('inbox.loadFailed'), variant: 'destructive' });
      },
    );
    return () => unsubscribe();
  }, [orgId, isAdmin, toast]);

  const numberFormat = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale]);
  const signedFormat = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 1, signDisplay: 'always' }),
    [locale],
  );

  const stats = useMemo(() => {
    const now = Date.now();
    const windowStart = now - WINDOW_DAYS * DAY_MS;
    const previousStart = windowStart - WINDOW_DAYS * DAY_MS;
    const recent: FeedbackDoc[] = [];
    const previous: FeedbackDoc[] = [];
    for (const item of items) {
      const ms = createdMillis(item);
      if (ms >= windowStart) recent.push(item);
      else if (ms >= previousStart) previous.push(item);
    }
    const avgRecent = average(recent.map((i) => i.rating));
    const avgPrevious = average(previous.map((i) => i.rating));

    const scored = items.filter((i) => typeof i.recommend === 'number');
    const promoters = scored.filter((i) => (i.recommend as number) >= 9).length;
    const detractors = scored.filter((i) => (i.recommend as number) <= 6).length;
    const nps = scored.length > 0 ? Math.round(((promoters - detractors) / scored.length) * 100) : null;

    const byTreatment = new Map<string, { name: string; ratings: number[] }>();
    for (const item of items) {
      const key = item.treatment_id ?? item.treatment_name;
      if (!key) continue;
      const entry = byTreatment.get(key) ?? { name: item.treatment_name ?? '', ratings: [] };
      if (!entry.name && item.treatment_name) entry.name = item.treatment_name;
      entry.ratings.push(item.rating);
      byTreatment.set(key, entry);
    }
    const treatments = Array.from(byTreatment.entries())
      .map(([key, entry]) => ({ key, name: entry.name, count: entry.ratings.length, avg: average(entry.ratings) ?? 0 }))
      .sort((a, b) => b.count - a.count || b.avg - a.avg)
      .slice(0, MAX_TREATMENT_ROWS);

    return {
      responses: recent.length,
      avgRecent,
      delta: avgRecent !== null && avgPrevious !== null ? avgRecent - avgPrevious : null,
      nps,
      scoredCount: scored.length,
      treatments,
    };
  }, [items]);

  const visible = useMemo(() => {
    const min = Number(minRating);
    return items.filter((item) => {
      if (who === 'named' && item.is_anonymous) return false;
      if (who === 'anonymous' && !item.is_anonymous) return false;
      return item.rating >= min;
    });
  }, [items, who, minRating]);

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('inbox.title')}</CardTitle>
          <CardDescription>{t('inbox.adminOnly')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const DeltaIcon = stats.delta === null ? Minus : stats.delta > 0 ? TrendingUp : stats.delta < 0 ? TrendingDown : Minus;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{t('inbox.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('inbox.description')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('inbox.kpis.responses')}</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.responses}</div>
            <p className="text-xs text-muted-foreground">{t('inbox.kpis.loadedTotal', { n: items.length })}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('inbox.kpis.avgRating')}</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{stats.avgRecent === null ? '—' : numberFormat.format(stats.avgRecent)}</span>
              {stats.avgRecent !== null && <span className="text-xs text-muted-foreground">{t('inbox.kpis.outOfFive')}</span>}
            </div>
            {stats.delta === null ? (
              <p className="text-xs text-muted-foreground">{t('inbox.kpis.noPrevious')}</p>
            ) : (
              <p
                className={cn(
                  'flex items-center gap-1 text-xs',
                  stats.delta > 0 ? 'text-emerald-700 dark:text-emerald-300' : stats.delta < 0 ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground',
                )}
              >
                <DeltaIcon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="ltr-inline" dir="ltr">{signedFormat.format(stats.delta)}</span>
                <span>{t('inbox.kpis.vsPrevious')}</span>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('inbox.kpis.nps')}</CardTitle>
            <ThumbsUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.nps === null ? '—' : <span className="ltr-inline" dir="ltr">{signedFormat.format(stats.nps)}</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.nps === null ? t('inbox.kpis.npsEmpty') : `${t('inbox.kpis.scoredResponses', { n: stats.scoredCount })} · ${t('inbox.kpis.npsHint')}`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('inbox.byTreatment.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.treatments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('inbox.byTreatment.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">{t('inbox.byTreatment.treatment')}</TableHead>
                  <TableHead className="text-start">{t('inbox.byTreatment.avgRating')}</TableHead>
                  <TableHead className="text-start">{t('inbox.byTreatment.responses')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.treatments.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">{row.name || t('inbox.row.unknownTreatment')}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        <span>{numberFormat.format(row.avg)}</span>
                        <Stars value={Math.round(row.avg)} label={t('inbox.row.ratingAria', { rating: numberFormat.format(row.avg) })} />
                      </span>
                    </TableCell>
                    <TableCell>{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 md:flex md:flex-row md:items-center md:justify-between md:space-y-0">
          <CardTitle className="text-base">{t('inbox.filters.who')}</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={who} onValueChange={(v) => setWho(v as WhoFilter)}>
              <SelectTrigger className="w-full sm:w-44" aria-label={t('inbox.filters.who')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('inbox.filters.all')}</SelectItem>
                <SelectItem value="named">{t('inbox.filters.named')}</SelectItem>
                <SelectItem value="anonymous">{t('inbox.filters.anonymous')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={minRating} onValueChange={setMinRating}>
              <SelectTrigger className="w-full sm:w-44" aria-label={t('inbox.filters.minRating')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">{t('inbox.filters.anyRating')}</SelectItem>
                {[2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>{t('inbox.filters.minStars', { n })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="ms-2">{t('inbox.loading')}</span>
            </div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center">
              <MessageSquare className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">{t('inbox.empty')}</p>
            </div>
          ) : visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('inbox.noMatches')}</p>
          ) : (
            visible.map((item) => (
              <div key={item.id} className="rounded-md border p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.is_anonymous ? (
                        <Badge variant="secondary" className="gap-1">
                          <EyeOff className="h-3 w-3" aria-hidden="true" />
                          {t('inbox.row.anonymous')}
                        </Badge>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium">
                          <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          {item.client_name || t('inbox.row.clientFallback')}
                        </span>
                      )}
                      {item.treatment_name && (
                        <Badge variant="outline">{item.treatment_name}</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{displayDate(item)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <Stars value={item.rating} label={t('inbox.row.ratingAria', { rating: item.rating })} />
                    {typeof item.recommend === 'number' ? (
                      <Badge variant="outline" className={recommendTone(item.recommend)}>
                        {t('inbox.row.recommend', { score: item.recommend })}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t('inbox.row.noRecommend')}</span>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('inbox.row.enjoyed')}</div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                      {item.enjoyed || <span className="text-muted-foreground">{t('inbox.row.noAnswer')}</span>}
                    </p>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('inbox.row.improve')}</div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                      {item.improve || <span className="text-muted-foreground">{t('inbox.row.noAnswer')}</span>}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
