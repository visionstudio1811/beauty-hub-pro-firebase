
import React from 'react';
import { ArrowLeft, RotateCcw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { DeletedClientsTable } from '@/components/clients/DeletedClientsTable';
import { useDeletedClients } from '@/hooks/useDeletedClients';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTranslation } from 'react-i18next';

const DeletedClients = () => {
  const { t } = useTranslation('clients');
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { deletedClients, loading, restoreClient, permanentlyDeleteClient } = useDeletedClients();

  const handleRestore = async (clientId: string) => {
    await restoreClient(clientId);
  };

  const handlePermanentDelete = async (clientId: string) => {
    await permanentlyDeleteClient(clientId);
  };

  if (loading) {
    return (
      <div className="w-full max-w-none mx-auto px-2 sm:px-4 lg:px-6">
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-600">{t('deletedPage.loading')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-none mx-auto px-2 sm:px-4 lg:px-6">
      <div className="space-y-4 sm:space-y-6 w-full overflow-hidden">
        {/* Header */}
        <div className="flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:justify-between sm:items-start border-b border-gray-200 dark:border-gray-700 pb-4 gap-3 sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/clients')}
                className="p-2"
                aria-label={t('deletedPage.back')}
              >
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              </Button>
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white truncate">
                  {t('deletedPage.title')}
                </h1>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 mt-1">
                  {t('deletedPage.subtitle')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-red-500" />
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-300">{t('deletedPage.clientsInTrash')}</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {deletedClients.length}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        {deletedClients.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg border p-8 text-center">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {t('deletedPage.emptyTitle')}
            </h3>
            <p className="text-gray-600 dark:text-gray-300">
              {t('deletedPage.emptyDescription')}
            </p>
          </div>
        ) : (
          <div className="w-full overflow-hidden">
            <DeletedClientsTable
              clients={deletedClients}
              onRestore={handleRestore}
              onPermanentDelete={handlePermanentDelete}
            />
          </div>
        )}

        {/* Instructions */}
        {deletedClients.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <RotateCcw className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium mb-1">{t('deletedPage.instructionsTitle')}</p>
                <p>{t('deletedPage.instructionsBody')}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeletedClients;
