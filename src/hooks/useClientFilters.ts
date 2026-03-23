
import { useState, useCallback } from 'react';

export const useClientFilters = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
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

  return {
    searchTerm,
    setSearchTerm: handleSetSearchTerm,
    filterStatus,
    setFilterStatus: handleSetFilterStatus,
    viewMode,
    setViewMode,
    page,
    setPage,
  };
};
