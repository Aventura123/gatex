/**
 * Admin Authentication Utilities
 * 
 * Provides authentication utilities for admin/support users.
 * This module handles token management, validation, and Firestore access testing.
 * 
 * For React components, use the useAdminAuth hook instead.
 */

import { auth } from '../lib/firebase';
import { getIdToken } from 'firebase/auth';
import { internalEmailToUsername, internalEmailToRole, isInternalEmail } from './adminEmailConverter';

/**
 * Gets Firebase Auth token for API calls
 * This replaces localStorage token for authenticated requests
 */
export async function getFirebaseAuthToken(): Promise<string | null> {
  const currentUser = auth.currentUser;
  
  if (!currentUser) {
    console.warn('⚠️ No authenticated user for Firebase token');
    return null;
  }

  try {
    // Get fresh ID token for API calls
    const idToken = await getIdToken(currentUser, true);
    console.log('✅ Firebase Auth token obtained for API call');
    return idToken;
  } catch (error) {
    console.error('❌ Error getting Firebase Auth token:', error);
    return null;
  }
}

/**
 * Validates that current user has admin permissions
 * Works with both internal emails and external emails with custom claims
 */
export async function validateAdminAuth(): Promise<boolean> {
  try {
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      console.log('❌ No user authenticated');
      return false;
    }

    // Get fresh token with custom claims
    const tokenResult = await currentUser.getIdTokenResult(true);
    const claims = tokenResult.claims;
    const role = claims.role;

    // Check if user has admin/support role via custom claims
    const isValidAdmin = role === 'admin' || role === 'support';
    
    if (isValidAdmin) {
      console.log('✅ Admin authentication validated via custom claims:', {
        uid: currentUser.uid,
        email: currentUser.email,
        role: role,
        username: claims.username
      });
      return true;
    }

    // Fallback: Check if email is internal admin/support email
    const email = currentUser.email;
    if (email && isInternalEmail(email)) {
      const emailRole = internalEmailToRole(email);
      console.log('✅ Admin authentication validated via internal email:', {
        uid: currentUser.uid,
        email: email,
        role: emailRole
      });
      return true;
    }

    console.log('❌ User does not have admin permissions:', { 
      email: currentUser.email,
      role: role,
      claims: claims 
    });
    return false;
  } catch (error) {
    console.error('❌ Error validating admin auth:', error);
    return false;
  }
}

/**
 * Performs a test write to Firestore to verify auth rules are working
 */
export async function testFirestoreAccess(): Promise<boolean> {
  try {
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      console.log('❌ No authenticated user for Firestore test');
      return false;
    }

    // This will use the Firebase Auth token automatically
    const { db } = await import('../lib/firebase');
    const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
    
    const testDoc = doc(db, 'firestore-write-test', `admin-test-${Date.now()}`);
    
    await setDoc(testDoc, {
      testBy: currentUser.uid,
      testEmail: currentUser.email,
      timestamp: serverTimestamp(),
      message: 'Admin Firestore access test successful'
    });

    console.log('✅ Firestore write test successful');
    return true;
  } catch (error: any) {
    console.error('❌ Firestore write test failed:', error);
    
    // Log specific permission errors
    if (error.code === 'permission-denied') {
      console.error('🚫 Permission denied - Check Firestore Rules and custom claims');
    }
    
    return false;
  }
}

/**
 * Gets current admin user info for UI display
 */
export function getCurrentAdminInfo(): {
  uid: string | null;
  username: string | null;
  role: string | null;
  email: string | null;
} {
  const currentUser = auth.currentUser;
  
  if (!currentUser) {
    return { uid: null, username: null, role: null, email: null };
  }

  let username: string | null = null;
  let role: string | null = null;

  // Try to extract from internal email
  if (currentUser.email && isInternalEmail(currentUser.email)) {
    try {
      username = internalEmailToUsername(currentUser.email);
      role = internalEmailToRole(currentUser.email);
    } catch (error) {
      console.warn('⚠️ Could not extract username/role from email:', error);
    }
  }

  return {
    uid: currentUser.uid,
    username: username,
    role: role,
    email: currentUser.email
  };
}
