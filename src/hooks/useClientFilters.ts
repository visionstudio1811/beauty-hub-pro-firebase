
import { useState, useCallback } from 'react';

export type PurchaseFilter = 'all' | 'has_packages' | 'has_products' | 'has_both' | 'none';

// Visits = package sessions used + standalone completed appointments.
// Revenue = sum of purchases + standalone product assignments.
// LastVisit = most recent appointment_date.
// Created = client created_at (default).
export type SortField = 'created' | 'visits' | 'revenue' | 'lastVisit';
export type SortDir = 'asc' | 'desc';

export const useClientFilters = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [purchaseFilter, setPurchaseFilter] = useState<PurchaseFilter>('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [sortField, setSortField] = useState<SortField>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever search or filter changes
  const handleSetSearchTerm = useCallback((value: string) => {
    setSearchTerm(value);
    setPage(1);
  }, []);

  const handleSetFilterStatus = useCallback((value: string) => {
    setFilterStatus(value);
    setPage(1);
  }, []);

  const handleSetPurchaseFilter = useCallback((value: PurchaseFilter) => {
    setPurchaseFilter(value);
    setPage(1);
  }, []);

  const handleSetSortField = useCallback((value: SortField) => {
    setSortField(value);
    setPage(1);
  }, []);

  const handleSetSortDir = useCallback((value: SortDir) => {
    setSortDir(value);
    setPage(1);
  }, []);

  return {
    searchTerm,
    setSearchTerm: handleSetSearchTerm,
    filterStatus,
    setFilterStatus: handleSetFilterStatus,
    purchaseFilter,
    setPurchaseFilter: handleSetPurchaseFilter,
    viewMode,
    setViewMode,
    sortField,
    setSortField: handleSetSortField,
    sortDir,
    setSortDir: handleSetSortDir,
    page,
    setPage,
  };
};
