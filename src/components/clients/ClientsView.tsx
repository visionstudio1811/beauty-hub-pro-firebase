
import React from 'react';
import { ClientsTable } from './ClientsTable';
import { ClientsCards } from './ClientsCards';
import { Client } from '@/hooks/useClients';

interface ClientsViewProps {
  viewMode: 'table' | 'grid';
  filteredClients: Client[];
  onStatusChange: (clientId: string, newStatus: string) => void;
  onViewDetails: (client: Client) => void;
  onEditClient: (client: Client) => void;
  onBookAppointment: (client: Client) => void;
  onAssignPackage: (client: Client) => void;
  onDeleteClient?: (clientId: string) => void;
  onSendWaiver?: (client: Client) => void;
}

export const ClientsView: React.FC<ClientsViewProps> = ({
  viewMode,
  filteredClients,
  onStatusChange,
  onViewDetails,
  onEditClient,
  onBookAppointment,
  onAssignPackage,
  onDeleteClient,
  onSendWaiver,
}) => {
  console.log('ClientsView: Rendering with', {
    viewMode,
    clientsCount: filteredClients.length,
    hasDeleteHandler: !!onDeleteClient
  });

  if (viewMode === 'table') {
    return (
      <ClientsTable
        clients={filteredClients}
        onStatusChange={onStatusChange}
        onViewDetails={onViewDetails}
        onEditClient={onEditClient}
        onBookAppointment={onBookAppointment}
        onAssignPackage={onAssignPackage}
        onDeleteClient={onDeleteClient}
        onSendWaiver={onSendWaiver}
      />
    );
  }

  return (
    <ClientsCards
      clients={filteredClients}
      onStatusChange={onStatusChange}
      onViewDetails={onViewDetails}
      onEditClient={onEditClient}
      onBookAppointment={onBookAppointment}
      onAssignPackage={onAssignPackage}
      onDeleteClient={onDeleteClient}
      onSendWaiver={onSendWaiver}
    />
  );
};
