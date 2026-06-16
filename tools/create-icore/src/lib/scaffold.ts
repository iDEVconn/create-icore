import { copyFile, mkdir, readdir, readFile, rmdir, stat, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { CreateIcoreOptions, AuthBackend } from './options.js';
import {
  rewriteRootPackageJson,
  pruneRootProviderDeps,
  writeAuthEnv,
  writeUploadEnv,
  writeNotesEnv,
  writeGatewayEnv,
  writeRootEnv,
  writeClientEnv,
  writePaymentEnv,
} from './scaffold-env.js';
import {
  removeFirebaseAdminLib,
  removeStrategiesLib,
  removeUploadStack,
} from './scaffold-strip.js';
import {
  applyAuthNoneVariants,
  removeAuthOnlyPaths,
  removeAuthTsconfigPaths,
  removeDockerComposeAuthService,
} from './scaffold-auth-none.js';
import { cleanupUnusedFeatures, writeFeaturesWiring } from '../manifest/wire-features.js';
import { writeNavConfig } from '../manifest/wire-client.js';
import { writeBlueprintJson, writeServiceBlueprints } from '../manifest/blueprint.js';
import { cleanupUnusedAuth, writeAuthProvider } from '../manifest/wire-auth.js';
import { cleanupUnusedStorage, writeStorageProvider } from '../manifest/wire-storage.js';
import { cleanupUnusedDb, writeDbProvider } from '../manifest/wire-db.js';
import {
  writePnpmWorkspace,
  rewritePnpmWorkspaceDeps,
  patchGitignoreForPm,
  writeAiFiles,
} from './scaffold-pkg.js';

// Re-export everything so existing imports from './scaffold.js' keep working.
export {
  rewriteRootPackageJson,
  pruneRootProviderDeps,
  writeAuthEnv,
  writeUploadEnv,
  writeNotesEnv,
  writeGatewayEnv,
  writeRootEnv,
  writeClientEnv,
  writePaymentEnv,
  applyAuthNoneVariants,
  removeAuthOnlyPaths,
  removeAuthTsconfigPaths,
  removeDockerComposeAuthService,
  removeFirebaseAdminLib,
  removeStrategiesLib,
  removeUploadStack,
  writePnpmWorkspace,
  rewritePnpmWorkspaceDeps,
  patchGitignoreForPm,
  writeAiFiles,
};

const IGNORE_TOP = new Set([
  '.git',
  'node_modules',
  '.yarn/cache',
  '.yarn/unplugged',
  '.yarn/install-state.gz',
  '.nx',
  'dist',
  'tmp',
  'coverage',
  '.idea',
  '.vscode',
]);

export async function copyTree(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_TOP.has(entry.name)) continue;
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) await copyTree(s, d);
    else if (entry.isFile()) await copyFile(s, d);
    // symlinks skipped intentionally
  }
}

export async function selectClientTemplate(
  targetDir: string,
  opts: CreateIcoreOptions,
): Promise<void> {
  // Drop the templates dir altogether and move the chosen template into apps/client.
  const templatesRoot = join(targetDir, 'apps/templates');
  const chosen = join(templatesRoot, `client-${opts.ui}`);
  const destClient = join(targetDir, 'apps/client');
  let chosenUi = opts.ui;
  try {
    const s = await stat(chosen);
    if (!s.isDirectory()) throw new Error('not a dir');
    await copyTree(chosen, destClient);
  } catch {
    chosenUi = 'shadcn';
    await copyTree(join(templatesRoot, 'client-shadcn'), destClient);
  }
  await rm(templatesRoot, { recursive: true, force: true });
  await rewriteClientPaths(destClient, chosenUi);
}

