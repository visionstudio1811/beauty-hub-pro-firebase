
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSecurityValidation } from '@/hooks/useSecurityValidation';
import { UserPermissionChecker } from './user-management/UserPermissionChecker';
import { UserCreationDialog } from './user-management/UserCreationDialog';
import { UserList } from './user-management/UserList';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

export const UserManagement: React.FC = () => {
  const { t } = useTranslation('settings');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingPermissions, setCheckingPermissions] = useState(true);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const { logSecurityEvent, hasPermission } = useSecurityValidation();

  useEffect(() => {
    if (user) {
      checkUserPermissions();
    }
  }, [user]);

  const checkUserPermissions = async () => {
    try {
      setCheckingPermissions(true);
      console.log('Checking user permissions...');
      
      // Check if user can manage users using the updated security validation
      const canManage = await hasPermission('manage', 'users');
      console.log('Can manage users:', canManage);
      
      setHasAdminAccess(canManage);
      
      if (canManage) {
        await fetchProfiles();
        await logSecurityEvent('USER_MANAGEMENT_ACCESS', { success: true });
      } else {
        await logSecurityEvent('USER_MANAGEMENT_ACCESS_DENIED', { userId: user?.uid });
      }
    } catch (error) {
      console.error('Error checking permissions:', error);
      await logSecurityEvent('PERMISSION_CHECK_ERROR', { error: error.message });
      toast({
        title: t('common:status.error'),
        description: t('userManagement.toasts.permissionCheckError'),
        variant: "destructive",
      });
    } finally {
      setCheckingPermissions(false);
      setLoading(false);
    }
  };

  const fetchProfiles = async () => {
    try {
      // Scope to the caller's org. The CF writes camelCase `organizationId`.
      // We deliberately don't use a server-side orderBy because the legacy
      // schema mixes `createdAt` (camelCase, written by adminCreateUser) with
      // `created_at` (snake_case, from earlier seed data). Firestore drops
      // any doc missing the orderBy field, which silently hides newly-created
      // users. Sorting client-side handles both field names.
      if (!currentOrganization?.id) return;
      const snap = await getDocs(
        query(
          collection(db, 'users'),
          where('organizationId', '==', currentOrganization.id),
        )
      );
      const data: Profile[] = snap.docs.map(d => {
        const u = d.data();
        return {
          id: d.id,
          email: u.email ?? '',
          full_name: u.fullName ?? u.full_name ?? null,
          phone: u.phone ?? null,
          role: u.role ?? 'staff',
          is_active: u.isActive ?? u.is_active ?? true,
          created_at: u.createdAt?.toDate?.()?.toISOString() ?? u.created_at ?? new Date().toISOString(),
        };
      });
      data.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      setProfiles(data);
      await logSecurityEvent('PROFILES_FETCHED', { count: data.length });
    } catch (error: any) {
      console.error('Error fetching profiles:', error);
      await logSecurityEvent('PROFILE_FETCH_FAILED', { error: error.message });
      toast({
        title: t('common:status.error'),
        description: t('userManagement.toasts.loadProfilesFailed'),
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (profileId: string, currentStatus: boolean) => {
    try {
      // Additional security check before performing action
      const canManage = await hasPermission('manage', 'users');
      if (!canManage) {
        await logSecurityEvent('UNAUTHORIZED_USER_STATUS_CHANGE', { profileId });
        toast({
          title: t('userManagement.toasts.accessDeniedTitle'),
          description: t('userManagement.toasts.accessDeniedDescription'),
          variant: "destructive",
        });
        return;
      }

      await updateDoc(doc(db, 'users', profileId), { isActive: !currentStatus });

      await fetchProfiles();
      await logSecurityEvent('USER_STATUS_CHANGED', { 
        profileId, 
        newStatus: !currentStatus 
      });
      
      toast({
        title: t('userManagement.toasts.statusUpdatedTitle'),
        description: !currentStatus
          ? t('userManagement.toasts.userActivated')
          : t('userManagement.toasts.userDeactivated'),
      });
    } catch (error) {
      console.error('Error updating user status:', error);
      await logSecurityEvent('USER_STATUS_CHANGE_FAILED', { 
        profileId, 
        error: error.message 
      });
      toast({
        title: t('common:status.error'),
        description: t('userManagement.toasts.statusUpdateFailed'),
        variant: "destructive",
      });
    }
  };

  if (checkingPermissions || (!hasAdminAccess && !checkingPermissions)) {
    return (
      <UserPermissionChecker 
        isLoading={checkingPermissions} 
        hasPermission={hasAdminAccess} 
      />
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-sm text-gray-500">{t('userManagement.loadingUsers')}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <User className="h-5 w-5 text-purple-600" />
            <CardTitle>{t('userManagement.title')}</CardTitle>
          </div>
          <UserCreationDialog onUserCreated={fetchProfiles} />
        </div>
        <CardDescription>
          {t('userManagement.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <UserList 
          profiles={profiles} 
          onToggleActive={handleToggleActive} 
        />
      </CardContent>
    </Card>
  );
};
