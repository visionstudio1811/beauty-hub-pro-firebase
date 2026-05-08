
import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';

import { Eye, Edit, MessageSquare, Trash2, Package, Calendar, MoreHorizontal, FileSignature } from 'lucide-react';
import { Client } from '@/hooks/useClients';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ClientCommunicationModal } from './ClientCommunicationModal';
import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { safeFormatters } from '@/lib/safeDateFormatter';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface ClientsTableProps {
  clients: Client[];
  onStatusChange: (clientId: string, newStatus: string) => void;
  onViewDetails: (client: Client) => void;
  onEditClient: (client: Client) => void;
  onBookAppointment: (client: Client) => void;
  onAssignPackage: (client: Client) => void;
  onDeleteClient?: (clientId: string) => void;
  onSendWaiver?: (client: Client) => void;
}

export const ClientsTable: React.FC<ClientsTableProps> = ({
  clients,
  onStatusChange,
  onViewDetails,
  onEditClient,
  onBookAppointment,
  onAssignPackage,
  onDeleteClient,
  onSendWaiver,
}) => {
  const isMobile = useIsMobile();
  const isAdmin = useIsAdmin();
  const [communicationClient, setCommunicationClient] = useState<Client | null>(null);
  const [isCommunicationModalOpen, setIsCommunicationModalOpen] = useState(false);

  const handleDeleteClient = (clientId: string, event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    console.log('ClientsTable: Delete button clicked for client:', clientId);
    
    if (onDeleteClient) {
      onDeleteClient(clientId);
    }
  };

  const handleCommunication = (client: Client, event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    console.log('ClientsTable: Communication button clicked for client:', client.id);
    
    setCommunicationClient(client);
    setIsCommunicationModalOpen(true);
  };

  const handleViewDetails = (client: Client, event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    console.log('ClientsTable: View details button clicked for client:', client.id);
    
    onViewDetails(client);
  };

  const handleEditClient = (client: Client, event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    console.log('ClientsTable: Edit button clicked for client:', client.id);
    
    onEditClient(client);
  };

  const handleBookAppointment = (client: Client, event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    console.log('ClientsTable: Book appointment button clicked for client:', client.id);
    
    onBookAppointment(client);
  };

  const handleAssignPackage = (client: Client, event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    console.log('ClientsTable: Assign package button clicked for client:', client.id);
    
    onAssignPackage(client);
  };


  const renderRevenue = (client: Client) => (
    <span className="font-medium">
      ${Number(client.totalRevenue || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </span>
  );

  const [pendingDelete, setPendingDelete] = React.useState<Client | null>(null);

  const ActionsMenu = ({ client }: { client: Client }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2 gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleViewDetails(client); }}>
          <Eye className="h-4 w-4 mr-2" />
          View Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEditClient(client); }}>
          <Edit className="h-4 w-4 mr-2" />
          Edit Client
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCommunication(client); }}>
          <MessageSquare className="h-4 w-4 mr-2" />
          Send Message
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleBookAppointment(client); }}>
          <Calendar className="h-4 w-4 mr-2" />
          Book Appointment
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAssignPackage(client); }}>
            <Package className="h-4 w-4 mr-2" />
            Assign Package
          </DropdownMenuItem>
        )}
        {onSendWaiver && (
          <DropdownMenuItem onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSendWaiver(client); }}>
            <FileSignature className="h-4 w-4 mr-2" />
            Send Waiver
          </DropdownMenuItem>
        )}
        {onDeleteClient && (
          <DropdownMenuItem
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPendingDelete(client); }}
            className="text-red-600"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Client
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <div className="w-full overflow-x-auto border rounded-lg">
        <Table className="w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px] sm:w-[180px]">Name</TableHead>
              <TableHead className="w-[100px] sm:w-[120px]">Phone</TableHead>
              {!isMobile && <TableHead className="w-[160px] sm:w-[200px]">Email</TableHead>}
              <TableHead className="w-[120px] sm:w-[140px]">Status</TableHead>
              
              {!isMobile && <TableHead className="w-[80px] sm:w-[100px]">Last Visit</TableHead>}
              {!isMobile && <TableHead className="w-[60px] sm:w-[80px]">Visits</TableHead>}
              {!isMobile && isAdmin && <TableHead className="w-[80px] sm:w-[100px]">Revenue</TableHead>}
              <TableHead className="w-[80px] sm:w-[110px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.id}>
                <TableCell className="font-medium p-2 sm:p-4">
                  <div className="max-w-[120px] sm:max-w-[160px]">
                    <div className="font-medium truncate">{client.name}</div>
                    {isMobile && client.email && (
                      <div className="text-sm text-gray-500 truncate">{client.email}</div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="p-2 sm:p-4">
                  <div className="truncate max-w-[80px] sm:max-w-[100px]">{client.phone}</div>
                </TableCell>
                {!isMobile && (
                  <TableCell className="p-2 sm:p-4">
                    <div className="truncate max-w-[140px] sm:max-w-[180px]">{client.email || 'N/A'}</div>
                  </TableCell>
                )}
                <TableCell className="p-2 sm:p-4">
                  <StatusBadge status={client.status} variant="client" />
                </TableCell>
                {!isMobile && (
                  <TableCell className="p-2 sm:p-4">
                    <div className="truncate max-w-[80px] sm:max-w-[90px]">
                      {safeFormatters.shortDate(client.lastVisit) || '—'}
                    </div>
                  </TableCell>
                )}
                {!isMobile && (
                  <TableCell className="p-2 sm:p-4 text-center">{client.totalVisits}</TableCell>
                )}
                {!isMobile && isAdmin && (
                  <TableCell className="p-2 sm:p-4">
                    <div className="truncate max-w-[70px] sm:max-w-[90px]">{renderRevenue(client)}</div>
                  </TableCell>
                )}
                <TableCell className="p-1 sm:p-4">
                  <ActionsMenu client={client} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ClientCommunicationModal
        client={communicationClient}
        isOpen={isCommunicationModalOpen}
        onClose={() => setIsCommunicationModalOpen(false)}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move {pendingDelete?.name ?? 'the client'} to trash for 30 days.
              You can restore them during this period. After 30 days, the client data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                if (pendingDelete) handleDeleteClient(pendingDelete.id, e);
                setPendingDelete(null);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
