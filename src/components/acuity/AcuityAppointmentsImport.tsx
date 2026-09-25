import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, format, parseISO } from 'date-fns';
import { doc, updateDoc } from 'firebase/firestore';
import { Loader2, Search } from 'lucide-react';
import { db } from '@/lib/firebase';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { safeFormatters } from '@/lib/safeDateFormatter';
import { formatTime12Hour, getBusinessToday } from '@/lib/timeUtils';
import {
  acuityApi,
  addSummaries,
  APPOINTMENT_IMPORT_BATCH,
  chunk,
  EMPTY_SUMMARY,
  type AcuityAppointmentRow,
  type AcuityMeta,
  type AppointmentImportItem,
} from '@/lib/acuityApi';
import { AcuityMappingEditor, type MappingEntry } from './AcuityMappingEditor';
import {
  errorMessage,
  FilterChips,
  headerCheckState,
  ImportBar,
  Pager,
  toggleAll,
  toggleOne,
  usePaged,
  useSummaryText,
} from './importShared';

type Filter = 'all' | 'notImported' | 'imported';
const ALL = 'all';

interface Props {
  organizationId: string;
  configId: string | null;
  timeZone: string;
  onImported: () => void;
}

const shiftDate = (iso: string, days: number) => format(addDays(parseISO(iso), days), 'yyyy-MM-dd');

function matchesQuery(row: AcuityAppointmentRow, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const digits = q.replace(/\D/g, '');
  return (
    row.clientName.toLowerCase().includes(q) ||
    (row.email ?? '').toLowerCase().includes(q) ||
    row.type.toLowerCase().includes(q) ||
    (digits.length >= 3 && (row.phone ?? '').replace(/\D/g, '').includes(digits))
  );
}

/** First occurrence of each Acuity id in the loaded rows, for the mapping editor. */
function distinctEntries(
  rows: AcuityAppointmentRow[],
  pick: (row: AcuityAppointmentRow) => MappingEntry | null,
): MappingEntry[] {
  const seen = new Map<string, MappingEntry>();
  for (const row of rows) {
    const entry = pick(row);
    if (entry && !seen.has(entry.acuityId)) seen.set(entry.acuityId, entry);
  }
  return [...seen.values()].sort((a, b) => a.acuityName.localeCompare(b.acuityName));
}

