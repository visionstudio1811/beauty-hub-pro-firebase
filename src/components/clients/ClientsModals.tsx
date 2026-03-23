
import React from 'react';
import { EnhancedClientDetailsModal } from './EnhancedClientDetailsModal';
import AddClientModal from '@/components/AddClientModal';
import { AppointmentFormModal } from '@/components/AppointmentFormModal';
import { PackageAssignmentModal } from '@/components/PackageAssignmentModal';
import { AssignmentModal } from '@/components/AssignmentModal';
import { Client } from '@/hooks/useClients';

interface ClientsModalsProps {
  selectedClient: Client | null;
  isDetailsModalOpen: boolean;
  onCloseDetailsModal: () => void;
  onSave: (client: Client) => Promise<void>;
  isEditing: boolean;
  detailsInitialTab?: string;
  isAddModalOpen: boolean;
  onCloseAddModal: () => void;
  onAdd: (clientData: Omit<Client, 'id' | 'created_at' | 'updated_at'>) => void;
  isAssignmentModalOpen: boolean;
  onCloseAssignmentModal: () => void;
  onAssign: (client: Client, assignment: any) => void;
  isProductAssignmentModalOpen: boolean;
  onCloseProductAssignmentModal: () => void;
  onProductAssign: (client: Client, assignment: any) => void;
  isBookingModalOpen: boolean;
  onCloseBookingModal: () => void;
  onBook: (client: Client, booking: any) => void;
  isNewAppointmentModalOpen: boolean;
  onCloseNewAppointmentModal: () => void;
  openBookingModal: (client: Client) => void;
  openAssignmentModal: (client: Client) => void;
  openProductAssignmentModal: (client: Client) => void;
}

export const ClientsModals: React.FC<ClientsModalsProps> = ({
  selectedClient,
  isDetailsModalOpen,
  onCloseDetailsModal,
  onSave,
  isEditing,
  detailsInitialTab,
  isAddModalOpen,
  onCloseAddModal,
  onAdd,
  isAssignmentModalOpen,
  onCloseAssignmentModal,
  onAssign,
  isProductAssignmentModalOpen,
  onCloseProductAssignmentModal,
  onProductAssign,
  isBookingModalOpen,
  onCloseBookingModal,
  onBook,
  isNewAppointmentModalOpen,
  onCloseNewAppointmentModal,
  openBookingModal,
  openAssignmentModal,
  openProductAssignmentModal
}) => {
  return (
    <>
      <EnhancedClientDetailsModal
        client={selectedClient}
        isOpen={isDetailsModalOpen}
        onClose={onCloseDetailsModal}
        onSave={onSave}
        isEditing={isEditing}
        initialTab={detailsInitialTab}
        onBookAppointment={() => selectedClient && openBookingModal(selectedClient)}
        onAssignPackage={() => selectedClient && openAssignmentModal(selectedClient)}
        onAssignProduct={() => selectedClient && openProductAssignmentModal(selectedClient)}
      />
      
      <AddClientModal
        isOpen={isAddModalOpen}
        onClose={onCloseAddModal}
        onAdd={onAdd}
      />
      
      <AppointmentFormModal
        isOpen={isNewAppointmentModalOpen || isBookingModalOpen}
        onClose={() => {
          onCloseNewAppointmentModal();
          onCloseBookingModal();
        }}
        clientId={selectedClient?.id}
        clientName={selectedClient?.name}
      />
      
      <PackageAssignmentModal
        client={selectedClient}
        isOpen={isAssignmentModalOpen}
        onClose={onCloseAssignmentModal}
        onAssign={onAssign}
      />

      <AssignmentModal
        client={selectedClient}
        isOpen={isProductAssignmentModalOpen}
        onClose={onCloseProductAssignmentModal}
        onAssign={(client, type, item) => {
          if (type === 'product') {
            onProductAssign(client, item);
          } else {
            onAssign(client, item);
          }
        }}
      />
    </>
  );
};
