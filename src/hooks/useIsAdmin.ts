import { useAuth } from '@/contexts/AuthContext';

// Synchronous role check used to gate UI surfaces in front-desk vs admin views.
// Backed by AuthContext's profile.role; updates as soon as the profile loads.
export const useIsAdmin = (): boolean => {
  const { profile } = useAuth();
  return profile?.role === 'admin';
};
