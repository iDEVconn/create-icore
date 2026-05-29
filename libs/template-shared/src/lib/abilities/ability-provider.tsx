import { AbilityProvider as CaslAbilityProvider, Can } from '@casl/react';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { defineAbilitiesFor, type AppAbility } from '@icore/shared/client';
import { useAuthStore } from '../stores/auth.store.js';

export { Can };

export function AbilityProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const ability = useMemo<AppAbility>(
    () =>
      user
        ? defineAbilitiesFor({ id: user.id, role: user.role === 'admin' ? 'admin' : 'user' })
        : defineAbilitiesFor(null),
    [user],
  );
  return <CaslAbilityProvider value={ability}>{children}</CaslAbilityProvider>;
}
