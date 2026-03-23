import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { OrganizationSetup } from '@/components/OrganizationSetup';
import { Skeleton } from '@/components/ui/skeleton';

interface OrganizationProtectedRouteProps {
  children: React.ReactNode;
}

export const OrganizationProtectedRoute: React.FC<OrganizationProtectedRouteProps> = ({ children }) => {
  const { user } = useAuth();
  const { currentOrganization, loading } = useOrganization();
  const [setupComplete, setSetupComplete] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  // If user doesn't have an organization, show setup
  if (user && !currentOrganization && !setupComplete) {
    return <OrganizationSetup onComplete={() => setSetupComplete(true)} />;
  }

  return <>{children}</>;
};
