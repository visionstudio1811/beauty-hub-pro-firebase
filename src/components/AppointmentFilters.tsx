import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar, Filter, Search, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { sanitizeString, sanitizeDateString } from '@/lib/dataSanitization';

interface AppointmentFiltersProps {
  dateFilter: string;
  staffFilter: string;
  statusFilter: string;
  searchQuery: string;
  treatmentFilter: string;
  viewMode: 'day' | 'week' | 'month';
  layoutMode: 'list' | 'grid' | 'calendar';
  onDateFilterChange: (date: string) => void;
  onStaffFilterChange: (staff: string) => void;
  onStatusFilterChange: (status: string) => void;
  onSearchQueryChange: (query: string) => void;
  onTreatmentFilterChange: (treatment: string) => void;
  onViewModeChange: (mode: 'day' | 'week' | 'month') => void;
  onLayoutModeChange: (mode: 'list' | 'grid' | 'calendar') => void;
  onClearFilters: () => void;
  staff: string[];
  treatments: string[];
}

const AppointmentFilters = ({
  dateFilter,
  staffFilter,
  statusFilter,
  searchQuery,
  treatmentFilter,
  viewMode,
  layoutMode,
  onDateFilterChange,
  onStaffFilterChange,
  onStatusFilterChange,
  onSearchQueryChange,
  onTreatmentFilterChange,
  onViewModeChange,
  onLayoutModeChange,
  onClearFilters,
  staff,
  treatments
}: AppointmentFiltersProps) => {
  console.log('🎛️ AppointmentFilters render with sanitized values:', {
    dateFilter: sanitizeString(dateFilter, ''),
    staffFilter: sanitizeString(staffFilter, 'all'),
    statusFilter: sanitizeString(statusFilter, 'all'),
    searchQuery: sanitizeString(searchQuery, ''),
    treatmentFilter: sanitizeString(treatmentFilter, 'all'),
    viewMode,
    layoutMode,
    staffCount: staff?.length || 0,
    treatmentsCount: treatments?.length || 0
  });

  const statuses = ['all', 'scheduled', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show'];

  const hasActiveFilters = staffFilter !== 'all' || statusFilter !== 'all' ||
    treatmentFilter !== 'all' || searchQuery !== '';

  const handleDateFilterChange = (value: string) => {
    const sanitized = sanitizeDateString(value, '');
    console.log('📅 Date filter changed (sanitized):', value, '->', sanitized);
    onDateFilterChange(sanitized);
  };

  const handleSearchQueryChange = (value: string) => {
    const sanitized = sanitizeString(value, '');
    console.log('🔍 Search query changed (sanitized):', value, '->', sanitized);
    onSearchQueryChange(sanitized);
  };

  const handleStaffFilterChange = (value: string) => {
    const sanitized = sanitizeString(value, 'all');
    console.log('👥 Staff filter changed (sanitized):', value, '->', sanitized);
    onStaffFilterChange(sanitized);
  };

  const handleStatusFilterChange = (value: string) => {
    const sanitized = sanitizeString(value, 'all');
    console.log('📊 Status filter changed (sanitized):', value, '->', sanitized);
    onStatusFilterChange(sanitized);
  };

  const handleTreatmentFilterChange = (value: string) => {
    const sanitized = sanitizeString(value, 'all');
    console.log('💊 Treatment filter changed (sanitized):', value, '->', sanitized);
    onTreatmentFilterChange(sanitized);
  };

  return (
    <Card className="w-full max-w-full overflow-hidden shadow-sm border-gray-200 dark:border-gray-800">
      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* Layout Mode Controls */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Layout</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['list', 'grid', 'calendar'] as const).map((mode) => (
              <Button
                key={mode}
                variant={layoutMode === mode ? 'default' : 'outline'}
                onClick={() => onLayoutModeChange(mode)}
                size="sm"
                className="text-xs px-3 py-2 h-9 capitalize"
              >
                {mode}
              </Button>
            ))}
          </div>
        </div>

        {/* Date and Search Row with sanitization */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Calendar className="h-4 w-4 text-gray-500 flex-shrink-0" />
            <Input
              type="date"
              value={sanitizeString(dateFilter, '')}
              onChange={(e) => handleDateFilterChange(e.target.value)}
              className="flex-1 text-sm min-w-0"
            />
          </div>
          
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Search className="h-4 w-4 text-gray-500 flex-shrink-0" />
            <Input
              placeholder="Search appointments..."
              value={sanitizeString(searchQuery, '')}
              onChange={(e) => handleSearchQueryChange(e.target.value)}
              className="flex-1 text-sm min-w-0"
            />
          </div>
        </div>

        {/* Filter Controls with sanitized dropdowns */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters</span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Select value={sanitizeString(staffFilter, 'all')} onValueChange={handleStaffFilterChange}>
              <SelectTrigger className="w-full text-sm h-10">
                <SelectValue placeholder="All Staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {(staff || []).map(member => (
                  <SelectItem key={member} value={sanitizeString(member, 'Unknown')}>
                    {sanitizeString(member, 'Unknown Staff')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sanitizeString(statusFilter, 'all')} onValueChange={handleStatusFilterChange}>
              <SelectTrigger className="w-full text-sm h-10">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                {statuses.map(status => (
                  <SelectItem key={status} value={status}>
                    {status === 'all' ? 'All Status' : status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sanitizeString(treatmentFilter, 'all')} onValueChange={handleTreatmentFilterChange}>
              <SelectTrigger className="w-full text-sm h-10">
                <SelectValue placeholder="All Treatments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Treatments</SelectItem>
                {(treatments || []).map(treatment => (
                  <SelectItem key={treatment} value={sanitizeString(treatment, 'Unknown')}>
                    {sanitizeString(treatment, 'Unknown Treatment')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <div className="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Filter className="h-4 w-4 flex-shrink-0" />
              <span>Active filters applied</span>
            </div>
            <Button
              variant="outline"
              onClick={onClearFilters}
              size="sm"
              className="flex items-center gap-2 text-sm h-9"
            >
              <X className="h-4 w-4" />
              Clear Filters
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AppointmentFilters;
