import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { doc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const useSecurityValidation = () => {
  const { user, profile } = useAuth();

  const [isAdmin, setIsAdmin] = useState(false);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [canManageBusinessData, setCanManageBusinessData] = useState(false);
  const [canViewData, setCanViewData] = useState(false);
  const [isBeautician, setIsBeautician] = useState(false);
  const [canAccessSettings, setCanAccessSettings] = useState(false);
  const [roleFlagsLoading, setRoleFlagsLoading] = useState(true);

  useEffect(() => {
    if (!user || !profile) {
      setIsAdmin(false);
      setCanManageUsers(false);
      setCanManageBusinessData(false);
      setCanViewData(false);
      setIsBeautician(false);
      setCanAccessSettings(false);
      setRoleFlagsLoading(false);
      return;
    }

    const userRole = profile.role || 'staff';
    setIsAdmin(userRole === 'admin');
    setCanManageUsers(userRole === 'admin');
    setCanManageBusinessData(['admin', 'staff'].includes(userRole));
    setCanViewData(true);
    setIsBeautician(userRole === 'beautician');
    setCanAccessSettings(['admin', 'staff'].includes(userRole));
    setRoleFlagsLoading(false);
  }, [user?.uid, profile?.role]);

  const validateUserRole = async (requiredRoles: string[]): Promise<boolean> => {
    if (!user || !profile) return false;

    const userRole = profile.role || 'staff';
    const hasPermission = requiredRoles.includes(userRole);

    await logSecurityEvent('ROLE_VALIDATION', {
      userRole,
      requiredRoles,
      hasPermission,
      userId: user.uid,
    });

    return hasPermission;
  };

  const logSecurityEvent = async (action: string, details?: any) => {
    if (!user) return;
    try {
      const orgId = profile?.organizationId;
      if (orgId) {
        await addDoc(collection(db, 'organizations', orgId, 'auditLogs'), {
          action,
          details: details ? JSON.stringify(details) : null,
          severity: details?.severity || 'info',
          userId: user.uid,
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error('Error logging security event:', error);
    }
  };

  const hasPermission = async (permission: 'view' | 'manage', resource: string): Promise<boolean> => {
    if (!user || !profile) {
      await logSecurityEvent('PERMISSION_CHECK_NO_USER', { permission, resource });
      return false;
    }

    const userRole = profile.role || 'staff';

    const permissions: Record<string, { view: string[]; manage: string[] }> = {
      admin: { view: ['*'], manage: ['*'] },
      staff: {
        view: ['clients', 'appointments', 'treatments', 'packages', 'products'],
        manage: ['clients', 'appointments', 'treatments', 'packages', 'products'],
      },
      reception: {
        view: ['clients', 'appointments'],
        manage: ['appointments'],
      },
      beautician: {
        view: ['clients', 'appointments', 'treatments'],
        manage: ['appointments'],
      },
    };

    const userPermissions = permissions[userRole];
    if (!userPermissions) {
      await logSecurityEvent('UNKNOWN_ROLE', { userRole, permission, resource });
      return false;
    }

    const hasResourcePermission =
      userPermissions[permission]?.includes('*') ||
      userPermissions[permission]?.includes(resource);

    await logSecurityEvent('PERMISSION_CHECK', {
      userRole,
      permission,
      resource,
      granted: hasResourcePermission,
    });

    return hasResourcePermission || false;
  };

  const refreshUserSession = async () => {
    // Firebase handles token refresh automatically
    await logSecurityEvent('SESSION_REFRESH_SUCCESS', {});
  };

  const validateDataAccess = async (resourceType: string, resourceId?: string): Promise<boolean> => {
    if (!user) return false;
    const hasAccess = await hasPermission('view', resourceType);
    await logSecurityEvent('DATA_ACCESS_CHECK', {
      resourceType,
      resourceId: resourceId ? '[REDACTED]' : undefined,
      granted: hasAccess,
    });
    return hasAccess;
  };

  return {
    validateUserRole,
    isAdmin,
    isBeautician,
    canManageUsers,
    canManageBusinessData,
    canViewData,
    canAccessSettings,
    roleFlagsLoading,
    logSecurityEvent,
    hasPermission,
    refreshUserSession,
    validateDataAccess,
  };
};
