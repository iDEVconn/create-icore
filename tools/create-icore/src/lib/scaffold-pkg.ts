import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pmRun } from './options.js';
import type { CreateIcoreOptions } from './options.js';

/**
 * Creates pnpm-workspace.yaml for pnpm projects.
 *
 * pnpm 9+ ignores the "workspaces" field in package.json and requires this
 * file to declare workspace packages. It also no longer reads the "pnpm" key
 * from package.json — onlyBuiltDependencies now lives here instead.
 */
export async function writePnpmWorkspace(targetDir: string): Promise<void> {
  const pkgPath = join(targetDir, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as {
    workspaces?: string[];
  };
  const workspaces = pkg.workspaces ?? [];

  const packagesBlock = workspaces.map((p) => `  - '${p}'`).join('\n');
  // Pre-approve build scripts for the toolchain's native/postinstall packages.
  // pnpm 10+ blocks lifecycle scripts by default and fails install in CI
  // (ERR_PNPM_IGNORED_BUILDS). pnpm 11 deprecated the old `onlyBuiltDependencies`
  // allowlist in favour of an `allowBuilds` map (pkg → true|false) — writing it
  // here is the declarative equivalent of running `pnpm approve-builds`, so a
  // fresh `pnpm install` is clean and non-interactive.
  const allowBuilds = [
    '@firebase/util',
    '@nestjs/core',
    '@parcel/watcher',
    '@scarf/scarf',
    '@swc/core',
    'bcrypt',
    'less',
    'mongodb-memory-server',
    'msgpackr-extract',
    'nx',
    'protobufjs',
    'unrs-resolver',
  ]
    .map((p) => `  '${p}': true`)
    .join('\n');
  const content = `packages:\n${packagesBlock}\n\nallowBuilds:\n${allowBuilds}\n`;
  await writeFile(join(targetDir, 'pnpm-workspace.yaml'), content);
}

/**
 * Rewrites all `"@icore/*": "*"` dependency entries to `"@icore/*": "workspace:*"`
 * in every package.json found under the target directory.
 *
 * yarn resolves workspace packages before hitting the registry so bare `"*"`
 * works, but pnpm requires the explicit `workspace:` prefix or it will try to
 * fetch the package from the npm registry and fail with 404.
 */
export async function rewritePnpmWorkspaceDeps(targetDir: string): Promise<void> {
  async function walk(dir: string): Promise<string[]> {
    const found: string[] = [];
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return found;
    }
    for (const e of entries) {
      if (e.isDirectory() && e.name !== 'node_modules') {
        found.push(...(await walk(join(dir, e.name))));
      } else if (e.isFile() && e.name === 'package.json') {
        found.push(join(dir, e.name));
      }
    }
    return found;
  }

  const pkgFiles = await walk(targetDir);
  for (const f of pkgFiles) {
    try {
      const raw = await readFile(f, 'utf8');
      const next = raw.replace(/"(@icore\/[^"]+)":\s*"\*"/g, '"$1": "workspace:*"');
      if (next !== raw) await writeFile(f, next);
    } catch {
      // ignore unreadable files
    }
  }
}

/**
 * Adjusts .gitignore for the chosen package manager:
 * - npm/pnpm: remove the `!.yarn/releases` un-ignore rule (the yarn binary
 *   is already deleted, but the pattern would apply to any .yarn dir the user
 *   might later add). Adds pnpm-specific entries.
 * - npm: adds npm-debug.log pattern if missing.
 */
