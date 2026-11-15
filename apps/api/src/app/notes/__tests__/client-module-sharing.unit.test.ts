import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotesClientModule } from '@icore/notes-client';
import { UploadClientModule } from '@icore/upload-client';
import { NotesModule } from '../notes.module';
import { NotesGraphqlModule } from '../graphql/notes-graphql.module';

const ENV = {
  NOTES_TRANSPORT: 'tcp',
  NOTES_HOST: '127.0.0.1',
  NOTES_PORT: '4999',
  UPLOAD_TRANSPORT: 'tcp',
  UPLOAD_HOST: '127.0.0.1',
  UPLOAD_PORT: '4998',
};

describe('--api=both: one microservice client per gateway', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const [k, v] of Object.entries(ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
  });
  afterEach(() => {
    for (const k of Object.keys(ENV)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('forRoot() hands out the same dynamic module every call', () => {
    expect(NotesClientModule.forRoot()).toBe(NotesClientModule.forRoot());
    expect(UploadClientModule.forRoot()).toBe(UploadClientModule.forRoot());
  });

  it('REST and GraphQL surfaces share one NotesClientModule instance', async () => {
    const app = await Test.createTestingModule({
      imports: [NotesModule, NotesGraphqlModule],
    }).compile();
    const count = (name: string) =>
      [...app['container'].getModules().values()].filter(
        (m: { metatype?: { name?: string } }) => m.metatype?.name === name,
      ).length;
    expect(count('NotesClientModule')).toBe(1);
    await app.close();
  });
});
