import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  acuityApi,
  addSummaries,
  chunk,
  CLIENT_IMPORT_BATCH,
  EMPTY_SUMMARY,
  type AcuityClientRow,
  type ClientImportItem,
} from '@/lib/acuityApi';
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

type Filter = 'all' | 'new' | 'inCrm';

interface Props {
  organizationId: string;
  onImported: () => void;
}

function matchesQuery(row: AcuityClientRow, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const digits = q.replace(/\D/g, '');
  return (
    row.name.toLowerCase().includes(q) ||
    (row.email ?? '').toLowerCase().includes(q) ||
    (digits.length >= 3 && (row.phone ?? '').replace(/\D/g, '').includes(digits))
  );
}

export const AcuityClientsImport: React.FC<Props> = ({ organizationId, onImported }) => {
  const { t } = useTranslation('integrations');
  const { toast } = useToast();
  const summaryText = useSummaryText();

  const [rows, setRows] = useState<AcuityClientRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  // Set when the list holds Acuity search results instead of every client.
  const [searchTerm, setSearchTerm] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcomes, setOutcomes] = useState<Map<string, ClientImportItem>>(new Map());
  const busy = loading || Boolean(progress);

  const counts = useMemo(() => {
    const list = rows ?? [];
    const inCrm = list.filter((r) => r.crm).length;
    return { all: list.length, inCrm, new: list.length - inCrm };
  }, [rows]);

  const filtered = useMemo(
    () =>
      (rows ?? []).filter(
        (r) => (filter === 'all' || (filter === 'new' ? !r.crm : Boolean(r.crm))) && matchesQuery(r, query.trim()),
      ),
    [rows, filter, query],
  );
  const { page, pages, visible, setPage } = usePaged(filtered);
  const filteredKeys = useMemo(() => filtered.map((r) => r.key), [filtered]);

  const load = async (search = '') => {
    setLoading(true);
    try {
      const result = await acuityApi.listClients(organizationId, search);
      setRows(result.clients);
      setTruncated(result.truncated);
      setSearchTerm(search || null);
      if (search) setQuery('');
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

  const runImport = async () => {
    const chosen = (rows ?? []).filter((r) => selected.has(r.key));
    if (chosen.length === 0) return;
    let summary = EMPTY_SUMMARY;
    let done = 0;
    const results = new Map(outcomes);
    setProgress({ done: 0, total: chosen.length });
    try {
      for (const batch of chunk(chosen, CLIENT_IMPORT_BATCH)) {
        const res = await acuityApi.importClients(organizationId, batch);
        summary = addSummaries(summary, res.summary);
        res.results.forEach((item) => results.set(item.key, item));
        done += batch.length;
        setProgress({ done, total: chosen.length });
      }
      toast({ title: t('acuity.import.importDone'), description: summaryText(summary) });
    } catch (err) {
      const reason = errorMessage(err, t('acuity.errors.generic'));
      toast({
        title: t('acuity.import.importFailed'),
        description: done > 0
          ? `${t('acuity.import.partial', { done, total: chosen.length })} ${summaryText(summary)}. ${reason}`
          : reason,
        variant: 'destructive',
      });
    } finally {
      setProgress(null);
      setOutcomes(results);
      // Reflect what the server did without reloading the whole Acuity list.
      setRows((prev) =>
        (prev ?? []).map((row) => {
          const item = results.get(row.key);
          if (!item?.clientId || (item.status !== 'created' && item.status !== 'linked')) return row;
          return {
            ...row,
            crm: { id: item.clientId, name: item.clientName ?? row.name, by: row.crm?.by ?? 'email', linked: true },
            similar: null,
          };
        }),
      );
      // Rows that went through leave the selection; unprocessed or failed ones stay for a retry.
      setSelected((prev) => {
        const next = new Set(prev);
        results.forEach((item, key) => {
          if (item.status !== 'error') next.delete(key);
        });
        return next;
      });
      if (done > 0) onImported();
    }
  };

  const crmBadge = (row: AcuityClientRow) => {
    if (row.crm?.linked) return <Badge className="bg-green-600 hover:bg-green-600">{t('acuity.clients.status.linked')}</Badge>;
    if (row.crm) {
      return (
        <Badge variant="outline" title={t(row.crm.by === 'email' ? 'acuity.clients.status.byEmail' : 'acuity.clients.status.byPhone')}>
          {t('acuity.clients.status.inCrm')}
        </Badge>
      );
    }
    if (row.ambiguous) {
      return (
        <Badge variant="outline" className="border-amber-500 text-amber-700">
          {t('acuity.clients.status.ambiguous')}
        </Badge>
      );
    }
    return <Badge variant="secondary">{t('acuity.clients.status.new')}</Badge>;
  };

  const outcomeText = (row: AcuityClientRow) => {
    const item = outcomes.get(row.key);
    if (!item) return null;
    const reason = item.reason ? t(`acuity.clients.skipReasons.${item.reason}`, { defaultValue: item.reason }) : '';
    return (
      <div className={item.status === 'skipped' || item.status === 'error' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
        {t(`acuity.import.outcome.${item.status}`)}
        {reason ? ` — ${reason}` : ''}
      </div>
    );
  };

  const rowLabel = (row: AcuityClientRow) =>
    t('acuity.clients.selectRow', { name: row.name || row.email || row.phone || t('acuity.clients.unnamed') });

  if (!rows) {
    return (
      <div className="flex flex-col items-start gap-3 py-2">
        <p className="text-sm text-muted-foreground">{t('acuity.clients.intro')}</p>
        <Button type="button" onClick={() => load()} disabled={loading}>
          {loading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Search className="me-2 h-4 w-4" />}
          {t('acuity.clients.load')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder={t('acuity.import.filterPlaceholder')}
          aria-label={t('acuity.import.filterPlaceholder')}
          className="sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {(truncated || searchTerm !== null) && (
            <Button type="button" variant="secondary" onClick={() => load(query.trim())} disabled={busy || !query.trim()}>
              <Search className="me-2 h-4 w-4" />
              {t('acuity.clients.searchAcuity')}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => load()} disabled={busy}>
            {loading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <RefreshCw className="me-2 h-4 w-4" />}
            {searchTerm !== null ? t('acuity.clients.showAll') : t('acuity.import.reload')}
          </Button>
        </div>
      </div>

      {searchTerm !== null ? (
        <Alert>
          <AlertDescription>{t('acuity.clients.searchResults', { term: searchTerm })}</AlertDescription>
        </Alert>
      ) : (
        truncated && (
          <Alert>
            <AlertDescription>{t('acuity.clients.truncated', { n: rows.length })}</AlertDescription>
          </Alert>
        )
      )}

      <FilterChips<Filter>
        value={filter}
        onChange={(key) => {
          setFilter(key);
          setPage(1);
        }}
        options={[
          { key: 'all', label: t('acuity.clients.filters.all', { n: counts.all }) },
          { key: 'new', label: t('acuity.clients.filters.new', { n: counts.new }) },
          { key: 'inCrm', label: t('acuity.clients.filters.inCrm', { n: counts.inCrm }) },
        ]}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                aria-label={t('acuity.import.selectAll')}
                checked={headerCheckState(filteredKeys, selected)}
                onCheckedChange={(checked) => setSelected(toggleAll(filteredKeys, selected, checked === true))}
                disabled={filteredKeys.length === 0 || Boolean(progress)}
              />
            </TableHead>
            <TableHead>{t('acuity.clients.columns.name')}</TableHead>
            <TableHead>{t('acuity.clients.columns.email')}</TableHead>
            <TableHead>{t('acuity.clients.columns.phone')}</TableHead>
            <TableHead>{t('acuity.clients.columns.crm')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                {t('acuity.import.noResults')}
              </TableCell>
            </TableRow>
          ) : (
            visible.map((row) => (
              <TableRow key={row.key} data-state={selected.has(row.key) ? 'selected' : undefined}>
                <TableCell>
                  <Checkbox
                    aria-label={rowLabel(row)}
                    checked={selected.has(row.key)}
                    onCheckedChange={(checked) => setSelected(toggleOne(row.key, selected, checked === true))}
                    disabled={Boolean(progress)}
                  />
                </TableCell>
                <TableCell>
                  <div className="font-medium">{row.name || '—'}</div>
                  {!row.crm && row.similar && (
                    <div className="text-xs text-amber-600">
                      {t(row.similar.reason === 'phone' ? 'acuity.clients.status.samePhone' : 'acuity.clients.status.similar', {
                        name: row.similar.name,
                      })}
                    </div>
                  )}
                  {outcomeText(row)}
                </TableCell>
                <TableCell>
                  <span className="ltr-inline" dir="ltr">{row.email || '—'}</span>
                </TableCell>
                <TableCell>
                  <span className="ltr-inline" dir="ltr">{row.phone || '—'}</span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    {crmBadge(row)}
                    {row.crm && !row.crm.linked && (
                      <span className="text-xs text-muted-foreground">{row.crm.name}</span>
                    )}
                  </div>
                </TableCell>
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
      />
      <p className="text-xs text-muted-foreground">{t('acuity.clients.importHelp')}</p>
    </div>
  );
};
