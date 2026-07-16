import type { RegistryEntry } from '../migrations/build-registry.js';

export interface CodemodDeps {
  loadCodemod(id: string): Promise<(projectDir: string) => void | Promise<void>>;
  isApplied(id: string, projectDir: string): Promise<boolean>;
  commit(projectDir: string, message: string): Promise<void>;
  isTreeClean(projectDir: string): Promise<boolean>;
  bumpGeneratorVersion(projectDir: string, targetVersion: string): Promise<void>;
}

export type MigrateResult = 'completed' | 'paused' | 'up-to-date';

/**
 * Walks `plan` in order: skips entries `deps.isApplied` already reports true
 * for, auto-applies+commits `codemod` entries and keeps chaining, and stops
 * (returns 'paused') at the first `ai-prompt` entry without touching any
 * entry after it. On a fully-applied plan, bumps generatorVersion and
 * returns 'completed'. All side effects flow through `deps` — this function
 * itself does no git/fs I/O.
 */
export async function runMigrate(
  projectDir: string,
  plan: RegistryEntry[],
  targetVersion: string,
  deps: CodemodDeps,
  onAiPrompt: (entry: RegistryEntry) => void,
): Promise<MigrateResult> {
  if (plan.length === 0) return 'up-to-date';

  if (!(await deps.isTreeClean(projectDir))) {
    throw new Error(
      'Working tree is not clean. Commit or stash your changes before running migrate.',
    );
  }

  for (const entry of plan) {
    if (await deps.isApplied(entry.id, projectDir)) continue;

    if (entry.kind === 'ai-prompt') {
      onAiPrompt(entry);
      return 'paused';
    }

    const fn = await deps.loadCodemod(entry.id);
    await fn(projectDir);
    await deps.commit(projectDir, `migrate: ${entry.id}`);
  }

  await deps.bumpGeneratorVersion(projectDir, targetVersion);
  return 'completed';
}
