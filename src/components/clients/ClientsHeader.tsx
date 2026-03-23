
import React from 'react';
import { Button } from '@/components/ui/button';
import { User } from 'lucide-react';

interface ClientsHeaderProps {
  onAddClient: () => void;
}

export const ClientsHeader: React.FC<ClientsHeaderProps> = ({ onAddClient }) => {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-200 dark:border-gray-700 pb-4 space-y-4 sm:space-y-0">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">Clients</h1>
        <p className="text-gray-600 dark:text-gray-300">Manage your client database</p>
      </div>
      <Button 
        className="bg-purple-600 hover:bg-purple-700 w-full sm:w-auto"
        onClick={onAddClient}
      >
        <User className="mr-2 h-4 w-4" />
        Add New Client
      </Button>
    </div>
  );
};
