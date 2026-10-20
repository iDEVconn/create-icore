import { describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { D1_DATABASE_BINDING } from '@icore/db-d1';
import { SESSION_DO_NAMESPACE, THROTTLER_DO_NAMESPACE } from '@icore/shared';
import { WorkerBindingsModule } from '../bindings.module';
import type { WorkerEnv } from '../env';

const namespace = { idFromName: (n: string) => n, get: () => ({}) };
const compile = (env: Partial<WorkerEnv>) =>
  Test.createTestingModule({
    imports: [
      WorkerBindingsModule.forEnv({
        SESSIONS: namespace,
        THROTTLE: namespace,
        ...env,
      } as WorkerEnv),
    ],
  }).compile();

describe('WorkerBindingsModule', () => {
  it('provides the Durable Object namespaces under the tokens the gateway consumes', async () => {
    const ref = await compile({});
    expect(ref.get(SESSION_DO_NAMESPACE)).toBe(namespace);
    expect(ref.get(THROTTLER_DO_NAMESPACE)).toBe(namespace);
  });

  it('provides the D1 binding only when the Worker has one', async () => {
    const db = { prepare: () => ({}) };
    expect((await compile({ DB: db as never })).get(D1_DATABASE_BINDING)).toBe(db);
    const without = await compile({});
    expect(() => without.get(D1_DATABASE_BINDING)).toThrow();
  });
});
