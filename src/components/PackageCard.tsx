import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2, Calendar, DollarSign } from 'lucide-react';
import { Package, usePackages } from '@/contexts/PackageContext';
import { useTranslation } from 'react-i18next';

interface PackageCardProps {
  package: Package;
  onEdit: (pkg: Package) => void;
  onDelete: (pkg: Package) => void;
  onToggleStatus: (id: string) => void;
}

export const PackageCard: React.FC<PackageCardProps> = ({
  package: pkg,
  onEdit,
  onDelete,
  onToggleStatus
}) => {
  const { t } = useTranslation('packages');
  const { getTreatmentNamesByIds } = usePackages();
  const [treatmentNames, setTreatmentNames] = useState<string[]>([]);

  useEffect(() => {
    const fetchTreatmentNames = async () => {
      if (pkg.treatments && pkg.treatments.length > 0) {
        const names = await getTreatmentNamesByIds(pkg.treatments);
        setTreatmentNames(names);
      }
    };

    fetchTreatmentNames();
  }, [pkg.treatments, getTreatmentNamesByIds]);

  return (
    <Card className={`${!pkg.is_active ? 'opacity-60' : ''} w-full`}>
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex flex-col space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-sm break-words flex-1">{pkg.name}</h3>
              <Badge variant={pkg.is_active ? 'default' : 'secondary'} className="text-xs shrink-0">
                {pkg.is_active ? t('packageCard.active') : t('packageCard.inactive')}
              </Badge>
            </div>
            {pkg.description && (
              <p className="text-xs text-gray-600 break-words">{pkg.description}</p>
            )}
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center text-xs">
              <DollarSign className="h-3 w-3 me-1 text-green-600 flex-shrink-0" />
              <span>${pkg.price}</span>
            </div>
            <div className="flex items-center text-xs">
              <Calendar className="h-3 w-3 me-1 text-blue-600 flex-shrink-0" />
              <span>{t('packageCard.sessions', { count: pkg.total_sessions })}</span>
            </div>
            <div className="text-xs text-gray-500">
              {t('packageCard.validFor', { count: pkg.validity_months })}
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">{t('packageCard.treatments')}</p>
            <div className="flex flex-wrap gap-1">
              {treatmentNames.map((treatmentName, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {treatmentName.length > 15 ? `${treatmentName.substring(0, 15)}...` : treatmentName}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => onEdit(pkg)}
                className="flex-1 text-xs h-8"
              >
                <Edit className="h-3 w-3 me-1" />
                {t('common:actions.edit')}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => onToggleStatus(pkg.id)}
                className="flex-1 text-xs h-8"
              >
                {pkg.is_active ? t('packageCard.deactivate') : t('packageCard.activate')}
              </Button>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => onDelete(pkg)}
              className="text-red-600 hover:text-red-700 w-full text-xs h-8"
            >
              <Trash2 className="h-3 w-3 me-1" />
              {t('common:actions.delete')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
