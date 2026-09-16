
import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Mail, Phone, MapPin, FileText, Users, AlertTriangle } from 'lucide-react';
import { Client } from '@/hooks/useClients';
import { safeFormatters } from '@/lib/safeDateFormatter';
import { useTranslation } from 'react-i18next';

interface ClientDetailsModalProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ClientDetailsModal: React.FC<ClientDetailsModalProps> = ({ 
  client, 
  isOpen, 
  onClose 
}) => {
  const { t } = useTranslation('clients');
  if (!client) return null;

  const formatDate = (dateString: string) => {
    return safeFormatters.shortDate(dateString);
  };

  const calculateAge = (birthDate: string) => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    return age;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 rtl:space-x-reverse">
            <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white font-medium">
              {client.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <span>{client.name}</span>
          </DialogTitle>
          <DialogDescription>
            {t('details.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center">
              <FileText className="h-5 w-5 me-2" />
              {t('details.basicInfo')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                  <Mail className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium">{t('details.email')}</span>
                  <span className="text-sm">{client.email ? <span className="ltr-inline">{client.email}</span> : t('details.notProvided')}</span>
                </div>
                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                  <Phone className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium">{t('details.phone')}</span>
                  <span className="text-sm ltr-inline">{client.phone}</span>
                </div>
                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium">{t('details.dob')}</span>
                  <span className="text-sm">
                    {client.date_of_birth ? 
                      t('details.dobWithAge', { date: formatDate(client.date_of_birth), age: calculateAge(client.date_of_birth) }) : 
                      t('details.notProvided')
                    }
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start space-x-2 rtl:space-x-reverse">
                  <MapPin className="h-4 w-4 text-gray-500 mt-0.5" />
                  <div>
                    <span className="text-sm font-medium">{t('details.address')}</span>
                    <div className="text-sm text-gray-600">
                      {client.address && <div>{client.address}</div>}
                      {client.city && <div>{client.city}</div>}
                      {!client.address && !client.city && <div>{t('details.notProvided')}</div>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                  <Users className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium">{t('details.referralSource')}</span>
                  <span className="text-sm">
                    {client.referral_source ? (
                      <Badge variant="outline">{client.referral_source}</Badge>
                    ) : (
                      t('details.notProvided')
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Health Information */}
          {client.allergies && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center">
                <AlertTriangle className="h-5 w-5 me-2 text-orange-500" />
                {t('details.healthInfo')}
              </h3>
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                <div className="flex items-start space-x-2 rtl:space-x-reverse">
                  <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5" />
                  <div>
                    <span className="text-sm font-medium text-orange-800 dark:text-orange-200">{t('details.allergies')}</span>
                    <div className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                      {client.allergies}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {client.notes && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center">
                <FileText className="h-5 w-5 me-2" />
                {t('details.notes')}
              </h3>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {client.notes}
                </p>
              </div>
            </div>
          )}

          {/* Client Since */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>{t('details.clientSince', { date: formatDate(client.created_at) })}</span>
              <span>{t('details.lastUpdated', { date: formatDate(client.updated_at) })}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={onClose}>{t('common:actions.close')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
