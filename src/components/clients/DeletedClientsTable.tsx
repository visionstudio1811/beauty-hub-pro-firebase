
import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Client } from '@/hooks/useClients';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/i18n/LanguageProvider';

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
  const { t } = useTranslation('clients');
  const { locale } = useLanguage();
  const isMobile = useIsMobile();

  return (
    <div className="w-full overflow-x-auto border rounded-lg">
      <Table className="w-full">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px] sm:w-[180px]">{t('columns.name')}</TableHead>
            <TableHead className="w-[100px] sm:w-[120px]">{t('columns.phone')}</TableHead>
            {!isMobile && <TableHead className="w-[160px] sm:w-[200px]">{t('columns.email')}</TableHead>}
            <TableHead className="w-[120px] sm:w-[140px]">{t('columns.deletedDate')}</TableHead>
            <TableHead className="w-[120px] sm:w-[160px]">{t('columns.actions')}</TableHead>
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
                <div className="truncate max-w-[100px] sm:max-w-[120px]">
                  {client.deleted_at ? new Date(client.deleted_at).toLocaleDateString(locale) : t('table.notAvailable')}
                </div>
              </TableCell>
              <TableCell className="p-1 sm:p-4">
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRestore(client.id)}
                    title={t('deletedTable.restoreClient')}
                    aria-label={t('deletedTable.restoreClient')}
                    className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        title={t('deletedTable.permanentlyDeleteClient')}
                        aria-label={t('deletedTable.permanentlyDeleteClient')}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('deletedTable.dialogTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('deletedTable.dialogDescription', { name: `"${client.name}"` })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => onPermanentDelete(client.id)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          {t('deletedTable.confirm')}
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
