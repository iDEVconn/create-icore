import { useEffect, useState, type ReactNode } from 'react';
import { useAuthStore, type AuthUser } from '@icore/template-shared';
import { Loader2 } from 'lucide-react';
import { api } from '@/main';

export function AuthBootstrap({ children }: { children: ReactNode }) {
  const [booted, setBooted] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { user } = await api<{ user: AuthUser }>('/auth/session');
        if (cancelled) return;
        setUser(user);
      } catch {
        // 401 -- no session, or a 503 -- auth service down; either way the
        // user is treated as logged out for this render. A 503 does not mean
        // "corrupt the stored session" since there is no client-stored
        // session anymore to corrupt -- the cookie is untouched, so a retry
        // (page reload) recovers automatically once the auth service is back.
        if (cancelled) return;
        useAuthStore.getState().logout();
      } finally {
        if (!cancelled) setBooted(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setUser]);

  if (!booted) {
    return (
      <main className="bg-background flex min-h-screen items-center justify-center">
        <Loader2 className="text-muted-foreground size-8 animate-spin" />
      </main>
    );
  }

  return <>{children}</>;
}
