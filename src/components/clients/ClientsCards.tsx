
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Edit, MessageSquare, Trash2, Package, Calendar, Phone, Mail, User, FileSignature } from 'lucide-react';
import { Client } from '@/hooks/useClients';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ClientCommunicationModal } from './ClientCommunicationModal';
import { useIsMobile } from '@/hooks/use-mobile';

interface ClientsCardsProps {
  clients: Client[];
  onStatusChange: (clientId: string, newStatus: string) => void;
  onViewDetails: (client: Client) => void;
  onEditClient: (client: Client) => void;
  onBookAppointment: (client: Client) => void;
  onAssignPackage: (client: Client) => void;
  onDeleteClient?: (clientId: string) => void;
  onSendWaiver?: (client: Client) => void;
}

export const ClientsCards: React.FC<ClientsCardsProps> = ({
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
  const [communicationClient, setCommunicationClient] = useState<Client | null>(null);
  const [isCommunicationModalOpen, setIsCommunicationModalOpen] = useState(false);

  const handleDeleteClient = (clientId: string, event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    console.log('ClientsCards: Delete button clicked for client:', clientId);
    
    if (onDeleteClient) {
      onDeleteClient(clientId);
    }
  };

  const handleCommunication = (client: Client, event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    console.log('ClientsCards: Communication button clicked for client:', client.id);
    
    setCommunicationClient(client);
    setIsCommunicationModalOpen(true);
  };

  const handleViewDetails = (client: Client, event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    console.log('ClientsCards: View details button clicked for client:', client.id);
    
    onViewDetails(client);
  };

  const handleEditClient = (client: Client, event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    console.log('ClientsCards: Edit button clicked for client:', client.id);
    
    onEditClient(client);
  };

  const handleBookAppointment = (client: Client, event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    console.log('ClientsCards: Book appointment button clicked for client:', client.id);
    
    onBookAppointment(client);
  };

  const handleAssignPackage = (client: Client, event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    console.log('ClientsCards: Assign package button clicked for client:', client.id);
    
    onAssignPackage(client);
  };

  const getStatusColor = (status: string) => {
    return status === 'Have Membership' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
  };

  return (
    <>
      <div className={`grid gap-3 sm:gap-4 ${
        isMobile 
          ? 'grid-cols-1' 
          : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
      }`}>
        {clients.map((client) => (
          <Card key={client.id} className="hover:shadow-md transition-shadow">
            <CardHeader className={`${isMobile ? 'pb-2' : 'pb-3'}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2 min-w-0 flex-1">
                  <User className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <CardTitle className={`${isMobile ? 'text-base' : 'text-lg'} truncate`}>
                    {client.name}
                  </CardTitle>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => handleEditClient(client, e)}
                  title="Edit Client"
                  className="min-w-[44px] min-h-[44px] sm:min-w-auto sm:min-h-auto"
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className={`space-y-2 ${isMobile ? 'space-y-2' : 'space-y-3'}`}>
              <div className="space-y-1 sm:space-y-2">
                <div className="flex items-center space-x-2 text-sm">
                  <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <span className="truncate">{client.phone}</span>
                </div>
                {client.email && (
                  <div className="flex items-center space-x-2 text-sm">
                    <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span className="truncate">{client.email}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Status:</span>
                <select
                  value={client.status}
                  onChange={(e) => {
                    console.log('ClientsCards: Status change for client:', client.id, 'to:', e.target.value);
                    onStatusChange(client.id, e.target.value);
                  }}
                  className={`px-2 py-1 rounded text-xs border-none ${getStatusColor(client.status)} max-w-[140px]`}
                >
                  <option value="Have Membership">Have Membership</option>
                  <option value="Don't Have Membership">Don't Have Membership</option>
                </select>
              </div>

              <div className="flex justify-between text-sm text-gray-600">
                <span>Visits: {client.totalVisits}</span>
                <span className="truncate">Last: {client.lastVisit}</span>
              </div>

              <div className={`grid gap-1 pt-2 ${isMobile ? 'grid-cols-2' : 'grid-cols-3'}`}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => handleViewDetails(client, e)}
                  title="View Details"
                  className="h-8 min-w-[44px] min-h-[44px] sm:min-w-auto sm:min-h-8"
                >
                  <Eye className="h-3 w-3" />
                  {!isMobile && <span className="ml-1 text-xs">View</span>}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => handleCommunication(client, e)}
                  title="Send Message"
                  className="h-8 min-w-[44px] min-h-[44px] sm:min-w-auto sm:min-h-8"
                >
                  <MessageSquare className="h-3 w-3" />
                  {!isMobile && <span className="ml-1 text-xs">Message</span>}
                </Button>
                {!isMobile && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => handleBookAppointment(client, e)}
                    title="Book Appointment"
                    className="h-8"
                  >
                    <Calendar className="h-3 w-3" />
                  </Button>
                )}
              </div>

              <div className={`grid gap-1 ${isMobile ? 'grid-cols-2' : 'grid-cols-2'}`}>
                {isMobile && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => handleBookAppointment(client, e)}
                    title="Book Appointment"
                    className="h-8 min-w-[44px] min-h-[44px] sm:min-w-auto sm:min-h-8"
                  >
                    <Calendar className="h-3 w-3 mr-1" />
                    <span className="text-xs">Book</span>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => handleAssignPackage(client, e)}
                  title="Assign Package"
                  className="h-8 min-w-[44px] min-h-[44px] sm:min-w-auto sm:min-h-8"
                >
                  <Package className="h-3 w-3 mr-1" />
                  <span className="text-xs">Package</span>
                </Button>
                {onSendWaiver && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSendWaiver(client); }}
                    title="Send Waiver"
                    className="h-8 min-w-[44px] min-h-[44px] sm:min-w-auto sm:min-h-8"
                  >
                    <FileSignature className="h-3 w-3 mr-1" />
                    <span className="text-xs">Waiver</span>
                  </Button>
                )}
                {onDeleteClient && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        title="Delete Client"
                        className="h-8 text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 min-w-[44px] min-h-[44px] sm:min-w-auto sm:min-h-8"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('ClientsCards: Delete trigger clicked for client:', client.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                        {!isMobile && <span className="ml-1 text-xs">Delete</span>}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will move "{client.name}" to trash for 30 days. You can restore them during this period.
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
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ClientCommunicationModal
        client={communicationClient}
        isOpen={isCommunicationModalOpen}
        onClose={() => setIsCommunicationModalOpen(false)}
      />
    </>
  );
};
