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
  driverAvailable: boolean;
  selectRole: (role: UserRole | null) => void;
};

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export function RoleProvider({ children }: PropsWithChildren) {
  const [activeRole, setActiveRole] = useState<UserRole | null>(null);
  const [driverAvailable,setDriverAvailable]=useState(false);
  const selectRole = useCallback((role: UserRole | null) => {setActiveRole(role);if(role==='driver')setDriverAvailable(true);else if(role===null)setDriverAvailable(false);}, []);
  const value = useMemo(() => ({ activeRole, selectRole,driverAvailable }), [activeRole, selectRole,driverAvailable]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const context = useContext(RoleContext);

  if (!context) {
    throw new Error('useRole must be used within a RoleProvider.');
  }

  return context;
}
