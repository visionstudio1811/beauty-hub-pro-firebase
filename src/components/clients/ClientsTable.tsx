
import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';

import { Eye, Edit, MessageSquare, Trash2, Package, Calendar, MoreHorizontal, FileSignature } from 'lucide-react';
import { Client } from '@/hooks/useClients';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { ClientCommunicationModal } from './ClientCommunicationModal';
import { useState } from 'react';
import { useClientRevenue } from '@/hooks/useClientRevenue';
import { useIsMobile } from '@/hooks/use-mobile';
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
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [communicationClient, setCommunicationClient] = useState<Client | null>(null);
  const [isCommunicationModalOpen, setIsCommunicationModalOpen] = useState(false);
  
  // Get revenue data for total revenue only (simplified for now)
  const { totalRevenue, loading: revenueLoading, error: revenueError } = useClientRevenue();

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


  const renderRevenue = (client: Client) => {
    if (revenueLoading) {
      return <span className="text-gray-400">Loading...</span>;
    }
    
    if (revenueError) {
      return (
        <span className="text-red-500 text-xs" title={revenueError}>
          Error
        </span>
      );
    }
    
    // For now, we'll show a placeholder since individual client revenue calculation is simplified
    return <span className="font-medium">$0.00</span>;
  };

  const ActionButtons = ({ client }: { client: Client }) => (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={(e) => handleViewDetails(client, e)}
        title="View Details"
        className="h-8 w-8 p-0"
      >
        <Eye className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={(e) => handleEditClient(client, e)}
        title="Edit Client"
        className="h-8 w-8 p-0"
      >
        <Edit className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={(e) => handleCommunication(client, e)}
        title="Send Message"
        className="h-8 w-8 p-0"
      >
        <MessageSquare className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={(e) => handleBookAppointment(client, e)}
        title="Book Appointment"
        className="h-8 w-8 p-0"
      >
        <Calendar className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={(e) => handleAssignPackage(client, e)}
        title="Assign Package"
        className="h-8 w-8 p-0"
      >
        <Package className="h-4 w-4" />
      </Button>
      {onSendWaiver && (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSendWaiver(client); }}
          title="Send Waiver"
          className="h-8 w-8 p-0"
        >
          <FileSignature className="h-4 w-4" />
        </Button>
      )}
      {onDeleteClient && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              title="Delete Client"
              className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('ClientsTable: Delete trigger clicked for client:', client.id);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will move the client to trash for 30 days. You can restore them during this period.
                After 30 days, the client data will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={(e) => handleDeleteClient(client.id, e)}
                className="bg-red-600 hover:bg-red-700"
              >
                Move to Trash
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
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
              {!isMobile && <TableHead className="w-[80px] sm:w-[100px]">Revenue</TableHead>}
              <TableHead className="w-[120px] sm:w-[200px]">Actions</TableHead>
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
                    <div className="truncate max-w-[80px] sm:max-w-[90px]">{client.lastVisit}</div>
                  </TableCell>
                )}
                {!isMobile && (
                  <TableCell className="p-2 sm:p-4 text-center">{client.totalVisits}</TableCell>
                )}
                {!isMobile && (
                  <TableCell className="p-2 sm:p-4">
                    <div className="truncate max-w-[70px] sm:max-w-[90px]">{renderRevenue(client)}</div>
                  </TableCell>
                )}
                <TableCell className="p-1 sm:p-4">
                  {isMobile ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('ClientsTable: Mobile dropdown trigger clicked for client:', client.id);
                          }}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleViewDetails(client);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleEditClient(client);
                          }}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Client
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCommunication(client);
                          }}
                        >
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Send Message
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleBookAppointment(client);
                          }}
                        >
                          <Calendar className="h-4 w-4 mr-2" />
                          Book Appointment
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleAssignPackage(client);
                          }}
                        >
                          <Package className="h-4 w-4 mr-2" />
                          Assign Package
                        </DropdownMenuItem>
                        {onSendWaiver && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onSendWaiver(client);
                            }}
                          >
                            <FileSignature className="h-4 w-4 mr-2" />
                            Send Waiver
                          </DropdownMenuItem>
                        )}
                        {onDeleteClient && (
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDeleteClient(client.id);
                            }}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Client
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <div className="flex items-center gap-1">
                      <ActionButtons client={client} />
                    </div>
                  )}
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
    </>
  );
};