async function rewriteClientPaths(clientDir: string, ui: string): Promise<void> {
  // Templates lived under `apps/templates/client-<ui>/` — 3 levels deep.
  // Scaffolded into `apps/client/` — 2 levels deep. Every `../../../` path
  // anchored at the repo root needs to lose one segment, and the original
  // `client-<ui>` folder name baked into cacheDir/outDir strings becomes
  // plain `client`.
  const candidates = [
    'vite.config.mts',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.spec.json',
    'project.json',
    'eslint.config.mjs',
  ];
  for (const rel of candidates) {
    const path = join(clientDir, rel);
    try {
      const raw = await readFile(path, 'utf8');
      const next = raw
        .replaceAll('../../../', '../../')
        .replaceAll(`apps/templates/client-${ui}`, 'apps/client')
        .replaceAll(`client-${ui}`, 'client');
      if (next !== raw) await writeFile(path, next);
    } catch {
      // file may not exist in this template variant
    }
  }
}

function gitInit(cwd: string, projectName: string): void {
  spawnSync('git', ['init'], { cwd, stdio: 'inherit' });
  spawnSync('git', ['add', '.'], { cwd, stdio: 'inherit' });
  spawnSync(
    'git',
    ['commit', '-m', `chore: bootstrap ${projectName} from @idevconn/create-icore`],
    { cwd, stdio: 'inherit' },
  );
}

function resolveYarnBin(cwd: string): string {
  // Read yarnPath from .yarnrc.yml so upgrading yarn version only requires
  // updating the template files — no hardcoded version string here.
  try {
    const yarnrc = readFileSync(join(cwd, '.yarnrc.yml'), 'utf8');
    const match = yarnrc.match(/^yarnPath:\s*(.+)$/m);
    if (match?.[1]) return join(cwd, match[1].trim());
  } catch {
    // ignore — fallback below
  }
  return join(cwd, '.yarn', 'releases', 'yarn-4.5.0.cjs');
}

function runInstall(cwd: string, pm: string): void {
  if (pm === 'yarn') {
    // Run the pinned yarn binary directly via node to avoid corepack PnP
    // resolution failures when the CLI is invoked from `yarn create` (dlx),
    // which runs inside a PnP context where corepack cannot resolve itself.
    spawnSync('node', [resolveYarnBin(cwd), 'install'], { cwd, stdio: 'inherit' });
  } else if (pm === 'npm') {
    spawnSync('npm', ['install'], { cwd, stdio: 'inherit' });
  } else {
    spawnSync('pnpm', ['install'], { cwd, stdio: 'inherit' });
  }
}

