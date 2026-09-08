import { useEffect } from 'react';
import { toast } from 'sonner';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Mounted once in main.tsx, renders nothing itself — surfaces service-worker
// lifecycle events as toasts via the existing sonner Toaster.
export function UpdatePrompt() {
  const {
    offlineReady: [isOfflineReady],
    needRefresh: [needsRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (isOfflineReady) toast.success('Ready to work offline');
  }, [isOfflineReady]);

  useEffect(() => {
    if (!needsRefresh) return;
    toast('New version available', {
      duration: Infinity,
      action: {
        label: 'Reload',
        onClick: () => updateServiceWorker(true),
      },
    });
  }, [needsRefresh, updateServiceWorker]);

  return null;
}
