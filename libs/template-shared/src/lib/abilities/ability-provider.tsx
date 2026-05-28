import { createContextualCan } from '@casl/react';
import { createContext, type ReactNode, useMemo } from 'react';
import { defineAbilitiesFor, emptyAbility, type AppAbility } from '@icore/shared';
import { useAuthStore } from '../stores/auth.store.js';

export const AbilityContext = createContext<AppAbility>(emptyAbility());

export function AbilityProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const ability = useMemo<AppAbility>(
    () =>
      user
        ? defineAbilitiesFor({ id: user.id, role: user.role === 'admin' ? 'admin' : 'user' })
        : defineAbilitiesFor(null),
    [user],
  );
  return <AbilityContext.Provider value={ability}>{children}</AbilityContext.Provider>;
}

export const Can = createContextualCan(AbilityContext.Consumer);