export async function scaffold(rawOpts: CreateIcoreOptions, templatesDir: string): Promise<void> {
  // Mirror the collectOptions cascade: notes requires auth, CASL, and abilities.
  // Silently downgrade example to none when auth is disabled so the scaffold is
  // safe to call directly (e.g. smoke scripts, tests) without going through
  // collectOptions first.
  const opts: CreateIcoreOptions =
    rawOpts.authProvider === 'none' && rawOpts.example !== 'none'
      ? { ...rawOpts, example: 'none' }
      : rawOpts;

  await copyTree(templatesDir, opts.targetDir);
  await rewriteRootPackageJson(opts.targetDir, opts);
  if (opts.authProvider !== 'none') await writeAuthEnv(opts.targetDir, opts);
  await writeUploadEnv(opts.targetDir, opts);
  await writeNotesEnv(opts.targetDir, opts);
  await writePaymentEnv(opts.targetDir, opts);
  await writeGatewayEnv(opts.targetDir, opts);
  await writeRootEnv(opts.targetDir, opts);
  await selectClientTemplate(opts.targetDir, opts);
  await writeClientEnv(opts.targetDir);
  if (opts.upload === 'none') await removeUploadStack(opts.targetDir);
  await cleanupUnusedFeatures(opts.targetDir, opts);
  await writeFeaturesWiring(opts.targetDir, opts);
  await writeNavConfig(opts.targetDir, opts);
  if (opts.authProvider !== 'none') {
    await cleanupUnusedAuth(opts.targetDir, opts.authProvider as AuthBackend);
    await writeAuthProvider(opts.targetDir, opts.authProvider as AuthBackend);
  } else {
    // Blueprint-driven auth=none: delete auth-only paths, overlay auth-none
    // file variants, strip tsconfig aliases, remove docker-compose auth service.
    // No regex source surgery — new files default to excluded, not included.
    await removeAuthOnlyPaths(opts.targetDir);
    await applyAuthNoneVariants(opts.targetDir, opts.ui);
    await removeAuthTsconfigPaths(opts.targetDir);
    await removeDockerComposeAuthService(opts.targetDir);
  }
  if (opts.upload !== 'none') {
    await cleanupUnusedStorage(opts.targetDir, opts.upload);
    await writeStorageProvider(opts.targetDir, opts.upload);
  }
  // The shared firebase-admin init lib is only needed when SOME microservice
  // uses Firebase. If no provider is Firebase, drop the lib + its alias.
  // Must run BEFORE cleanupUnusedDb to avoid the regex-stripped tsconfig
  // having a trailing comma that breaks the JSON.parse inside stripTsconfigKeys.
  const firebaseUsed =
    opts.authProvider === 'firebase' ||
    opts.dbProvider === 'firebase' ||
    opts.upload === 'firebase';
  if (!firebaseUsed) await removeFirebaseAdminLib(opts.targetDir);
  // Clean up unused db strategies unconditionally — even when example=none,
  // we still want to remove libs for DB backends that weren't chosen.
  await cleanupUnusedDb(opts.targetDir, opts.dbProvider);
  if (opts.dbProvider !== 'none' && opts.example !== 'none') {
    await writeDbProvider(opts.targetDir, opts.dbProvider);
  }
  // Prune the raw SDK of any UNCHOSEN provider from the root package.json so the
  // generated project audits clean (root keeps only chosen providers' SDKs).
  await pruneRootProviderDeps(opts.targetDir, opts);

  // When no provider is selected at all, the strategy interfaces + testing
  // harness in libs/shared are dead code — remove them.
  if (opts.authProvider === 'none' && opts.upload === 'none' && opts.dbProvider === 'none') {
    await removeStrategiesLib(opts.targetDir);
  }

  // Remove apps/microservices/ if all MS were pruned (rmdir is a no-op when not empty).
  try {
    await rmdir(join(opts.targetDir, 'apps/microservices'));
  } catch {
    // ignore — not empty or doesn't exist
  }

  await writeBlueprintJson(opts.targetDir, opts);
  await writeServiceBlueprints(opts.targetDir, opts);
  // Anchor yarn 4 to this directory. Without an empty yarn.lock yarn walks up
  // through parent directories and may pick up a stray package.json/yarn.lock
  // (e.g. in the user's $HOME), causing
  //   "The nearest package directory doesn't seem to be part of the project"
  // on first `yarn install`.
  // Empty yarn.lock anchors yarn 4 to this directory (prevents walking up to parent workspaces).
  // Only needed when using yarn; for npm/pnpm it's harmless but we skip it to keep the
  // generated project tidy.
  if (opts.packageManager === 'yarn') {
    await writeFile(join(opts.targetDir, 'yarn.lock'), '');
  } else {
    // npm/pnpm don't need the pinned yarn binary or .yarnrc.yml.
    await rm(join(opts.targetDir, '.yarn'), { recursive: true, force: true });
    await rm(join(opts.targetDir, '.yarnrc.yml'), { force: true });
  }
  if (opts.packageManager === 'pnpm') {
    await writePnpmWorkspace(opts.targetDir);
    await rewritePnpmWorkspaceDeps(opts.targetDir);
  }
  await patchGitignoreForPm(opts.targetDir, opts.packageManager);
  await writeAiFiles(opts.targetDir, opts);
  if (opts.install) runInstall(opts.targetDir, opts.packageManager);
  if (opts.initGit) gitInit(opts.targetDir, opts.projectName);
}
