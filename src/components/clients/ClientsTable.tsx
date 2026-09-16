
import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { Eye, Edit, MessageSquare, Trash2, Package, Calendar, MoreHorizontal, FileSignature } from 'lucide-react';
import { Client } from '@/hooks/useClients';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ClientCommunicationModal } from './ClientCommunicationModal';
import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { safeFormatters } from '@/lib/safeDateFormatter';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/i18n/LanguageProvider';

// StatusBadge (src/components/ui, off-limits here) renders the raw status string
// as its label, so it can't display a translated label. The badge is rendered
// locally instead, keyed by the stored status value. The visual styles mirror
// StatusBadge's client variant; if that component gains a `label` prop, switch
// back to it and delete this map.
const CLIENT_STATUS_BADGE_BASE = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
const CLIENT_STATUS_FALLBACK = 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:ring-slate-700';
const CLIENT_STATUS_STYLES: Record<string, string> = {
  'Have Membership':       'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800',
  'Membership Ended':      'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-800',
  "Don't Have Membership": CLIENT_STATUS_FALLBACK,
};

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
  const { t } = useTranslation('clients');
  const { locale } = useLanguage();
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


  const statusLabel = (status: string) => {
    if (status === 'Have Membership') return t('status.haveMembership');
    if (status === 'Membership Ended') return t('status.membershipEnded');
    if (status === "Don't Have Membership") return t('status.noMembership');
    return status;
  };

  const renderRevenue = (client: Client) => (
    <span className="font-medium ltr-inline">
      ${Number(client.totalRevenue || 0).toLocaleString(locale, {
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
          <span className="hidden sm:inline">{t('actions.menu')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleViewDetails(client); }}>
          <Eye className="h-4 w-4 me-2" />
          {t('actions.viewDetails')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEditClient(client); }}>
          <Edit className="h-4 w-4 me-2" />
          {t('actions.editClient')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCommunication(client); }}>
          <MessageSquare className="h-4 w-4 me-2" />
          {t('actions.sendMessage')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleBookAppointment(client); }}>
          <Calendar className="h-4 w-4 me-2" />
          {t('actions.bookAppointment')}
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAssignPackage(client); }}>
            <Package className="h-4 w-4 me-2" />
            {t('actions.assignPackage')}
          </DropdownMenuItem>
        )}
        {onSendWaiver && (
          <DropdownMenuItem onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSendWaiver(client); }}>
            <FileSignature className="h-4 w-4 me-2" />
            {t('actions.sendWaiver')}
          </DropdownMenuItem>
        )}
        {onDeleteClient && (
          <DropdownMenuItem
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPendingDelete(client); }}
            className="text-red-600"
          >
            <Trash2 className="h-4 w-4 me-2" />
            {t('actions.deleteClient')}
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
              <TableHead className="w-[140px] sm:w-[180px]">{t('columns.name')}</TableHead>
              <TableHead className="w-[100px] sm:w-[120px]">{t('columns.phone')}</TableHead>
              {!isMobile && <TableHead className="w-[160px] sm:w-[200px]">{t('columns.email')}</TableHead>}
              <TableHead className="w-[120px] sm:w-[140px]">{t('columns.status')}</TableHead>
              
              {!isMobile && <TableHead className="w-[80px] sm:w-[100px]">{t('columns.lastVisit')}</TableHead>}
              {!isMobile && <TableHead className="w-[60px] sm:w-[80px]">{t('columns.visits')}</TableHead>}
              {!isMobile && isAdmin && <TableHead className="w-[80px] sm:w-[100px]">{t('columns.revenue')}</TableHead>}
              <TableHead className="w-[80px] sm:w-[110px]">{t('columns.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.id}>
                <TableCell className="font-medium p-2 sm:p-4">
                  <div className="max-w-[120px] sm:max-w-[160px]">
                    <div className="font-medium truncate">{client.name}</div>
                    {isMobile && client.email && (
                      <div className="text-sm text-gray-500 truncate ltr-inline">{client.email}</div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="p-2 sm:p-4">
                  <div className="truncate max-w-[80px] sm:max-w-[100px] ltr-inline">{client.phone}</div>
                </TableCell>
                {!isMobile && (
                  <TableCell className="p-2 sm:p-4">
                    <div className="truncate max-w-[140px] sm:max-w-[180px]">{client.email ? <span className="ltr-inline">{client.email}</span> : t('table.notAvailable')}</div>
                  </TableCell>
                )}
                <TableCell className="p-2 sm:p-4">
                  <span
                    className={cn(
                      CLIENT_STATUS_BADGE_BASE,
                      CLIENT_STATUS_STYLES[client.status] ?? CLIENT_STATUS_FALLBACK
                    )}
                  >
                    {statusLabel(client.status)}
                  </span>
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
            <AlertDialogTitle>{t('deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDialog.description', { name: pendingDelete?.name ?? t('deleteDialog.fallbackName') })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                if (pendingDelete) handleDeleteClient(pendingDelete.id, e);
                setPendingDelete(null);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {t('deleteDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
