import { Alert, Snackbar } from '@mui/material';
import { useNotifyStore } from '../lib/notify';

export function NotificationHost() {
  const queue = useNotifyStore((s) => s.queue);
  const dismiss = useNotifyStore((s) => s.dismiss);

  return (
    <>
      {queue.map((toast, idx) => (
        <Snackbar
          key={toast.id}
          open
          autoHideDuration={toast.duration}
          onClose={() => dismiss(toast.id)}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          // Stack toasts visually
          sx={{ mt: idx * 7 }}
        >
          <Alert
            onClose={() => dismiss(toast.id)}
            severity={toast.variant}
            variant="filled"
            sx={{ width: '100%' }}
          >
            <strong>{toast.title}</strong>
            {toast.description ? <div>{toast.description}</div> : null}
          </Alert>
        </Snackbar>
      ))}
    </>
  );
}
