import { useEffect, useState, type ReactNode } from 'react';
import { performSilentRefresh, useAuthStore } from '@icore/template-shared';
import { Loader2 } from 'lucide-react';

export function AuthBootstrap({ children }: { children: ReactNode }) {
  const [booted, setBooted] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    let cancelled = false;
    void performSilentRefresh(import.meta.env.VITE_API_URL ?? '/api').then((result) => {
      if (cancelled) return;
      if (result) setUser(result.user);
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
