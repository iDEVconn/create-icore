import type { NotificationInstance } from 'antd/es/notification/interface';
import { setNotifier } from '@icore/template-shared';

export function bindNotifier(instance: NotificationInstance): void {
  setNotifier({
    success: (title, opts) =>
      instance.success({
        message: title,
        description: opts?.description,
        duration: opts?.duration,
      }),
    error: (title, opts) =>
      instance.error({
        message: title,
        description: opts?.description,
        duration: opts?.duration,
      }),
    info: (title, opts) =>
      instance.info({
        message: title,
        description: opts?.description,
        duration: opts?.duration,
      }),
    warning: (title, opts) =>
      instance.warning({
        message: title,
        description: opts?.description,
        duration: opts?.duration,
      }),
  });
}
