export interface NotifyOptions {
  description?: string;
  duration?: number;
}

export interface Notifier {
  success(title: string, opts?: NotifyOptions): void;
  error(title: string, opts?: NotifyOptions): void;
  info(title: string, opts?: NotifyOptions): void;
  warning(title: string, opts?: NotifyOptions): void;
}

let active: Notifier = {
  success: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warning: () => undefined,
};

export function setNotifier(n: Notifier): void {
  active = n;
}

export function useNotify(): Notifier {
  return active;
}
