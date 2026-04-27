
import React, { useState, useCallback } from 'react';
import { Plus, User, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClientsFilters } from '@/components/clients/ClientsFilters';
import { ClientStatsCards } from '@/components/clients/ClientStatsCards';
import { ClientsView } from '@/components/clients/ClientsView';
import { ClientsModals } from '@/components/clients/ClientsModals';
import { useClientOperations } from '@/hooks/useClientOperations';
import { useClientFilters } from '@/hooks/useClientFilters';
import { useDeletedClientsCount } from '@/hooks/useDeletedClientsCount';
import { usePaginatedClients, PAGE_SIZE } from '@/hooks/usePaginatedClients';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate } from 'react-router-dom';

const Clients = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { deletedCount } = useDeletedClientsCount();

  // Version bump triggers a refetch in usePaginatedClients after mutations
  const [mutationVersion, setMutationVersion] = useState(0);
  const bumpVersion = useCallback(() => setMutationVersion(v => v + 1), []);

  const {
    selectedClient,
    isDetailsModalOpen,
    setIsDetailsModalOpen,
    isAddModalOpen,
    setIsAddModalOpen,
    isAssignmentModalOpen,
    setIsAssignmentModalOpen,
    isProductAssignmentModalOpen,
    setIsProductAssignmentModalOpen,
    isBookingModalOpen,
    setIsBookingModalOpen,
    isNewAppointmentModalOpen,
    setIsNewAppointmentModalOpen,
    isEditing,
    detailsInitialTab,
    handleStatusChange,
    handleSaveClient,
    handleViewDetails,
    handleEditClient,
    handleSendWaiver,
    openAssignmentModal,
    openProductAssignmentModal,
    openBookingModal,
    handleAssignmentWrapper,
    handleProductAssignmentWrapper,
    handleBookingWrapper,
    handleAddClientWrapper,
    handleDeleteClient,
  } = useClientOperations();

  const {
    searchTerm,
    setSearchTerm,
    filterStatus,
    setFilterStatus,
    viewMode,
    setViewMode,
    page,
    setPage,
  } = useClientFilters();

  const { clients: pagedClients, totalCount, loading } = usePaginatedClients({
    searchTerm,
    filterStatus,
    page,
    version: mutationVersion,
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const from = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, totalCount);

  // Wrap mutations to trigger a paginated-data refetch
  const handleDeleteClientWithRefetch = useCallback(async (clientId: string) => {
    await handleDeleteClient(clientId);
    bumpVersion();
  }, [handleDeleteClient, bumpVersion]);

  const handleSaveClientWithRefetch = useCallback(async (clientData: Parameters<typeof handleSaveClient>[0]) => {
    await handleSaveClient(clientData);
    bumpVersion();
  }, [handleSaveClient, bumpVersion]);

  const handleStatusChangeWithRefetch = useCallback(async (clientId: string, newStatus: string) => {
    await handleStatusChange(clientId, newStatus);
    bumpVersion();
  }, [handleStatusChange, bumpVersion]);

  const handleAddClientWithRefetch = useCallback(async (clientData: Parameters<typeof handleAddClientWrapper>[0]) => {
    await handleAddClientWrapper(clientData);
    bumpVersion();
  }, [handleAddClientWrapper, bumpVersion]);

  // Pagination controls
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const renderPaginationNumbers = () => {
    if (totalPages <= 1) return null;
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('ellipsis');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages.map((p, idx) =>
      p === 'ellipsis' ? (
        <span key={`e${idx}`} className="px-1 text-muted-foreground text-sm">…</span>
      ) : (
        <button
          key={p}
          onClick={() => setPage(p)}
          className={`min-w-[2rem] h-8 px-2 rounded-md text-sm font-medium transition-colors ${
            p === page
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted text-foreground'
          }`}
        >
          {p}
        </button>
      )
    );
  };

  return (
    <div className="w-full max-w-none mx-auto px-2 sm:px-4 lg:px-6">
      <div className="space-y-4 sm:space-y-5 w-full overflow-hidden">
        {/* Header */}
        <div className="flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:justify-between sm:items-start border-b border-border pb-4 gap-3 sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground mt-1">Manage your client database</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto flex-shrink-0">
            {deletedCount > 0 && (
              <Button
                variant="outline"
                className="w-full sm:w-auto order-3 sm:order-1"
                onClick={() => navigate('/admin/clients/trash')}
              >
                <Trash2 className="mr-2 h-4 w-4 flex-shrink-0" />
                <span className="truncate">Trash ({deletedCount})</span>
              </Button>
            )}
            <Button
              className="w-full sm:w-auto order-2 sm:order-2"
              onClick={() => setIsAddModalOpen(true)}
            >
              <User className="mr-2 h-4 w-4 flex-shrink-0" />
              <span className="truncate">Add Client</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsNewAppointmentModalOpen(true)}
              className="w-full sm:w-auto order-1 sm:order-3"
            >
              <Plus className="mr-2 h-4 w-4 flex-shrink-0" />
              <span className="truncate">New Appointment</span>
            </Button>
          </div>
        </div>

        {/* Client Stats */}
        <div className="w-full overflow-hidden">
          <ClientStatsCards clients={pagedClients} totalCount={totalCount} />
        </div>

        {/* Filters */}
        <div className="w-full overflow-hidden">
          <ClientsFilters
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            viewMode={viewMode}
            setViewMode={setViewMode}
          />
        </div>

        {/* Clients View */}
        <div className="w-full overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              Loading clients…
            </div>
          ) : (
            <ClientsView
              viewMode={viewMode}
              filteredClients={pagedClients}
              onStatusChange={handleStatusChangeWithRefetch}
              onViewDetails={handleViewDetails}
              onEditClient={handleEditClient}
              onBookAppointment={openBookingModal}
              onAssignPackage={openAssignmentModal}
              onDeleteClient={handleDeleteClientWithRefetch}
              onSendWaiver={handleSendWaiver}
            />
          )}
        </div>

        {/* Pagination + summary */}
        {totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <p className="text-sm text-muted-foreground">
              Showing {from}–{to} of {totalCount} client{totalCount !== 1 ? 's' : ''}
              {deletedCount > 0 && (
                <> •{' '}
                  <button
                    onClick={() => navigate('/admin/clients/trash')}
                    className="text-destructive hover:underline"
                  >
                    {deletedCount} in trash
                  </button>
                </>
              )}
            </p>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p - 1)}
                  disabled={!canPrev}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                {renderPaginationNumbers()}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={!canNext}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Modals */}
        <ClientsModals
          selectedClient={selectedClient}
          isDetailsModalOpen={isDetailsModalOpen}
          onCloseDetailsModal={() => setIsDetailsModalOpen(false)}
          onSave={handleSaveClientWithRefetch}
          isEditing={isEditing}
          detailsInitialTab={detailsInitialTab}
          isAddModalOpen={isAddModalOpen}
          onCloseAddModal={() => setIsAddModalOpen(false)}
          onAdd={handleAddClientWithRefetch}
          isAssignmentModalOpen={isAssignmentModalOpen}
          onCloseAssignmentModal={() => setIsAssignmentModalOpen(false)}
          onAssign={handleAssignmentWrapper}
          isProductAssignmentModalOpen={isProductAssignmentModalOpen}
          onCloseProductAssignmentModal={() => setIsProductAssignmentModalOpen(false)}
          onProductAssign={handleProductAssignmentWrapper}
          isBookingModalOpen={isBookingModalOpen}
          onCloseBookingModal={() => setIsBookingModalOpen(false)}
          onBook={handleBookingWrapper}
          isNewAppointmentModalOpen={isNewAppointmentModalOpen}
          onCloseNewAppointmentModal={() => setIsNewAppointmentModalOpen(false)}
          openBookingModal={openBookingModal}
          openAssignmentModal={openAssignmentModal}
          openProductAssignmentModal={openProductAssignmentModal}
        />
      </div>
    </div>
  );
};

export default Clients;
