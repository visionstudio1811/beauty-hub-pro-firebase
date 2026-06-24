import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  signInWithPopup,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { auth, db } from '@/lib/firebase';
import { isSessionExpired, markActivity } from '@/lib/idleSession';

export interface UserProfile {
  uid: string;
  email: string;
  phone: string;
  fullName: string;
  role: 'admin' | 'staff' | 'reception' | 'beautician';
  organizationId: string | null;
  organizationRole: string | null;
  isActive: boolean;
  createdAt: any;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signInWithGoogle: async () => {},
  signInWithEmail: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  // Whether the first auth resolution after page load has been handled. A user
  // present on that first callback is a RESTORED session (not an interactive
  // login), so that's where we enforce the "away too long" window.
  const initialAuthHandledRef = useRef(false);

  const loadProfile = async (uid: string): Promise<UserProfile | null> => {
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { uid, ...docSnap.data() } as UserProfile;
      }
      return null;
    } catch (error) {
      console.error('Error loading profile:', error);
      return null;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const p = await loadProfile(user.uid);
      setProfile(p);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const isInitial = !initialAuthHandledRef.current;
      initialAuthHandledRef.current = true;

      // On the first auth resolution after a page (re)load, a present user is a
      // RESTORED session. If the user has been away longer than the allowed
      // window, drop the session instead of silently reconnecting — they must
      // sign in again. (Interactive logins are never the initial callback, and
      // they refresh the activity stamp below, so they're never expired.)
      if (firebaseUser && isInitial && isSessionExpired()) {
        try {
          await firebaseSignOut(auth);
        } catch (err) {
          console.warn('Stale-session signOut failed', err);
        }
        setUser(null);
        setProfile(null);
        setLoading(false);
        return; // onAuthStateChanged will fire again with null
      }

      setUser(firebaseUser);
      if (firebaseUser) {
        // Accepted session (fresh login or a non-expired restore) → start a
        // fresh activity window.
        markActivity();
        const p = await loadProfile(firebaseUser.uid);
        setProfile(p);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setProfile(null);
    // Flush React Query caches so the next user on a shared device cannot see
    // the previous user's tenant data (clients, appointments, etc).
    queryClient.clear();
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, signInWithGoogle, signInWithEmail, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
};
