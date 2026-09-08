import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAiUsageDbProvider, cleanupUnusedAiUsageDb } from '../wire-ai-usage-db.js';

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-wire-ai-usage-db-'));
  await mkdir(join(dir, 'apps/microservices/ai-orchestrator/src/app'), { recursive: true });
  await writeFile(
    join(dir, 'apps/microservices/ai-orchestrator/src/app/ai-usage-db.provider.ts'),
    `import { SupabaseDbModule } from '@icore/db-supabase';\nexport const AiUsageDbProviderModule = SupabaseDbModule.forRoot('x');\n`,
  );
  for (const d of ['supabase', 'firestore', 'mongodb', 'postgres']) {
    await mkdir(join(dir, `libs/db-strategies/${d}/src`), { recursive: true });
    await writeFile(join(dir, `libs/db-strategies/${d}/src/index.ts`), 'export {};');
  }
  await writeFile(
    join(dir, 'apps/microservices/ai-orchestrator/package.json'),
    JSON.stringify({
      name: 'ai-orchestrator',
      dependencies: {
        '@icore/db-supabase': '*',
        '@icore/db-firestore': '*',
        '@icore/db-mongodb': '*',
        '@icore/db-postgres': '*',
        '@supabase/supabase-js': '^2.106.2',
      },
    }),
  );
  await writeFile(
    join(dir, 'tsconfig.base.json'),
    JSON.stringify({
      compilerOptions: {
        paths: {
          '@icore/db-supabase': ['libs/db-strategies/supabase/src/index.ts'],
          '@icore/db-firestore': ['libs/db-strategies/firestore/src/index.ts'],
          '@icore/db-mongodb': ['libs/db-strategies/mongodb/src/index.ts'],
          '@icore/db-postgres': ['libs/db-strategies/postgres/src/index.ts'],
        },
      },
    }),
  );
  return dir;
}

const exists = (p: string) =>
  access(p)
    .then(() => true)
    .catch(() => false);

describe('writeAiUsageDbProvider', () => {
  it('wires the chosen db module (mongodb), independent of the notes db.provider.ts', async () => {
    const dir = await fixture();
    await writeAiUsageDbProvider(dir, 'mongodb');
    const src = await readFile(
      join(dir, 'apps/microservices/ai-orchestrator/src/app/ai-usage-db.provider.ts'),
      'utf8',
    );
    expect(src).toContain("from '@icore/db-mongodb'");
    expect(src).toContain('MongoDbDbModule.forRoot');
    expect(src).not.toContain('SupabaseDbModule');
  });

  it('falls back to a FakeDBStrategy-backed NullDbModule when dbProvider=none', async () => {
    const dir = await fixture();
    await writeAiUsageDbProvider(dir, 'none');
    const src = await readFile(
      join(dir, 'apps/microservices/ai-orchestrator/src/app/ai-usage-db.provider.ts'),
      'utf8',
    );
    expect(src).toContain('FakeDBStrategy');
    expect(src).toContain("from '@icore/shared'");
    expect(src).not.toContain('SupabaseDbModule');
  });
});

describe('cleanupUnusedAiUsageDb', () => {
  it('removes unchosen db libs and strips ai-orchestrator package.json deps; keeps chosen', async () => {
    const dir = await fixture();
    await cleanupUnusedAiUsageDb(dir, 'postgres');

    expect(await exists(join(dir, 'libs/db-strategies/postgres'))).toBe(true);
    expect(await exists(join(dir, 'libs/db-strategies/supabase'))).toBe(false);
    expect(await exists(join(dir, 'libs/db-strategies/firestore'))).toBe(false);
    expect(await exists(join(dir, 'libs/db-strategies/mongodb'))).toBe(false);

    const pkg = JSON.parse(
      await readFile(join(dir, 'apps/microservices/ai-orchestrator/package.json'), 'utf8'),
    );
    expect(pkg.dependencies['@icore/db-postgres']).toBe('*');
    expect(pkg.dependencies).not.toHaveProperty('@icore/db-supabase');
    expect(pkg.dependencies).not.toHaveProperty('@supabase/supabase-js');
  });
});
