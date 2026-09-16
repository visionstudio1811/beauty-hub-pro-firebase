
import { useState } from 'react';
import { useClients, Client } from '@/hooks/useClients';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

export const useClientOperations = () => {
  const { toast } = useToast();
  const { t } = useTranslation('hooks');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [isProductAssignmentModalOpen, setIsProductAssignmentModalOpen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isNewAppointmentModalOpen, setIsNewAppointmentModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [detailsInitialTab, setDetailsInitialTab] = useState('details');

  const {
    clients,
    handleStatusChange,
    handleSaveClient,
    handleAddClient,
    deleteClient,
    refetch
  } = useClients();

  const handleViewDetails = (client: Client) => {
    setSelectedClient(client);
    setIsEditing(false);
    setDetailsInitialTab('details');
    setIsDetailsModalOpen(true);
  };

  const handleSendWaiver = (client: Client) => {
    setSelectedClient(client);
    setIsEditing(false);
    setDetailsInitialTab('documents');
    setIsDetailsModalOpen(true);
  };

  const handleEditClient = (client: Client) => {
    setSelectedClient(client);
    setIsEditing(true);
    setDetailsInitialTab('details');
    setIsDetailsModalOpen(true);
  };

  const openAssignmentModal = (client: Client) => {
    setSelectedClient(client);
    setIsAssignmentModalOpen(true);
  };

  const openProductAssignmentModal = (client: Client) => {
    setSelectedClient(client);
    setIsProductAssignmentModalOpen(true);
  };

  const openBookingModal = (client: Client) => {
    setSelectedClient(client);
    setIsBookingModalOpen(true);
  };

  const handleDeleteClient = async (clientId: string) => {
    await deleteClient(clientId);
  };

  const handleAssignmentWrapper = async (client: Client, assignment: any) => {
    // Refresh clients data to reflect membership status change
    await refetch();
    setIsAssignmentModalOpen(false);
    toast({
      title: t('common:status.success'),
      description: t('clientOperations.packageAssigned')
    });
  };

  const handleProductAssignmentWrapper = async (client: Client, assignment: any) => {
    await refetch();
    setIsProductAssignmentModalOpen(false);
    toast({
      title: t('common:status.success'),
      description: t('clientOperations.productAssigned')
    });
  };

  const handleBookingWrapper = async (client: Client, booking: any) => {
    setIsBookingModalOpen(false);
    toast({
      title: t('common:status.success'),
      description: t('clientOperations.appointmentBooked')
    });
  };

  const handleAddClientWrapper = async (clientData: Omit<Client, 'id' | 'created_at' | 'updated_at'>) => {
    await handleAddClient(clientData);
    setIsAddModalOpen(false);
  };

  return {
    clients,
    selectedClient,
    isDetailsModalOpen,
    setIsDetailsModalOpen,
    detailsInitialTab,
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
    handleDeleteClient
  };
};
