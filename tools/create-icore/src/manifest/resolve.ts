import { hostOf, validateOptions, type CreateIcoreOptions } from '../lib/options.js';
import type { Unit } from './types.js';
import { MANIFEST } from './index.js';

const EMPTY: Unit = { libDirs: [], deps: {}, tsPaths: {} };

const AUTH_NONE_EXCLUDED_PATHS = [
  'apps/microservices/auth',
  'libs/auth-strategies',
  'libs/auth-client',
  'Dockerfile.ms-auth',
  'apps/api/src/app/auth',
  'apps/api/src/app/profile',
  'apps/api/src/app/abilities',
  // Exercises AuthController, which does not exist without auth.
  'apps/api/src/app/http/__tests__/csrf.guard.unit.test.ts',
  'libs/shared/src/abilities',
  'apps/client/src/components/auth',
  'apps/client/src/components/AccessDeniedPage.tsx',
  'apps/client/src/routes/login.tsx',
  'apps/client/src/routes/auth.callback.tsx',
  'apps/client/src/routes/auth.oauth.callback.tsx',
  'apps/client/src/routes/_dashboard/profile.tsx',
  'libs/template-shared/src/lib/abilities',
];

/** Node-only deployment artifacts: a Worker project has no containers, compose file or nginx. */
const CLOUDFLARE_EXCLUDED_PATHS = [
  'Dockerfile.gateway',
  'Dockerfile.ms-auth',
  'Dockerfile.ms-upload',
  'Dockerfile.ms-jobs',
  'Dockerfile.ms-ai',
  'Dockerfile.client',
  'nginx.client.conf',
  'docker-compose.yml',
  '.env.docker.example',
  '.dockerignore',
];

const UPLOAD_NONE_EXCLUDED_PATHS = [
  'apps/microservices/upload',
  'apps/microservices/upload-e2e',
  'libs/storage-strategies',
  'libs/upload-client',
  'apps/api/src/app/storage',
  'Dockerfile.ms-upload',
];

export interface BindingDiagnostic {
  /** Options after cross-axis constraint normalization (e.g. auth=none -> example=none). */
  options: CreateIcoreOptions;
  /** Diagnostic warnings emitted during constraint validation. */
  warnings: string[];
  /** Units active for this generation. */
  activeUnits: Unit[];
  /** Units inactive for this generation. */
  inactiveUnits: Unit[];
  /** Active utility scripts under `tools/` required by active units. */
  activeToolFiles: ReadonlySet<string>;
  /** Guard predicate: true iff at least one active unit requires a script in `tools/`. */
  emitToolsDir: boolean;
  /** Template-relative paths to exclude prior to disk write in `copyTree`. */
  excludedPaths: ReadonlySet<string>;
}

/** Map the user's choices to the concrete set of units to add. Additive only. */
export function resolveUnits(opts: CreateIcoreOptions): Unit[] {
  const units: Unit[] = [
    opts.authProvider === 'none' ? EMPTY : MANIFEST.auth[opts.authProvider],
    opts.dbProvider === 'none' ? EMPTY : MANIFEST.db[opts.dbProvider],
    MANIFEST.ui[opts.ui],
    MANIFEST.transport[opts.transport],
  ];
  if (hostOf(opts) === 'cloudflare') units.push(MANIFEST.host.cloudflare);
  if (opts.upload !== 'none') units.push(MANIFEST.storage[opts.upload]);
  if (opts.payment !== 'none') units.push(MANIFEST.feature.payment);
  if (opts.jobs !== 'none') units.push(MANIFEST.feature.jobs);
  if (opts.ai !== 'none') units.push(MANIFEST.feature.ai);
  if (opts.example === 'notes') units.push(MANIFEST.feature.notes);

  const firebaseUsed =
    opts.authProvider === 'firebase' ||
    opts.dbProvider === 'firebase' ||
    opts.upload === 'firebase';
  if (firebaseUsed) units.push(MANIFEST.shared.firebaseAdmin);

  return units;
}

/**
 * Pre-emission binding diagnostic: validates cross-axis option constraints and
 * resolves active/inactive template nodes before any filesystem writes occur.
 *
 * Also computes the exact `excludedPaths` set and `emitToolsDir` predicate so
 * `copyTree()` skips disabled feature directories, unchosen provider strategies,
 * and the `tools/` directory when no active unit requires a tool script.
 */
export function resolveBindings(rawOpts: CreateIcoreOptions): BindingDiagnostic {
  const { warnings, errors, corrected: opts } = validateOptions(rawOpts);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  const activeUnits = resolveUnits(opts);
  const activeSet = new Set<Unit>(activeUnits);

  const allCandidateUnits: Unit[] = [
    ...Object.values(MANIFEST.auth),
    ...Object.values(MANIFEST.storage),
    ...Object.values(MANIFEST.db),
    ...Object.values(MANIFEST.feature),
    MANIFEST.host.cloudflare,
    MANIFEST.shared.firebaseAdmin,
  ];
  const inactiveUnits = allCandidateUnits.filter((u) => !activeSet.has(u));

  // Collect paths owned by active units so shared paths are never excluded.
  const activeLibDirs = new Set<string>(activeUnits.flatMap((u) => u.libDirs));
  const activeToolFiles = new Set<string>(activeUnits.flatMap((u) => u.toolFiles ?? []));

  // CLI package internals under tools/create-icore must never be emitted into generated projects.
  const excludedPaths = new Set<string>(['tools/create-icore']);

  const addExcludedPath = (p: string): void => {
    excludedPaths.add(p);
    // Client files live under apps/templates/client-<ui>/ in the snapshot before
    // selectClientTemplate promotes the chosen template into apps/client/.
    if (p.startsWith('apps/client/')) {
      const suffix = p.slice('apps/client/'.length);
      for (const ui of ['shadcn', 'antd', 'mui'] as const) {
        excludedPaths.add(`apps/templates/client-${ui}/${suffix}`);
      }
    }
  };

  for (const unit of inactiveUnits) {
    for (const dir of unit.libDirs) {
      // libs/db-strategies is listed on MANIFEST.feature.notes, but individual DB
      // strategy libs are still needed when dbProvider !== 'none' (e.g. for AI usage DB).
      if (dir === 'libs/db-strategies' && opts.dbProvider !== 'none') continue;
      if (!activeLibDirs.has(dir)) {
        addExcludedPath(dir);
      }
    }
    for (const testFile of unit.appTests ?? []) {
      addExcludedPath(testFile);
    }
    for (const toolFile of unit.toolFiles ?? []) {
      if (!activeToolFiles.has(toolFile)) {
        excludedPaths.add(toolFile);
      }
    }
  }

  if (opts.authProvider === 'none') {
    for (const p of AUTH_NONE_EXCLUDED_PATHS) {
      addExcludedPath(p);
    }
  }

  if (hostOf(opts) === 'cloudflare') {
    for (const p of CLOUDFLARE_EXCLUDED_PATHS) excludedPaths.add(p);
  }

  if (opts.upload === 'none') {
    for (const p of UPLOAD_NONE_EXCLUDED_PATHS) {
      addExcludedPath(p);
    }
  }

  // Strict guard for tools/: omit the entire directory when no active unit requires a tool script.
  const emitToolsDir = activeToolFiles.size > 0;
  if (!emitToolsDir) {
    excludedPaths.add('tools');
  }

  return {
    options: opts,
    warnings,
    activeUnits,
    inactiveUnits,
    activeToolFiles,
    emitToolsDir,
    excludedPaths,
  };
}
