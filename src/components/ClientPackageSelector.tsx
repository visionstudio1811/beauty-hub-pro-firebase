
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Package, Clock } from 'lucide-react';
import { ClientPackage } from '@/hooks/useClientPackages';
import { safeFormatters } from '@/lib/safeDateFormatter';
import { validateDate } from '@/lib/timeUtils';

interface ClientPackageSelectorProps {
  packages: ClientPackage[];
  selectedPackage: ClientPackage | null;
  onSelectPackage: (packageItem: ClientPackage | null) => void;
  loading?: boolean;
}

export const ClientPackageSelector: React.FC<ClientPackageSelectorProps> = ({
  packages,
  selectedPackage,
  onSelectPackage,
  loading
}) => {
  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-20 bg-gray-200 rounded animate-pulse"></div>
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500">
        <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No active packages found for this client</p>
      </div>
    );
  }

  const formatExpiryDate = (dateString: any) => {
    const formatted = safeFormatters.shortDate(dateString);
    return formatted || 'No expiry';
  };

  const isExpiringSoon = (dateString: any) => {
    const expiryDate = validateDate(dateString);
    if (!expiryDate) return false;
    const today = new Date();
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-gray-900">Available Packages</h4>
        {selectedPackage && (
          <button
            onClick={() => onSelectPackage(null)}
            className="text-sm text-purple-600 hover:text-purple-700"
          >
            Use regular pricing
          </button>
        )}
      </div>
      
      <div className="grid grid-cols-1 gap-3 max-h-64 overflow-y-auto">
        {packages.map((packageItem) => (
          <Card
            key={packageItem.id}
            className={`cursor-pointer transition-all hover:shadow-md ${
              selectedPackage?.id === packageItem.id
                ? 'ring-2 ring-purple-500 bg-purple-50'
                : 'hover:ring-1 hover:ring-gray-300'
            }`}
            onClick={() => onSelectPackage(packageItem)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h5 className="font-medium text-gray-900">{packageItem.package_name}</h5>
                    {selectedPackage?.id === packageItem.id && (
                      <Badge variant="default" className="bg-purple-100 text-purple-800">
                        Selected
                      </Badge>
                    )}
                    <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50">
                      Active
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{packageItem.sessions_remaining} of {packageItem.total_sessions} sessions</span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{formatExpiryDate(packageItem.expiry_date)}</span>
                      {isExpiringSoon(packageItem.expiry_date) && (
                        <Badge variant="destructive" className="ml-1 text-xs">
                          Expiring Soon
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {packageItem.package_description && (
                    <p className="text-xs text-gray-500 mb-2">{packageItem.package_description}</p>
                  )}
                  
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-green-600">FREE</span>
                    <span className="text-sm text-gray-500 line-through">
                      ${(packageItem.price / packageItem.total_sessions).toFixed(2)} per session
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
