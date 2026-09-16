
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ClientSelector } from '@/components/ClientSelector';
import { Client } from '@/hooks/useClients';

interface ClientFormData {
  clientName: string;
  clientPhone: string;
  clientEmail: string;
}

interface ClientSectionProps {
  formData: ClientFormData;
  onFormDataChange: (updates: Partial<ClientFormData>) => void;
  onClientSelect: (client: Client | null) => void;
  onCreateNewClient: () => void;
}

export const ClientSection: React.FC<ClientSectionProps> = ({
  formData,
  onFormDataChange,
  onClientSelect,
  onCreateNewClient
}) => {
  const { t } = useTranslation('appointments');

  return (
    <>
      <div>
        <Label htmlFor="client">{t('form.client.label')}</Label>
        <ClientSelector
          value={formData.clientName}
          onSelect={onClientSelect}
          onCreateNew={onCreateNewClient}
          placeholder={t('form.client.placeholder')}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="clientPhone">{t('form.client.phone')}</Label>
          <Input
            id="clientPhone"
            dir="ltr"
            value={formData.clientPhone}
            onChange={(e) => onFormDataChange({ clientPhone: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor="clientEmail">{t('form.client.email')}</Label>
          <Input
            id="clientEmail"
            type="email"
            dir="ltr"
            value={formData.clientEmail}
            onChange={(e) => onFormDataChange({ clientEmail: e.target.value })}
            required
          />
        </div>
      </div>
    </>
  );
};
