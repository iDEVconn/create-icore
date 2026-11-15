import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NotesClientModule } from '../notes-client.module';

// Two feature modules importing the same client, as the REST and GraphQL surfaces do with --api=both.
class SurfaceA {}
Module({ imports: [NotesClientModule.forRoot()] })(SurfaceA);
class SurfaceB {}
Module({ imports: [NotesClientModule.forRoot()] })(SurfaceB);

describe('NotesClientModule.forRoot()', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.NOTES_TRANSPORT = 'tcp';
    process.env.NOTES_HOST = '127.0.0.1';
    process.env.NOTES_PORT = '4999';
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('returns the same dynamic module on every call', () => {
    expect(NotesClientModule.forRoot()).toBe(NotesClientModule.forRoot());
  });

  it('is instantiated once when two modules import it (one TCP client, not two)', async () => {
    const app = await Test.createTestingModule({ imports: [SurfaceA, SurfaceB] }).compile();
    const modules = [...app['container'].getModules().values()] as {
      metatype?: { name?: string };
    }[];
    expect(modules.filter((m) => m.metatype?.name === 'NotesClientModule')).toHaveLength(1);
    await app.close();
  });
});
