export const ICORE_QUEUES = {
  email: 'email',
  imageProcess: 'image-process',
  cleanup: 'cleanup',
} as const;

export type IcoreQueueName = (typeof ICORE_QUEUES)[keyof typeof ICORE_QUEUES];

export interface EmailJob {
  to: string;
  subject: string;
  body: string;
}

export interface ImageProcessJob {
  bucket: string;
  path: string;
  ops: string[];
}

export interface CleanupJob {
  kind: 'expired-magic-links' | 'orphan-uploads';
  olderThanMs: number;
}

export interface JobsMap {
  email: EmailJob;
  'image-process': ImageProcessJob;
  cleanup: CleanupJob;
}
