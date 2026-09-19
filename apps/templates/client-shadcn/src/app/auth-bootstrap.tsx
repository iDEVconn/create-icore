import { useEffect, useState, type ReactNode } from 'react';
import { performSilentRefresh, readCsrfCookie, useAuthStore } from '@icore/template-shared';
import { Loader2 } from 'lucide-react';

export function AuthBootstrap({ children }: { children: ReactNode }) {
  const [booted, setBooted] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    let cancelled = false;

    // The CSRF cookie is set alongside the refresh cookie on every login/register/
    // refresh — a free, zero-network signal that this browser plausibly has an
    // existing session. Without it, skip the doomed network round-trip: it would
    // block every anonymous page load behind a full-screen spinner and eats into
    // the shared auth-burst throttle (10 req/60s across register+login+refresh).
    if (readCsrfCookie() === null) {
      useAuthStore.getState().logout();
      setBooted(true);
      return;
    }

    void performSilentRefresh(import.meta.env.VITE_API_URL ?? '/api').then((result) => {
      if (cancelled) return;
      if (result) {
        setUser(result.user);
      } else {
        // Refresh failed (expired/revoked cookie) — clear any stale persisted
        // user so nothing (e.g. CASL ability building) treats this browser as
        // logged in with no actual valid session.
        useAuthStore.getState().logout();
      }
      setBooted(true);
    });
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
