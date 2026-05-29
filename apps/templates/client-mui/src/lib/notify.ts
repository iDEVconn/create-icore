import { create } from 'zustand';
import { setNotifier, type NotifyOptions } from '@icore/template-shared';

export type NotifyVariant = 'success' | 'error' | 'info' | 'warning';

export interface NotifyToast {
  id: number;
  variant: NotifyVariant;
  title: string;
  description?: string;
  duration: number;
}

interface NotifyState {
  queue: NotifyToast[];
  push: (variant: NotifyVariant, title: string, opts?: NotifyOptions) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useNotifyStore = create<NotifyState>((set) => ({
  queue: [],
  push: (variant, title, opts) =>
    set((state) => ({
      queue: [
        ...state.queue,
        {
          id: nextId++,
          variant,
          title,
          description: opts?.description,
          duration: opts?.duration ?? 4000,
        },
      ],
    })),
  dismiss: (id) => set((state) => ({ queue: state.queue.filter((t) => t.id !== id) })),
}));

export function wireMuiNotifier(): void {
  setNotifier({
    success: (title, opts) => useNotifyStore.getState().push('success', title, opts),
    error: (title, opts) => useNotifyStore.getState().push('error', title, opts),
    info: (title, opts) => useNotifyStore.getState().push('info', title, opts),
    warning: (title, opts) => useNotifyStore.getState().push('warning', title, opts),
  });
}
