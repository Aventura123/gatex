/**
 * Admin Authentication Provider
 * 
 * Wraps admin pages to ensure proper Firebase Auth synchronization
 * and provides admin-specific authentication context.
 */

"use client";

import React, { createContext, useContext, ReactNode } from 'react';
import { useAdminAuth, AdminAuthState } from '../hooks/useAdminAuth';

interface AdminAuthContextType extends AdminAuthState {
  isLoading: boolean;
  hasPermission: (requiredRole?: 'admin' | 'support') => boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const authState = useAdminAuth();

  const contextValue: AdminAuthContextType = {
    ...authState,
    isLoading: !authState.isReady,
    hasPermission: (requiredRole?: 'admin' | 'support') => {
      if (!authState.user || !authState.role) return false;
      
      if (!requiredRole) {
        // Any admin/support role is sufficient
        return authState.isAdmin || authState.isSupport;
      }
      
      if (requiredRole === 'admin') {
        return authState.isAdmin;
      }
      
      if (requiredRole === 'support') {
        return authState.isAdmin || authState.isSupport; // Admin can access support features
      }
      
      return false;
    }
  };

  return (
    <AdminAuthContext.Provider value={contextValue}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuthContext() {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error('useAdminAuthContext must be used within an AdminAuthProvider');
  }
  return context;
}

/**
 * HOC to protect admin routes
 */
export function withAdminAuth<P extends object>(
  Component: React.ComponentType<P>,
  requiredRole?: 'admin' | 'support'
) {
  return function ProtectedAdminComponent(props: P) {
    const authContext = useAdminAuthContext();
    const { user, isLoading, hasPermission } = authContext;

    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p>Verifying authentication...</p>
          </div>
        </div>
      );
    }

    if (!user || !hasPermission(requiredRole)) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-red-600 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-4">
              You do not have permission to access this page.
            </p>
            <a 
              href="/admin-login" 
              className="text-blue-600 hover:text-blue-800 underline"
            >
              Go to Admin Login
            </a>
          </div>
        </div>
      );
    }

    return <Component {...props} />;
  };
}
