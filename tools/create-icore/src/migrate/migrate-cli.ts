import * as p from '@clack/prompts';
import kleur from 'kleur';
import semver from 'semver';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { computePlan } from './plan.js';
import { runMigrate } from './run.js';
import { createMigrateDeps, resolvePackageRoot } from './migrate-deps.js';
import type { RegistryEntry, RegistryFile } from '../migrations/build-registry.js';
import type { BlueprintJson } from '../manifest/blueprint.js';

function parseMigrateFlags(argv: string[]): { to?: string } {
  const flags: { to?: string } = {};
  for (const arg of argv) {
    if (arg.startsWith('--to=')) flags.to = arg.slice('--to='.length);
    // --continue is a documented no-op: re-running this command always
    // resumes correctly on its own (progress is derived from git history,
    // never stored) — kept as a recognized flag purely for expectation
    // parity with `nx migrate`'s own --continue.
  }
  return flags;
}

function highestVersion(registry: RegistryFile): string {
  return registry.entries.reduce(
    (max, e) => (semver.gt(e.version, max) ? e.version : max),
    '0.0.0',
  );
}

async function loadRegistry(packageRoot?: string): Promise<RegistryFile> {
  const root = packageRoot ?? resolvePackageRoot();
  const raw = await readFile(join(root, 'migrations', 'registry.json'), 'utf8');
  return JSON.parse(raw) as RegistryFile;
}

function printAiPromptInstructions(entry: RegistryEntry): void {
  p.log.info(`Paused at migration "${entry.id}":`);
  p.log.info(entry.description);
  if (entry.diff) p.log.info(entry.diff);
  p.log.info('Apply this change to your project, adapting to any local customization.');
  p.log.info(`When done, commit your work with a message containing exactly: migrate: ${entry.id}`);
  p.log.info('Then re-run this same command to continue.');
}

export async function runMigrateCli(
  argv: string[],
  projectDir: string = process.cwd(),
  packageRoot?: string,
): Promise<void> {
  const flags = parseMigrateFlags(argv);

  let blueprint: BlueprintJson;
  try {
    blueprint = JSON.parse(
      await readFile(join(projectDir, 'blueprint.json'), 'utf8'),
    ) as BlueprintJson;
  } catch {
    throw new Error(
      `No blueprint.json found in ${projectDir} — is this a create-icore-scaffolded project?`,
    );
  }

  const registry = await loadRegistry(packageRoot);
  const currentVersion = blueprint.generatorVersion ?? '0.0.0';
  const targetVersion =
    flags.to === undefined || flags.to === 'latest' ? highestVersion(registry) : flags.to;

  const projectAxes: Record<string, string> = {
    authProvider: blueprint.authProvider,
    dbProvider: blueprint.dbProvider,
    upload: blueprint.upload,
    payment: blueprint.payment,
    jobs: blueprint.jobs,
    example: blueprint.example,
    ui: blueprint.ui,
    transport: blueprint.transport,
  };

  const plan = computePlan(registry, currentVersion, targetVersion, projectAxes);
  const deps = createMigrateDeps({ packageRoot });
  const result = await runMigrate(projectDir, plan, targetVersion, deps, printAiPromptInstructions);

  if (result === 'up-to-date') p.outro(kleur.green('Already up to date.'));
  else if (result === 'paused') p.outro(kleur.yellow('Paused — see instructions above.'));
  else p.outro(kleur.green(`Migrated to ${targetVersion}.`));
}
