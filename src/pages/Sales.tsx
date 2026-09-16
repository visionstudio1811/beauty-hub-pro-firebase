import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { PurchasesSection } from '@/components/dashboard/PurchasesSection';

const Sales: React.FC = () => {
  const { t } = useTranslation('dashboard');
  const [dateFilter, setDateFilter] = useState<string>('');

  return (
    <div className="space-y-5 max-w-full">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-violet-600" />
            {t('sales.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('sales.subtitle')}</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="grid gap-1">
            <Label htmlFor="sales-date" className="text-xs">{t('sales.date')}</Label>
            <Input
              id="sales-date"
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-44"
            />
          </div>
          {dateFilter && (
            <Button variant="outline" size="sm" onClick={() => setDateFilter('')}>
              {t('sales.showAll')}
            </Button>
          )}
        </div>
      </div>

      <PurchasesSection
        dateFilter={dateFilter}
        title={t('sales.revenueDetail')}
        description={
          dateFilter
            ? t('sales.showingOnDate', { date: dateFilter })
            : t('sales.showingAll')
        }
      />
    </div>
  );
};

export default Sales;
