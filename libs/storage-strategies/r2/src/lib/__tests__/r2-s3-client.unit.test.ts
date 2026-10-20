import { describe, it, expect, vi } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';
import { createR2S3Client } from '../r2-s3-client.js';

const creds = { accountId: 'acc123', accessKeyId: 'AKID', secretAccessKey: 'secret' };

describe('createR2S3Client', () => {
  it('presignGetObject targets <account>.r2.cloudflarestorage.com with X-Amz-Expires equal to the requested ttl', async () => {
    const client = createR2S3Client(creds);
    const url = new URL(await client.presignGetObject('bkt', 'u1/file.txt', 123));
    expect(url.host).toContain('acc123.r2.cloudflarestorage.com');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('123');
    expect(url.pathname).toContain('u1/file.txt');
  });

  it('listKeys follows ContinuationToken until exhausted', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const pages = [
      {
        Contents: [{ Key: 'u1/a' }, { Key: 'u1/b' }],
        IsTruncated: true,
        NextContinuationToken: 't1',
      },
      { Contents: [{ Key: 'u1/c' }], IsTruncated: true, NextContinuationToken: 't2' },
      { Contents: [{ Key: 'u1/d' }], IsTruncated: false },
    ];
    const spy = vi.spyOn(S3Client.prototype, 'send').mockImplementation((async (cmd: {
      input: Record<string, unknown>;
    }) => {
      calls.push(cmd.input);
      return pages[calls.length - 1];
    }) as never);
    try {
      const keys = await createR2S3Client(creds).listKeys('bkt', 'u1/');
      expect(keys).toEqual(['u1/a', 'u1/b', 'u1/c', 'u1/d']);
      expect(calls.map((c) => c['ContinuationToken'])).toEqual([undefined, 't1', 't2']);
      expect(calls[0]).toMatchObject({ Bucket: 'bkt', Prefix: 'u1/' });
    } finally {
      spy.mockRestore();
    }
  });

  it('listKeys returns an empty array for an empty bucket page', async () => {
    const spy = vi
      .spyOn(S3Client.prototype, 'send')
      .mockImplementation((async () => ({ IsTruncated: false })) as never);
    try {
      expect(await createR2S3Client(creds).listKeys('bkt', 'x/')).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
