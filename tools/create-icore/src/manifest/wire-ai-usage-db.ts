import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { DbProvider } from '../lib/options.js';
import { MANIFEST } from './index.js';
import type { Unit } from './types.js';
import { writeProvider, cleanupUnusedAxis, type AxisWiring } from './wire-provider.js';

const AI_USAGE_DB: AxisWiring = {
  section: MANIFEST.db as Record<string, Unit>,
  providerFile: 'apps/microservices/ai-orchestrator/src/app/ai-usage-db.provider.ts',
  exportConst: 'AiUsageDbProviderModule',
  msPackageJson: 'apps/microservices/ai-orchestrator/package.json',
  envPath: 'apps/microservices/ai-orchestrator/.env',
};

const NULL_DB_PROVIDER_CONTENT = `import { Module } from '@nestjs/common';
import { FakeDBStrategy } from '@icore/shared';

// No DB_PROVIDER chosen for this project — AI usage tracking falls back to
// an in-memory store (lost on restart, never crashes). Pick a DB provider to
// persist usage across restarts.
@Module({
  providers: [{ provide: 'DBStrategy', useClass: FakeDBStrategy }],
  exports: ['DBStrategy'],
})
class NullDbModule {}

export const AiUsageDbProviderModule = NullDbModule;
`;

/**
 * ai-orchestrator's DBStrategy wiring for AI usage tracking is independent
 * of the notes demo's `db.provider.ts` (`wire-db.ts`) — the `ai` feature can
 * be chosen with `example=none`, so this needs its own provider file gated
 * only on `ai !== 'none'`. Always written (even for `dbProvider=none`, via a
 * `FakeDBStrategy`-backed `NullDbModule`) so ai-orchestrator's app.module.ts
 * can unconditionally import it — mirrors RAG's independence from
 * `dbProvider` for the same reason (AGENTS.md).
 */
export async function writeAiUsageDbProvider(
  targetDir: string,
  provider: DbProvider,
): Promise<void> {
  if (provider === 'none') {
    await writeFile(join(targetDir, AI_USAGE_DB.providerFile), NULL_DB_PROVIDER_CONTENT);
    return;
  }
  await writeProvider(targetDir, AI_USAGE_DB, provider);
}

export const cleanupUnusedAiUsageDb = (targetDir: string, chosen: DbProvider): Promise<void> =>
  cleanupUnusedAxis(targetDir, AI_USAGE_DB, chosen);
