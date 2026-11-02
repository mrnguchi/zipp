import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';

import type { UserRole } from '../types/domain';

type RoleContextValue = {
  activeRole: UserRole | null;
  selectRole: (role: UserRole | null) => void;
};

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export function RoleProvider({ children }: PropsWithChildren) {
  const [activeRole, setActiveRole] = useState<UserRole | null>(null);
  const selectRole = useCallback((role: UserRole | null) => setActiveRole(role), []);
  const value = useMemo(() => ({ activeRole, selectRole }), [activeRole, selectRole]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const context = useContext(RoleContext);

  if (!context) {
    throw new Error('useRole must be used within a RoleProvider.');
  }

  return context;
}
