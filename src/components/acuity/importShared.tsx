import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ImportSummary } from '@/lib/acuityApi';

export const PAGE_SIZE = 50;
/** Imports at least this big ask for confirmation first. */
const CONFIRM_THRESHOLD = 100;

/**
 * Message for a failed callable. Server HttpsErrors carry translated text; a
 * client-side failure (network, timeout) only has the bare code as its
 * message ("internal", "deadline-exceeded"), so fall back to our own copy.
 */
export function errorMessage(err: unknown, fallback: string): string {
  const e = err as { message?: unknown; code?: unknown } | null;
  const message = typeof e?.message === 'string' ? e.message.trim() : '';
  const code = typeof e?.code === 'string' ? e.code.replace(/^functions\//, '') : '';
  if (!message || message === code || /^[a-z-]+$/.test(message)) return fallback;
  return message;
}

/** "3 new · 1 linked to existing · 2 skipped" */
export function useSummaryText() {
  const { t } = useTranslation('integrations');
  return (summary: ImportSummary) => {
    const parts = (['created', 'linked', 'updated', 'skipped', 'errors'] as const)
      .filter((k) => summary[k] > 0)
      .map((k) => t(`acuity.import.summary.${k}`, { count: summary[k] }));
    return parts.length ? parts.join(' · ') : t('acuity.import.summary.nothing');
  };
}

export function FilterChips<K extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ key: K; label: string }>;
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Button
          key={option.key}
          type="button"
          size="sm"
          variant={value === option.key ? 'default' : 'outline'}
          aria-pressed={value === option.key}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

/** Client-side paging over an already-filtered list. Callers reset to page 1 when their filters change. */
export function usePaged<T>(rows: T[]) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = useMemo(() => rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), [rows, current]);
  return { page: current, pages, visible, setPage };
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  const { t } = useTranslation('integrations');
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('acuity.import.previous')}
      </Button>
      <span className="text-muted-foreground">{t('acuity.import.pageOf', { page, pages })}</span>
      <Button type="button" size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t('acuity.import.next')}
      </Button>
    </div>
  );
}

/** Tri-state header checkbox value for "select everything in the current filter". */
export function headerCheckState(ids: string[], selected: Set<string>): boolean | 'indeterminate' {
  const count = ids.filter((id) => selected.has(id)).length;
  if (count === 0) return false;
  return count === ids.length ? true : 'indeterminate';
}

export function toggleAll(ids: string[], selected: Set<string>, checked: boolean): Set<string> {
  const next = new Set(selected);
  for (const id of ids) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}

export function toggleOne(id: string, selected: Set<string>, checked: boolean): Set<string> {
  const next = new Set(selected);
  if (checked) next.add(id);
  else next.delete(id);
  return next;
}

/** Selection count, clear, and the import button / progress. Large imports ask for confirmation. */
export function ImportBar({
  selectedCount,
  progress,
  onClear,
  onImport,
  children,
}: {
  selectedCount: number;
  progress: { done: number; total: number } | null;
  onClear: () => void;
  onImport: () => void;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation('integrations');
  const [confirming, setConfirming] = useState(false);
  const start = () => (selectedCount >= CONFIRM_THRESHOLD ? setConfirming(true) : onImport());
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium">{t('acuity.import.selected', { count: selectedCount })}</span>
        {selectedCount > 0 && !progress && (
          <button type="button" className="text-muted-foreground underline" onClick={onClear}>
            {t('acuity.import.clearSelection')}
          </button>
        )}
        {children}
      </div>
      <Button type="button" onClick={start} disabled={selectedCount === 0 || Boolean(progress)}>
        <span aria-live="polite">
          {progress
            ? t('acuity.import.importing', { done: progress.done, total: progress.total })
            : t('acuity.import.importSelected', { count: selectedCount })}
        </span>
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('acuity.import.confirmTitle', { count: selectedCount })}</AlertDialogTitle>
            <AlertDialogDescription>{t('acuity.import.confirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false);
                onImport();
              }}
            >
              {t('common:actions.import')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
