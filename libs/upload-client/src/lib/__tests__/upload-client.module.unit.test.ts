import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UploadClientModule } from '../upload-client.module';

// Two feature modules importing the same client, as the REST and GraphQL surfaces do with --api=both.
class SurfaceA {}
Module({ imports: [UploadClientModule.forRoot()] })(SurfaceA);
class SurfaceB {}
Module({ imports: [UploadClientModule.forRoot()] })(SurfaceB);

describe('UploadClientModule.forRoot()', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.UPLOAD_TRANSPORT = 'tcp';
    process.env.UPLOAD_HOST = '127.0.0.1';
    process.env.UPLOAD_PORT = '4999';
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('returns the same dynamic module on every call', () => {
    expect(UploadClientModule.forRoot()).toBe(UploadClientModule.forRoot());
  });

  it('is instantiated once when two modules import it (one TCP client, not two)', async () => {
    const app = await Test.createTestingModule({ imports: [SurfaceA, SurfaceB] }).compile();
    const modules = [...app['container'].getModules().values()] as {
      metatype?: { name?: string };
    }[];
    expect(modules.filter((m) => m.metatype?.name === 'UploadClientModule')).toHaveLength(1);
    await app.close();
  });
});
