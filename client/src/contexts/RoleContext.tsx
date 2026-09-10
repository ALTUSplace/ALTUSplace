import React, { createContext, useContext } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';

export type UserRole = 'super_admin' | 'agency_manager';

interface RoleContextType {
  role: UserRole;
  /** Display-only compatibility helper; authorization is enforced by the server. */
  setRole: (role: UserRole) => void;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const role: UserRole = user?.role === 'admin' || user?.role === 'SUPER_ADMIN' ? 'super_admin' : 'agency_manager';

  // Kept for backwards-compatible UI consumers. It intentionally cannot alter
  // the authenticated role or persist an impersonated role in the browser.
  const setRole = (_newRole: UserRole) => undefined;

  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) throw new Error('useRole must be used within a RoleProvider');
  return context;
}
