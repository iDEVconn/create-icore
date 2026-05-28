import { toast } from 'sonner';
import { setNotifier } from '@icore/template-shared';

export function wireShadcnNotifier() {
  setNotifier({
    success: (title, opts) =>
      toast.success(title, { description: opts?.description, duration: opts?.duration }),
    error: (title, opts) =>
      toast.error(title, { description: opts?.description, duration: opts?.duration }),
    info: (title, opts) =>
      toast(title, { description: opts?.description, duration: opts?.duration }),
    warning: (title, opts) =>
      toast.warning(title, { description: opts?.description, duration: opts?.duration }),
  });
}
