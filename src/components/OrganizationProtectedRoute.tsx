import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { OrganizationSetup } from '@/components/OrganizationSetup';
import { Skeleton } from '@/components/ui/skeleton';

interface OrganizationProtectedRouteProps {
  children: React.ReactNode;
}

export const OrganizationProtectedRoute: React.FC<OrganizationProtectedRouteProps> = ({ children }) => {
  const { user, profile, loading: authLoading } = useAuth();
  const { currentOrganization, loading: orgLoading } = useOrganization();
  const [setupComplete, setSetupComplete] = useState(false);

  // Wait for both auth and org to finish loading. Critically, also wait when
  // we have a `user` but `profile` is still null — the auth user object is
  // restored synchronously on refresh, but `users/{uid}` (which carries
  // organizationId) is fetched async. Without this guard, the org context
  // briefly sees user-without-profile, returns currentOrganization=null, and
  // the setup page flashes/persists until the profile load resolves.
  const stillLoading = authLoading || orgLoading || (Boolean(user) && !profile);

  if (stillLoading) {
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

  // Profile loaded but the user record genuinely has no organizationId — show setup
  if (user && profile && !profile.organizationId && !currentOrganization && !setupComplete) {
    return <OrganizationSetup onComplete={() => setSetupComplete(true)} />;
  }

  return <>{children}</>;
};
