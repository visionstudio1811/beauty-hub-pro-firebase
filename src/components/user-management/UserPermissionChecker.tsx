
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { User, AlertCircle } from 'lucide-react';

interface UserPermissionCheckerProps {
  isLoading: boolean;
  hasPermission: boolean;
}

export const UserPermissionChecker: React.FC<UserPermissionCheckerProps> = ({
  isLoading,
  hasPermission
}) => {
  const { t } = useTranslation('settings');
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-sm text-gray-500">{t('permissionChecker.checking')}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hasPermission) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <User className="h-5 w-5 text-purple-600" />
            <CardTitle>{t('userManagement.title')}</CardTitle>
          </div>
          <CardDescription>
            {t('userManagement.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('permissionChecker.accessRestricted')}</h3>
              <p className="text-gray-500 dark:text-gray-400">
                {t('permissionChecker.adminsOnly')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
};