export async function patchGitignoreForPm(targetDir: string, pm: string): Promise<void> {
  const giPath = join(targetDir, '.gitignore');
  try {
    let src = await readFile(giPath, 'utf8');

    // Strip lines that are icore-internal and make no sense in a generated project.
    src = src.replace(/^# Build artifacts.*\ntools\/create-icore\/templates\/\s*\n/m, '');

    if (pm !== 'yarn') {
      // Drop the yarn-specific un-ignore rules — .yarn/ is fully gone for non-yarn.
      src = src
        .replace(/^\.yarn\/\*\s*\n/m, '')
        .replace(/^!\.yarn\/patches\s*\n/m, '')
        .replace(/^!\.yarn\/plugins\s*\n/m, '')
        .replace(/^!\.yarn\/releases\s*\n/m, '')
        .replace(/^!\.yarn\/sdks\s*\n/m, '')
        .replace(/^!\.yarn\/versions\s*\n/m, '')
        .replace(/^\.pnp\.\*\s*\n/m, '');
    }

    if (pm === 'pnpm') {
      if (!src.includes('.pnpm-debug.log')) {
        src += '\n# pnpm\n.pnpm-debug.log*\n';
      }
    }

    if (pm === 'npm') {
      if (!src.includes('npm-debug.log')) {
        src += '\n# npm\nnpm-debug.log*\n';
      }
    }

    await writeFile(giPath, src);
  } catch {
    // ignore — .gitignore may not exist in test scaffolds
  }
}

/** Writes CLAUDE.md, AGENTS.md, README.md, and .claude/settings.json. */
export async function writeAiFiles(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  const pm = opts.packageManager;
  const nx = pm === 'npm' ? 'npx nx' : `${pm} nx`;
  const devCmd = pmRun(pm, 'dev');

  const activeMSes = ['auth (port 4001)'];
  if (opts.upload !== 'none') activeMSes.push(`upload (port 4002)`);
  if (opts.payment !== 'none') activeMSes.push(`payment (port 4003)`);
  if (opts.example !== 'none') activeMSes.push(`notes (port 4004)`);
  if (opts.jobs !== 'none') activeMSes.push(`jobs (standalone)`);

  const usesSupabase =
    opts.authProvider === 'supabase' ||
    opts.dbProvider === 'supabase' ||
    opts.upload === 'supabase';
  const usesFirebase =
    opts.authProvider === 'firebase' ||
    opts.dbProvider === 'firebase' ||
    opts.upload === 'firebase';

  // ── CLAUDE.md ──────────────────────────────────────────────────────────────
  await writeFile(join(targetDir, 'CLAUDE.md'), '@AGENTS.md\n');

  // ── README.md ──────────────────────────────────────────────────────────────
  const uiLabel = { shadcn: 'shadcn/ui + Tailwind', antd: 'Ant Design 6', mui: 'MUI 6' }[opts.ui];
  const readme = `# ${opts.projectName}

> Scaffolded with [iCore](https://github.com/iDEVconn/create-icore) — Nx + NestJS + React full-stack template.

## Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Nx + ${pm} |
| Gateway | NestJS 11 + Swagger |
| Auth | ${opts.authProvider} |
| Database | ${opts.dbProvider} |
| Upload | ${opts.upload === 'none' ? '—' : opts.upload} |
| UI | ${uiLabel} + TanStack Router + Query |
| i18n | i18next (en / ru / he) |

## Quick start

\`\`\`bash
# 1. Fill in provider credentials
#    apps/microservices/auth/.env
#    apps/microservices/upload/.env  (if upload is enabled)
#    apps/client/.env               (VITE_API_URL — already defaults to /api)

# 2. Start everything
${devCmd}
# → http://localhost:4200        client
# → http://localhost:3001/api/docs  Swagger
\`\`\`

## Commands

\`\`\`bash
${nx} run <project>:serve   # start a single service
${nx} test <project>         # unit tests
${nx} lint <project>         # lint
${nx} build <project>        # production build
${pm === 'yarn' ? 'yarn remove-notes' : pm === 'pnpm' ? 'pnpm remove-notes' : 'npm run remove-notes'}                  # strip the notes sample feature
\`\`\`

## Scaffolded by

[iCore](https://github.com/iDEVconn/create-icore) — [@idevconn/create-icore](https://www.npmjs.com/package/@idevconn/create-icore)

## License

Apache-2.0
`;
  await writeFile(join(targetDir, 'README.md'), readme);

  // ── AGENTS.md ──────────────────────────────────────────────────────────────
  const agents = `# ${opts.projectName} — Agent Instructions

## Stack snapshot

| Dimension  | Choice |
|------------|--------|
| Auth       | ${opts.authProvider} |
| Database   | ${opts.dbProvider} |
| Upload     | ${opts.upload} |
| Payment    | ${opts.payment} |
| Jobs       | ${opts.jobs} |
| UI         | ${opts.ui} |
| Transport  | ${opts.transport} |
| PM         | ${pm} |

## 🚀 Mandatory Workflow

- **Branch strategy**: \`dev\` is default. Cut \`feature/<name>\` or \`bug/<name>\` from dev. PRs only target dev. Never push directly to main.
- **No code without approval**: Propose changes first, wait for go-ahead.
- **RULE — no crash on missing .env**: MS factories must catch config errors, print a boxed banner with ALL missing vars, and return a Fake strategy in dev. In prod (\`NODE_ENV=production\`) throw the same banner. The \`formatEnvBanner\` + \`missingEnv\` helpers from \`@icore/shared\` handle this.
- **Post-coding routine**: \`npx prettier --write <files>\` → \`${nx} lint <project>\` → \`${nx} build <project>\` — all green before committing.
- **Nx generators only**: never hand-write \`project.json\` / tsconfig stacks. Use \`${nx} g @nx/<plugin>:<schematic>\`.

## Architecture

\`\`\`
apps/
├── api/               NestJS gateway — all client traffic enters here (:3001)
├── microservices/
${activeMSes.map((s) => `│   ├── ${s.split(' ')[0]}/`).join('\n')}
└── client/            Vite + React 19 + ${opts.ui} (:4200)
libs/
├── shared/            contracts, CASL, transport helpers, env banner utils
├── auth-strategies/${opts.authProvider}/
${opts.upload !== 'none' ? `├── storage-strategies/${opts.upload}/\n` : ''}├── db-strategies/${opts.dbProvider === 'firebase' ? 'firestore' : opts.dbProvider}/
├── auth-client/       gateway → auth MS (TCP/Redis/NATS)
${opts.upload !== 'none' ? `├── upload-client/     gateway → upload MS\n` : ''}└── template-shared/   browser-safe React foundation (stores, i18n, CASL)
\`\`\`

## Key patterns

**Strategy swap** — provider is chosen at runtime via env. Never import a concrete strategy in app code; always inject via the factory token (\`AuthStrategy\`, \`StorageStrategy\`, \`DBStrategy\`).

**Transport** — \`buildTransport(prefix)\` reads \`${opts.transport.toUpperCase()}*\` vars. Same helper on gateway client-modules and each MS \`main.ts\`. Supports tcp / redis / nats — change by flipping \`*_TRANSPORT\` in \`.env\`.

**Env layering**:
1. Root \`.env\` — \`DB_PROVIDER\`
2. \`apps/api/.env\` — gateway transport endpoints
3. \`apps/microservices/<name>/.env\` — each MS provider + transport
4. \`apps/client/.env\` — \`VITE_API_URL\`

## Commands

\`\`\`bash
${devCmd}                     # start all services
${nx} run api:serve           # gateway only
${nx} run auth:serve          # auth MS only
${nx} test <project>          # run tests
${nx} lint <project>          # lint
${nx} build <project>         # build
${nx} g @nx/nest:resource     # generate NestJS resource
\`\`\`

## .env files to configure

| File | Key vars |
|------|----------|
| \`apps/microservices/auth/.env\` | \`AUTH_PROVIDER=${opts.authProvider}\`, ${opts.authProvider === 'supabase' ? '`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`' : '`FB_ADMIN_*`, `FIREBASE_WEB_API_KEY`'} |
${opts.upload !== 'none' ? `| \`apps/microservices/upload/.env\` | \`STORAGE_PROVIDER=${opts.upload}\`, provider creds |\n` : ''}| \`apps/microservices/notes/.env\` | \`DB_PROVIDER=${opts.dbProvider}\`, DB creds |
| \`apps/client/.env\` | \`VITE_API_URL=/api\` (proxied to :3001 in dev) |

## Testing

- Unit tests: Vitest, files named \`*.unit.test.ts(x)\` in \`__tests__/\` next to source.
- Test behaviour, not implementation. Fake strategies from \`@icore/shared\` (FakeAuthStrategy etc.) serve as test doubles.
- Run: \`${nx} test <project>\`
`;

  await writeFile(join(targetDir, 'AGENTS.md'), agents);

  // ── .claude/settings.json ─────────────────────────────────────────────────
  await mkdir(join(targetDir, '.claude'), { recursive: true });

  const mcpServers: Record<string, unknown> = {
    nx: {
      command: 'npx',
      args: ['-y', '@nx/mcp@latest', '--directory', '.'],
      type: 'stdio',
    },
  };

  if (usesSupabase) {
    mcpServers['supabase'] = {
      command: 'npx',
      args: [
        '-y',
        '@supabase/mcp-server-supabase@latest',
        '--access-token',
        '<SUPABASE_PERSONAL_ACCESS_TOKEN>',
      ],
      type: 'stdio',
    };
  }

  if (usesFirebase) {
    mcpServers['firebase'] = {
      command: 'npx',
      args: ['-y', 'firebase-tools@latest', 'experimental:mcp'],
      type: 'stdio',
    };
  }

  const nxCmds = [`Bash(${nx} *)`, `Bash(${devCmd})`];
  if (pm !== 'npm') nxCmds.push(`Bash(npx nx *)`);

  const settings = {
    mcpServers,
    permissions: {
      allow: [
        ...nxCmds,
        'Bash(npx prettier *)',
        'Bash(git status)',
        'Bash(git diff *)',
        'Bash(git log *)',
      ],
    },
  };

  await writeFile(
    join(targetDir, '.claude', 'settings.json'),
    JSON.stringify(settings, null, 2) + '\n',
  );
}
