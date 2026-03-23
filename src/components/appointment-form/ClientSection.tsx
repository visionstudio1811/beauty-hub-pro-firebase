
import React from 'react';
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
  return (
    <>
      <div>
        <Label htmlFor="client">Client</Label>
        <ClientSelector
          value={formData.clientName}
          onSelect={onClientSelect}
          onCreateNew={onCreateNewClient}
          placeholder="Search and select client..."
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="clientPhone">Phone</Label>
          <Input
            id="clientPhone"
            value={formData.clientPhone}
            onChange={(e) => onFormDataChange({ clientPhone: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor="clientEmail">Email</Label>
          <Input
            id="clientEmail"
            type="email"
            value={formData.clientEmail}
            onChange={(e) => onFormDataChange({ clientEmail: e.target.value })}
            required
          />
        </div>
      </div>
    </>
  );
};
