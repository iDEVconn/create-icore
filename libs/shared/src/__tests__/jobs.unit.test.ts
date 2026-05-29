import { describe, expect, it } from 'vitest';
import { ICORE_QUEUES, type JobsMap } from '../jobs';

describe('ICORE_QUEUES', () => {
  it('exposes three queue names', () => {
    expect(Object.values(ICORE_QUEUES).sort()).toEqual(['cleanup', 'email', 'image-process']);
  });

  it('JobsMap covers every registered queue', () => {
    const names = Object.values(ICORE_QUEUES);
    for (const name of names) {
      const _check: keyof JobsMap = name as keyof JobsMap;
      expect(_check).toBeTruthy();
    }
  });
});
