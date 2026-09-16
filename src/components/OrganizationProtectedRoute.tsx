import React, { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { OrganizationSetup } from '@/components/OrganizationSetup';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface OrganizationProtectedRouteProps {
  children: React.ReactNode;
}

const STUCK_TIMEOUT_MS = 12000;

export const OrganizationProtectedRoute: React.FC<OrganizationProtectedRouteProps> = ({ children }) => {
  const { t } = useTranslation('shell');
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const { currentOrganization, loading: orgLoading } = useOrganization();
  const [setupComplete, setSetupComplete] = useState(false);
  const [stuckBackstop, setStuckBackstop] = useState(false);

  const stillLoading = authLoading || orgLoading;

  // Backstop: if either loading flag stays true for too long (network issue,
  // missing index, transient rule denial), surface a sign-out escape rather
  // than leaving the user staring at a frozen skeleton.
  useEffect(() => {
    if (!stillLoading) {
      setStuckBackstop(false);
      return;
    }
    const t = window.setTimeout(() => setStuckBackstop(true), STUCK_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [stillLoading]);

  if (stillLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="space-y-4 w-full max-w-md">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          {stuckBackstop && (
            <div className="mt-6 p-3 rounded border border-amber-300 bg-amber-50 text-amber-900 text-sm space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p>{t('orgProtected.takingLonger')}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void signOut()}>
                {t('common:actions.signOut')}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Auth resolved but no user/profile doc was found. This happens when the
  // Firebase Auth account exists (cached session) but `users/{uid}` is missing
  // — e.g. the doc was deleted, never created, or the user was provisioned in
  // a different project. Without this branch, the page would silently drop
  // through to the catch-all and render an empty/broken dashboard.
  if (user && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full border rounded-lg p-6 space-y-4 bg-card">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold">{t('orgProtected.profileNotFound')}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                <Trans
                  t={t}
                  i18nKey="orgProtected.profileNotFoundDescription"
                  values={{ email: user.email }}
                  components={{ em: <span className="font-medium ltr-inline" /> }}
                />
              </p>
            </div>
          </div>
          <Button onClick={() => void signOut()} variant="outline" className="w-full">
            {t('common:actions.signOut')}
          </Button>
        </div>
      </div>
    );
  }

  // Profile loaded but the user record genuinely has no organizationId — show setup
  if (user && profile && !profile.organizationId && !currentOrganization && !setupComplete) {
    return <OrganizationSetup onComplete={() => setSetupComplete(true)} />;
  }

  // Profile has an organizationId but the org doc could not be loaded (deleted,
  // renamed, or rule-blocked). Don't render the dashboard in that broken state.
  if (user && profile && profile.organizationId && !currentOrganization) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full border rounded-lg p-6 space-y-4 bg-card">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold">{t('orgProtected.orgUnavailable')}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t('orgProtected.orgUnavailableDescription')}
              </p>
            </div>
          </div>
          <Button onClick={() => void signOut()} variant="outline" className="w-full">
            {t('common:actions.signOut')}
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
