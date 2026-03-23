
import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Client } from '@/hooks/useClients';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useIsMobile } from '@/hooks/use-mobile';

interface DeletedClientsTableProps {
  clients: Client[];
  onRestore: (clientId: string) => void;
  onPermanentDelete: (clientId: string) => void;
}

export const DeletedClientsTable: React.FC<DeletedClientsTableProps> = ({
  clients,
  onRestore,
  onPermanentDelete
}) => {
  const isMobile = useIsMobile();

  return (
    <div className="w-full overflow-x-auto border rounded-lg">
      <Table className="w-full">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px] sm:w-[180px]">Name</TableHead>
            <TableHead className="w-[100px] sm:w-[120px]">Phone</TableHead>
            {!isMobile && <TableHead className="w-[160px] sm:w-[200px]">Email</TableHead>}
            <TableHead className="w-[120px] sm:w-[140px]">Deleted Date</TableHead>
            <TableHead className="w-[120px] sm:w-[160px]">Actions</TableHead>
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
                <div className="truncate max-w-[100px] sm:max-w-[120px]">
                  {client.deleted_at ? new Date(client.deleted_at).toLocaleDateString() : 'N/A'}
                </div>
              </TableCell>
              <TableCell className="p-1 sm:p-4">
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRestore(client.id)}
                    title="Restore Client"
                    className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        title="Permanently Delete Client"
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Permanently Delete Client?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete "{client.name}" from the database. 
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => onPermanentDelete(client.id)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Permanently Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