export const AcuityAppointmentsImport: React.FC<Props> = ({ organizationId, configId, timeZone, onImported }) => {
  const { t } = useTranslation('integrations');
  const { toast } = useToast();
  const summaryText = useSummaryText();
  const today = getBusinessToday(timeZone);

  const [meta, setMeta] = useState<AcuityMeta | null>(null);
  const [minDate, setMinDate] = useState(today);
  const [maxDate, setMaxDate] = useState(shiftDate(today, 30));
  const [calendarId, setCalendarId] = useState(ALL);
  const [typeId, setTypeId] = useState(ALL);
  const [includeCanceled, setIncludeCanceled] = useState(false);
  const [rows, setRows] = useState<AcuityAppointmentRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createMissingClients, setCreateMissingClients] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcomes, setOutcomes] = useState<Map<string, AppointmentImportItem>>(new Map());
  const [savingMapping, setSavingMapping] = useState(false);
  const busy = loading || Boolean(progress);
  const mounted = useRef(true);

  // Calendars/services for the filters and CRM treatments/staff for the mapping
  // editor. Retried on the next Load if it failed (rate limit, timeout).
  const loadMeta = useCallback(async () => {
    try {
      const result = await acuityApi.listMeta(organizationId);
      if (mounted.current) setMeta(result);
    } catch (err) {
      if (mounted.current) {
        toast({
          title: t('acuity.import.loadFailed'),
          description: errorMessage(err, t('acuity.errors.generic')),
          variant: 'destructive',
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => {
    mounted.current = true;
    loadMeta();
    return () => {
      mounted.current = false;
    };
  }, [loadMeta]);

  const counts = useMemo(() => {
    const list = rows ?? [];
    const imported = list.filter((r) => r.imported).length;
    return { all: list.length, imported, notImported: list.length - imported };
  }, [rows]);

  const filtered = useMemo(
    () =>
      (rows ?? []).filter(
        (r) =>
          (filter === 'all' || (filter === 'imported' ? Boolean(r.imported) : !r.imported)) &&
          matchesQuery(r, query.trim()),
      ),
    [rows, filter, query],
  );
  const { page, pages, visible, setPage } = usePaged(filtered);
  const filteredIds = useMemo(() => filtered.map((r) => r.id), [filtered]);

  const typeEntries = useMemo(
    () =>
      distinctEntries(rows ?? [], (r) =>
        r.appointmentTypeId ? { acuityId: r.appointmentTypeId, acuityName: r.type, resolved: r.treatment } : null,
      ),
    [rows],
  );
  const calendarEntries = useMemo(
    () =>
      distinctEntries(rows ?? [], (r) =>
        r.calendarId ? { acuityId: r.calendarId, acuityName: r.calendar, resolved: r.staff } : null,
      ),
    [rows],
  );

  const applyPreset = (from: string, to: string) => {
    setMinDate(from);
    setMaxDate(to);
  };

  const load = async () => {
    if (!minDate || !maxDate || minDate > maxDate) {
      toast({ title: t('acuity.appointments.invalidRange'), variant: 'destructive' });
      return;
    }
    if (!meta) loadMeta();
    setLoading(true);
    try {
      const result = await acuityApi.listAppointments(organizationId, {
        minDate,
        maxDate,
        calendarId: calendarId === ALL ? undefined : calendarId,
        appointmentTypeId: typeId === ALL ? undefined : typeId,
        includeCanceled,
      });
      setRows(result.appointments);
      setTruncated(result.truncated);
      setSelected(new Set());
      setOutcomes(new Map());
      setPage(1);
    } catch (err) {
      toast({
        title: t('acuity.import.loadFailed'),
        description: errorMessage(err, t('acuity.errors.generic')),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const saveMapping = async (
    kind: 'appointment_types' | 'calendars',
    acuityId: string,
    crmId: string | null,
  ) => {
    if (!configId) return;
    setSavingMapping(true);
    try {
      // '' records an explicit "keep the Acuity name" so name matching doesn't override it.
      await updateDoc(doc(db, 'organizations', organizationId, 'acuitySyncConfig', configId), {
        [`acuity_import_mappings.${kind}.${acuityId}`]: crmId ?? '',
        updated_at: new Date().toISOString(),
      });
      const targets = kind === 'appointment_types' ? meta?.treatments : meta?.staff;
      const targetName = crmId ? targets?.find((x) => x.id === crmId)?.name ?? '' : '';
      setRows((prev) =>
        (prev ?? []).map((row) => {
          if (kind === 'appointment_types' && row.appointmentTypeId === acuityId) {
            return {
              ...row,
              treatment: crmId ? { id: crmId, name: targetName, via: 'mapping' } : { id: null, name: row.type, via: 'none' },
            };
          }
          if (kind === 'calendars' && row.calendarId === acuityId) {
            return {
              ...row,
              staff: crmId ? { id: crmId, name: targetName, via: 'mapping' } : { id: null, name: row.calendar, via: 'none' },
            };
          }
          return row;
        }),
      );
      toast({ title: t('acuity.mapping.saved') });
    } catch (err) {
      toast({
        title: t('acuity.mapping.saveFailed'),
        description: errorMessage(err, t('acuity.errors.generic')),
        variant: 'destructive',
      });
    } finally {
      setSavingMapping(false);
    }
  };

  const runImport = async () => {
    const ids = (rows ?? []).filter((r) => selected.has(r.id)).map((r) => r.id);
    if (ids.length === 0) return;
    let summary = EMPTY_SUMMARY;
    let done = 0;
    const results = new Map(outcomes);
    setProgress({ done: 0, total: ids.length });
    try {
      for (const batch of chunk(ids, APPOINTMENT_IMPORT_BATCH)) {
        const res = await acuityApi.importAppointments(organizationId, batch, createMissingClients);
        summary = addSummaries(summary, res.summary);
        res.results.forEach((item) => results.set(item.id, item));
        done += batch.length;
        setProgress({ done, total: ids.length });
      }
      toast({ title: t('acuity.import.importDone'), description: summaryText(summary) });
    } catch (err) {
      const reason = errorMessage(err, t('acuity.errors.generic'));
      toast({
        title: t('acuity.import.importFailed'),
        description: done > 0
          ? `${t('acuity.import.partial', { done, total: ids.length })} ${summaryText(summary)}. ${reason}`
          : reason,
        variant: 'destructive',
      });
    } finally {
      setProgress(null);
      setOutcomes(results);
      setRows((prev) =>
        (prev ?? []).map((row) => {
          const item = results.get(row.id);
          if (!item?.appointmentId || item.status === 'skipped' || item.status === 'error') return row;
          return {
            ...row,
            imported: { appointmentId: item.appointmentId, status: row.imported?.status ?? '' },
            crmClient: row.crmClient ?? (item.clientId ? { id: item.clientId, name: row.clientName, by: 'email' } : null),
          };
        }),
      );
      // Rows that went through leave the selection; unprocessed or failed ones stay for a retry.
      setSelected((prev) => {
        const next = new Set(prev);
        results.forEach((item, id) => {
          if (item.status !== 'error') next.delete(id);
        });
        return next;
      });
      if (done > 0) onImported();
    }
  };

  const statusBadge = (row: AcuityAppointmentRow) => {
    if (row.imported) return <Badge className="bg-green-600 hover:bg-green-600">{t('acuity.appointments.status.imported')}</Badge>;
    if (row.canceled) return <Badge variant="destructive">{t('acuity.appointments.status.canceled')}</Badge>;
    return row.isPast ? (
      <Badge variant="secondary">{t('acuity.appointments.status.past')}</Badge>
    ) : (
      <Badge variant="outline">{t('acuity.appointments.status.upcoming')}</Badge>
    );
  };

  /** Heads-up when the CRM already holds a visit for this client that day (booked in both systems). */
  const sameDayHint = (row: AcuityAppointmentRow) => {
    if (row.imported || !row.crmSameDay) return null;
    if (row.crmSameDay.time === row.time) {
      return <div className="text-xs text-muted-foreground">{t('acuity.appointments.status.willLink')}</div>;
    }
    return (
      <div className="text-xs text-amber-600">
        {t('acuity.appointments.status.sameDay', { time: formatTime12Hour(row.crmSameDay.time) })}
      </div>
    );
  };

  const outcomeText = (row: AcuityAppointmentRow) => {
    const item = outcomes.get(row.id);
    if (!item) return null;
    const reason = item.reason ? t(`acuity.appointments.skipReasons.${item.reason}`, { defaultValue: item.reason }) : '';
    return (
      <div className={item.status === 'skipped' || item.status === 'error' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
        {t(`acuity.import.outcome.${item.status}`)}
        {reason ? ` — ${reason}` : ''}
      </div>
    );
  };

  const rowLabel = (row: AcuityAppointmentRow) =>
    t('acuity.appointments.selectRow', {
      name: row.clientName || row.email || row.phone || t('acuity.clients.unnamed'),
      when: `${safeFormatters.shortDate(row.date)} ${formatTime12Hour(row.time)}`.trim(),
    });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="acuity-from">{t('acuity.appointments.from')}</Label>
          <Input id="acuity-from" type="date" value={minDate} onChange={(e) => setMinDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="acuity-to">{t('acuity.appointments.to')}</Label>
          <Input id="acuity-to" type="date" value={maxDate} onChange={(e) => setMaxDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="acuity-calendar">{t('acuity.appointments.calendar')}</Label>
          <Select value={calendarId} onValueChange={setCalendarId}>
            <SelectTrigger id="acuity-calendar">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('acuity.appointments.any')}</SelectItem>
              {(meta?.calendars ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="acuity-service">{t('acuity.appointments.service')}</Label>
          <Select value={typeId} onValueChange={setTypeId}>
            <SelectTrigger id="acuity-service">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('acuity.appointments.any')}</SelectItem>
              {(meta?.appointmentTypes ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset(today, shiftDate(today, 30))}>
          {t('acuity.appointments.presets.next30')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset(shiftDate(today, -30), today)}>
          {t('acuity.appointments.presets.past30')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset(shiftDate(today, -90), today)}>
          {t('acuity.appointments.presets.past90')}
        </Button>
        <label className="ms-auto flex items-center gap-2 text-sm">
          <Checkbox checked={includeCanceled} onCheckedChange={(checked) => setIncludeCanceled(checked === true)} />
          {t('acuity.appointments.includeCanceled')}
        </label>
        <Button type="button" onClick={load} disabled={busy}>
          {loading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Search className="me-2 h-4 w-4" />}
          {t('acuity.appointments.load')}
        </Button>
      </div>

      {rows && (
        <>
          {truncated && (
            <Alert>
              <AlertDescription>{t('acuity.appointments.truncated', { n: rows.length })}</AlertDescription>
            </Alert>
          )}

          <AcuityMappingEditor
            types={typeEntries}
            calendars={calendarEntries}
            treatments={meta?.treatments ?? []}
            staff={meta?.staff ?? []}
            onChangeType={(acuityId, crmId) => saveMapping('appointment_types', acuityId, crmId)}
            onChangeCalendar={(acuityId, crmId) => saveMapping('calendars', acuityId, crmId)}
            busy={savingMapping || !configId || !meta || Boolean(progress)}
          />

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <FilterChips<Filter>
              value={filter}
              onChange={(key) => {
                setFilter(key);
                setPage(1);
              }}
              options={[
                { key: 'all', label: t('acuity.appointments.filters.all', { n: counts.all }) },
                { key: 'notImported', label: t('acuity.appointments.filters.notImported', { n: counts.notImported }) },
                { key: 'imported', label: t('acuity.appointments.filters.imported', { n: counts.imported }) },
              ]}
            />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder={t('acuity.appointments.filterPlaceholder')}
              aria-label={t('acuity.appointments.filterPlaceholder')}
              className="lg:max-w-xs"
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label={t('acuity.import.selectAll')}
                    checked={headerCheckState(filteredIds, selected)}
                    onCheckedChange={(checked) => setSelected(toggleAll(filteredIds, selected, checked === true))}
                    disabled={filteredIds.length === 0 || Boolean(progress)}
                  />
                </TableHead>
                <TableHead>{t('acuity.appointments.columns.when')}</TableHead>
                <TableHead>{t('acuity.appointments.columns.client')}</TableHead>
                <TableHead>{t('acuity.appointments.columns.service')}</TableHead>
                <TableHead>{t('acuity.appointments.columns.calendar')}</TableHead>
                <TableHead>{t('acuity.appointments.columns.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    {t('acuity.import.noResults')}
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((row) => (
                  <TableRow key={row.id} data-state={selected.has(row.id) ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox
                        aria-label={rowLabel(row)}
                        checked={selected.has(row.id)}
                        onCheckedChange={(checked) => setSelected(toggleOne(row.id, selected, checked === true))}
                        disabled={Boolean(progress)}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="font-medium">{safeFormatters.shortDate(row.date) || '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        <span className="ltr-inline" dir="ltr">{formatTime12Hour(row.time)}</span>
                        {' · '}
                        {t('acuity.appointments.minutes', { value: row.duration })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{row.clientName || '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        <span className="ltr-inline" dir="ltr">{row.email || row.phone || ''}</span>
                      </div>
                      <div className="mt-1">
                        {row.crmClient ? (
                          <Badge variant="outline">{t('acuity.appointments.status.inCrm')}</Badge>
                        ) : row.clientAmbiguous ? (
                          <Badge variant="outline" className="border-amber-500 text-amber-700">
                            {t('acuity.appointments.status.ambiguous')}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{t('acuity.appointments.status.newClient')}</Badge>
                        )}
                      </div>
                      {sameDayHint(row)}
                      {outcomeText(row)}
                    </TableCell>
                    <TableCell>
                      <div>{row.type || '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.treatment.id
                          ? t('acuity.appointments.linkedTo', { name: row.treatment.name })
                          : t('acuity.appointments.notLinked')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{row.calendar || '—'}</div>
                      {row.staff.id && (
                        <div className="text-xs text-muted-foreground">
                          {t('acuity.appointments.linkedTo', { name: row.staff.name })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(row)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <Pager page={page} pages={pages} onPage={setPage} />

          <ImportBar
            selectedCount={selected.size}
            progress={progress}
            onClear={() => setSelected(new Set())}
            onImport={runImport}
          >
            <label className="flex items-center gap-2">
              <Switch
                checked={createMissingClients}
                onCheckedChange={setCreateMissingClients}
                disabled={Boolean(progress)}
              />
              <span>{t('acuity.appointments.createMissingClients')}</span>
            </label>
          </ImportBar>
          <p className="text-xs text-muted-foreground">{t('acuity.appointments.importHelp')}</p>
        </>
      )}
    </div>
  );
};
