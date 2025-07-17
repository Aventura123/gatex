/**
 * React Hook for Admin Authentication State
 * 
 * Provides real-time admin authentication state with proper Firebase Auth synchronization.
 * This hook monitors Firebase Auth state and automatically extracts admin/support roles.
 */

import { useState, useEffect } from 'react';
import { User, onAuthStateChanged, getIdToken } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { internalEmailToUsername, internalEmailToRole, isInternalEmail } from '../utils/adminEmailConverter';
import { getCurrentAdminInfo } from '../utils/adminAuthSync';

export interface AdminAuthState {
  user: User | null;
  isAdmin: boolean;
  isSupport: boolean;
  username: string | null;
  role: 'admin' | 'support' | null;
  customClaims: any;
  isReady: boolean;
}

/**
 * Main hook to monitor admin authentication state
 */
export function useAdminAuth() {
  const [authState, setAuthState] = useState<AdminAuthState>({
    user: null,
    isAdmin: false,
    isSupport: false,
    username: null,
    role: null,
    customClaims: null,
    isReady: false
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAuthState({
          user: null,
          isAdmin: false,
          isSupport: false,
          username: null,
          role: null,
          customClaims: null,
          isReady: true
        });
        return;
      }

      try {
        // Check if this is an internal admin/support email
        const email = user.email;
        if (!email || !isInternalEmail(email)) {
          setAuthState({
            user,
            isAdmin: false,
            isSupport: false,
            username: null,
            role: null,
            customClaims: null,
            isReady: true
          });
          return;
        }

        // Get fresh ID token with custom claims
        const idToken = await getIdToken(user, true);
        const decodedToken = await user.getIdTokenResult(true);
        const customClaims = decodedToken.claims;

        // Extract info from internal email
        const username = internalEmailToUsername(email);
        const role = internalEmailToRole(email);

        setAuthState({
          user,
          isAdmin: role === 'admin' || customClaims.role === 'admin',
          isSupport: role === 'support' || customClaims.role === 'support',
          username: (customClaims.username as string) || username,
          role: (customClaims.role as 'admin' | 'support') || role,
          customClaims,
          isReady: true
        });

      } catch (error) {
        console.error('❌ Error processing admin auth state:', error);
        setAuthState({
          user,
          isAdmin: false,
          isSupport: false,
          username: null,
          role: null,
          customClaims: null,
          isReady: true
        });
      }
    });

    // Cleanup function
    return () => {
      unsubscribe();
    };
  }, []);

  return authState;
}

/**
 * Hook to get current admin info (synchronous)
 */
export function useCurrentAdminInfo() {
  const [adminInfo, setAdminInfo] = useState(() => getCurrentAdminInfo());

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && user.email && isInternalEmail(user.email)) {
        try {
          const username = internalEmailToUsername(user.email);
          const role = internalEmailToRole(user.email);
          
          setAdminInfo({
            uid: user.uid,
            username: username,
            role: role,
            email: user.email
          });
        } catch (error) {
          console.warn('⚠️ Could not extract admin info from email:', error);
          setAdminInfo({ uid: user.uid, username: null, role: null, email: user.email });
        }
      } else {
        setAdminInfo({ uid: null, username: null, role: null, email: null });
      }
    });

    return unsubscribe;
  }, []);

  return adminInfo;
}

/**
 * Hook that provides admin authentication utilities
 */
export function useAdminAuthUtils() {
  const authState = useAdminAuth();

  return {
    ...authState,
    isAuthenticated: !!authState.user,
    hasAdminRole: authState.isAdmin || authState.isSupport,
    displayName: authState.username || authState.user?.email || 'Unknown',
    loading: !authState.isReady
  };
}
