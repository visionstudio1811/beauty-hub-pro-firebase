import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InvoiceHistoryViewer } from '@/components/InvoiceHistoryViewer';
import { CreateInvoiceDialog } from '@/components/invoices/CreateInvoiceDialog';

const Invoices: React.FC = () => {
  const { t } = useTranslation('dashboard');
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-5 max-w-full">
      <div className="flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{t('invoices.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('invoices.subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 me-2" />
          {t('invoices.newInvoice')}
        </Button>
      </div>

      <InvoiceHistoryViewer />

      <CreateInvoiceDialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
};

export default Invoices;
