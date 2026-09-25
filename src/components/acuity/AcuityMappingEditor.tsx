import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AcuityResolvedRef, CrmNamedRef } from '@/lib/acuityApi';

const NOT_LINKED = '__none__';

export interface MappingEntry {
  acuityId: string;
  acuityName: string;
  resolved: AcuityResolvedRef;
}

interface Props {
  types: MappingEntry[];
  calendars: MappingEntry[];
  treatments: CrmNamedRef[];
  staff: CrmNamedRef[];
  onChangeType: (acuityId: string, crmId: string | null) => void;
  onChangeCalendar: (acuityId: string, crmId: string | null) => void;
  busy: boolean;
}

function MappingTable({
  entries,
  targets,
  acuityLabel,
  crmLabel,
  onChange,
  busy,
}: {
  entries: MappingEntry[];
  targets: CrmNamedRef[];
  acuityLabel: string;
  crmLabel: string;
  onChange: (acuityId: string, crmId: string | null) => void;
  busy: boolean;
}) {
  const { t } = useTranslation('integrations');
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 text-xs font-medium text-muted-foreground">
        <span>{acuityLabel}</span>
        <span>{crmLabel}</span>
      </div>
      {entries.map((entry) => (
        <div key={entry.acuityId} className="grid grid-cols-2 items-center gap-3">
          <span className="text-sm">{entry.acuityName || '—'}</span>
          <div>
            <Select
              value={entry.resolved.id ?? NOT_LINKED}
              onValueChange={(value) => onChange(entry.acuityId, value === NOT_LINKED ? null : value)}
              disabled={busy}
            >
              <SelectTrigger className="h-9" aria-label={t('acuity.mapping.selectFor', { name: entry.acuityName })}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.name}
                  </SelectItem>
                ))}
                <SelectItem value={NOT_LINKED}>{t('acuity.mapping.notLinked')}</SelectItem>
              </SelectContent>
            </Select>
            {(entry.resolved.via === 'name' || entry.resolved.via === 'portal') && (
              <p className="mt-1 text-xs text-muted-foreground">{t('acuity.mapping.auto')}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Which CRM treatment / staff member each Acuity appointment type / calendar
 * becomes on import. Only the types and calendars in the loaded list are shown.
 */
export const AcuityMappingEditor: React.FC<Props> = ({
  types,
  calendars,
  treatments,
  staff,
  onChangeType,
  onChangeCalendar,
  busy,
}) => {
  const { t } = useTranslation('integrations');
  const [open, setOpen] = useState(false);
  const showCalendars = staff.length > 0 && calendars.length > 0;
  if (types.length === 0 && !showCalendars) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 p-3 text-start">
        <span>
          <span className="block text-sm font-medium">{t('acuity.mapping.title')}</span>
          <span className="block text-xs text-muted-foreground">{t('acuity.mapping.description')}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-5 border-t p-3">
        {types.length > 0 && (
          <MappingTable
            entries={types}
            targets={treatments}
            acuityLabel={t('acuity.mapping.acuityType')}
            crmLabel={t('acuity.mapping.crmTreatment')}
            onChange={onChangeType}
            busy={busy}
          />
        )}
        {showCalendars && (
          <MappingTable
            entries={calendars}
            targets={staff}
            acuityLabel={t('acuity.mapping.acuityCalendar')}
            crmLabel={t('acuity.mapping.crmStaff')}
            onChange={onChangeCalendar}
            busy={busy}
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};
