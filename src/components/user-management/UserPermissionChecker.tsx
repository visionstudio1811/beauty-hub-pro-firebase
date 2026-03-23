
import React from 'react';
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
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-sm text-gray-500">Checking permissions...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hasPermission) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <User className="h-5 w-5 text-purple-600" />
            <CardTitle>User Management</CardTitle>
          </div>
          <CardDescription>
            Manage user accounts and permissions for your team
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Access Restricted</h3>
              <p className="text-gray-500 dark:text-gray-400">
                Only administrators can access user management features.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
};
