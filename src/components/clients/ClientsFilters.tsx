
import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Grid, List } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import type { SortField, SortDir } from '@/hooks/useClientFilters';
import { useTranslation } from 'react-i18next';

type PurchaseFilter = 'all' | 'has_packages' | 'has_products' | 'has_both' | 'none';

// Combined sort value packs field+direction into one <select> for compactness.
type SortValue =
  | 'created_desc' | 'created_asc'
  | 'visits_desc' | 'visits_asc'
  | 'revenue_desc' | 'revenue_asc'
  | 'lastVisit_desc' | 'lastVisit_asc';

const toSortValue = (field: SortField, dir: SortDir): SortValue =>
  `${field}_${dir}` as SortValue;

const fromSortValue = (v: SortValue): { field: SortField; dir: SortDir } => {
  const [field, dir] = v.split('_') as [SortField, SortDir];
  return { field, dir };
};

interface ClientsFiltersProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filterStatus: string;
  setFilterStatus: (status: string) => void;
  purchaseFilter: PurchaseFilter;
  setPurchaseFilter: (value: PurchaseFilter) => void;
  viewMode: 'table' | 'grid';
  setViewMode: (mode: 'table' | 'grid') => void;
  sortField: SortField;
  setSortField: (value: SortField) => void;
  sortDir: SortDir;
  setSortDir: (value: SortDir) => void;
}

export const ClientsFilters: React.FC<ClientsFiltersProps> = ({
  searchTerm,
  setSearchTerm,
  filterStatus,
  setFilterStatus,
  purchaseFilter,
  setPurchaseFilter,
  viewMode,
  setViewMode,
  sortField,
  setSortField,
  sortDir,
  setSortDir,
}) => {
  const { t } = useTranslation('clients');
  const isMobile = useIsMobile();
  const isAdmin = useIsAdmin();

  const sortValue = toSortValue(sortField, sortDir);
  const handleSortChange = (v: string) => {
    const { field, dir } = fromSortValue(v as SortValue);
    setSortField(field);
    setSortDir(dir);
  };

  const sortSelect = (
    <select
      value={sortValue}
      onChange={(e) => handleSortChange(e.target.value)}
      className={
        isMobile
          ? 'w-full px-3 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-sm'
          : 'px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-sm min-w-[180px]'
      }
    >
      <option value="created_desc">{t('filters.sort.createdDesc')}</option>
      <option value="created_asc">{t('filters.sort.createdAsc')}</option>
      <option value="visits_desc">{t('filters.sort.visitsDesc')}</option>
      <option value="visits_asc">{t('filters.sort.visitsAsc')}</option>
      <option value="revenue_desc">{t('filters.sort.revenueDesc')}</option>
      <option value="revenue_asc">{t('filters.sort.revenueAsc')}</option>
      <option value="lastVisit_desc">{t('filters.sort.lastVisitDesc')}</option>
      <option value="lastVisit_asc">{t('filters.sort.lastVisitAsc')}</option>
    </select>
  );

  const statusOptions = (
    <>
      <option value="">{t('filters.allStatus')}</option>
      <option value="Have Membership">{t('status.haveMembership')}</option>
      <option value="Membership Ended">{t('status.membershipEnded')}</option>
      <option value="Don't Have Membership">{t('status.noMembership')}</option>
    </>
  );

  const purchaseOptions = (
    <>
      <option value="all">{t('filters.purchases.all')}</option>
      <option value="has_packages">{t('filters.purchases.hasPackages')}</option>
      <option value="has_products">{t('filters.purchases.hasProducts')}</option>
      <option value="has_both">{t('filters.purchases.hasBoth')}</option>
      <option value="none">{t('filters.purchases.none')}</option>
    </>
  );

  return (
    <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-lg border space-y-3 sm:space-y-0">
      {/* Mobile: Stack everything vertically */}
      {isMobile ? (
        <>
          {/* Search */}
          <div className="relative">
            <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder={t('filters.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ps-10 h-11"
            />
          </div>

          {/* Filters and View Toggle */}
          <div className="flex flex-col space-y-3">
            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-sm"
            >
              {statusOptions}
            </select>

            {/* Purchase Filter — admin only */}
            {isAdmin && (
              <select
                value={purchaseFilter}
                onChange={(e) => setPurchaseFilter(e.target.value as PurchaseFilter)}
                className="w-full px-3 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-sm"
              >
                {purchaseOptions}
              </select>
            )}

            {/* Sort */}
            {sortSelect}

            {/* View Mode Toggle */}
            <div className="flex border border-gray-300 rounded-md overflow-hidden">
              <Button
                size="sm"
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                onClick={() => setViewMode('table')}
                className="flex-1 rounded-none border-0 h-11"
              >
                <List className="h-4 w-4 me-2" />
                {t('filters.tableView')}
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                onClick={() => setViewMode('grid')}
                className="flex-1 rounded-none border-0 h-11"
              >
                <Grid className="h-4 w-4 me-2" />
                {t('filters.gridView')}
              </Button>
            </div>
          </div>
        </>
      ) : (
        /* Desktop: Horizontal layout */
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder={t('filters.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ps-10"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center flex-wrap">
            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-sm min-w-[180px]"
            >
              {statusOptions}
            </select>

            {/* Purchase Filter — admin only */}
            {isAdmin && (
              <select
                value={purchaseFilter}
                onChange={(e) => setPurchaseFilter(e.target.value as PurchaseFilter)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-sm min-w-[180px]"
              >
                {purchaseOptions}
              </select>
            )}

            {/* Sort */}
            {sortSelect}

            {/* View Mode Toggle */}
            <div className="flex border border-gray-300 rounded-md overflow-hidden">
              <Button
                size="sm"
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                onClick={() => setViewMode('table')}
                className="rounded-none border-0 min-w-[44px]"
                title={t('filters.tableView')}
                aria-label={t('filters.tableView')}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                onClick={() => setViewMode('grid')}
                className="rounded-none border-0 min-w-[44px]"
                title={t('filters.gridView')}
                aria-label={t('filters.gridView')}
              >
                <Grid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
