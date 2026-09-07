import { useEffect, useState } from 'react';

// Global offline indicator — API calls are NetworkOnly (see vite.config.mts),
// so anything requiring the network simply fails while this is shown.
export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-destructive px-4 py-2 text-center text-sm text-white">
      You are offline — changes won't be saved until your connection is back.
    </div>
  );
}
