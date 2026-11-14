#!/usr/bin/env node
// Post-generate helper: removes the notes sample feature from a scaffolded project.
// Run from the project root: node tools/remove-notes.mjs  (or: yarn remove-notes)
import { rm, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function nx(args) {
  const result = spawnSync('yarn', ['nx', ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`nx ${args.join(' ')} exited with ${result.status}`);
  }
}

async function tryEdit(path, fn) {
  try {
    const src = await readFile(path, 'utf8');
    const next = fn(src);
    if (next !== src) await writeFile(path, next);
  } catch {
    // file may not exist (optional components)
  }
}

/** Drop `Symbol` (its import line and its entry in an array literal) from a TS module. */
function dropSymbol(src, symbol) {
  return src
    .replace(new RegExp(`^import \\{ ${symbol} \\} from '[^']+';\\n`, 'm'), '')
    .replace(new RegExp(`\\n[ \\t]*${symbol},`), '')
    .replace(new RegExp(`\\b${symbol}, `), '')
    .replace(new RegExp(`, ${symbol}\\b`), '')
    .replace(new RegExp(`\\[${symbol}\\]`), '[]');
}

/**
 * Every file edit of the removal, without the `nx g @nx/workspace:remove` calls (they need an
 * installed workspace). Handles each `--api` mode: rest/both import the REST NotesModule in
 * features.module.ts; graphql/both wire NotesGraphqlModule / NotesResolver in the generated
 * apps/api/src/app/graphql files.
 */
export async function removeNotesFiles(projectRoot) {
  // 1. Delete non-Nx paths (gateway module + GraphQL surface + client UI) that nx g remove doesn't touch
  for (const p of ['apps/api/src/app/notes', 'apps/client/src/components/notes']) {
    await rm(join(projectRoot, p), { recursive: true, force: true });
  }
  for (const p of [
    'apps/client/src/routes/_dashboard/notes.tsx',
    'apps/client/src/queries/notes.ts',
    'apps/client/src/queries/notes.gql-api.ts',
    'apps/client/src/queries/__tests__/notes.gql-api.unit.test.ts',
    'apps/client/src/graphql/notes.queries.ts',
    'apps/client/src/graphql/gql/notes.graphql',
    // Boots the REST NotesModule and the notes GraphQL surface (api=both).
    'apps/api/src/app/graphql/__tests__/graphql.integration.unit.test.ts',
  ]) {
    await rm(join(projectRoot, p), { force: true });
  }

  // 2. Strip NotesModule from the gateway (features.module.ts; older projects: app.module.ts)
  for (const rel of ['apps/api/src/app/features.module.ts', 'apps/api/src/app/app.module.ts']) {
    await tryEdit(join(projectRoot, rel), (src) => dropSymbol(src, 'NotesModule'));
  }

  // 3. Strip the notes GraphQL surface (api=graphql|both)
  await tryEdit(join(projectRoot, 'apps/api/src/app/graphql/api-surfaces.module.ts'), (src) =>
    dropSymbol(src, 'NotesGraphqlModule'),
  );
  await tryEdit(join(projectRoot, 'apps/api/src/app/graphql/api-surface-resolvers.ts'), (src) =>
    dropSymbol(src, 'NotesResolver'),
  );

  // 4. Drop the notes microservice from the gateway's service list
  await tryEdit(join(projectRoot, 'apps/api/src/app/gateway-services.ts'), (src) =>
    src.replace(/^\s*\{ name: 'notes', prefix: 'NOTES' \},\n/m, ''),
  );

  // 5. Strip @icore/notes-client from api/package.json (nx g remove skips workspace deps)
  await tryEdit(join(projectRoot, 'apps/api/package.json'), (src) => {
    const pkg = JSON.parse(src);
    delete pkg?.dependencies?.['@icore/notes-client'];
    delete pkg?.devDependencies?.['@icore/notes-client'];
    return JSON.stringify(pkg, null, 2) + '\n';
  });

  // 6. Strip notes nav from LayoutSider (handles shadcn, antd, mui variants)
  await tryEdit(join(projectRoot, 'apps/client/src/components/layout/LayoutSider.tsx'), (src) =>
    src
      // shadcn: remove StickyNote icon + notes Link block
      .replace(', StickyNote', '')
      .replace(/\n {8}<Link\n {10}to="\/_dashboard\/notes"[\s\S]*?<\/Link>/, '')
      // antd: remove FileTextOutlined + selectedKey notes check + notes items entry
      .replace(', FileTextOutlined', '')
      .replace(
        "const selectedKey = pathname.includes('/notes')\n    ? 'notes'\n    : pathname.includes('/profile')",
        "const selectedKey = pathname.includes('/profile')",
      )
      .replace(
        "\n    {\n      key: 'notes',\n      icon: <FileTextOutlined />,\n      label: <Link to=\"/_dashboard/notes\">{t('notes.title')}</Link>,\n    },",
        '',
      )
      // mui: remove NoteOutlinedIcon import + notes ListItemButton
      .replace("import NoteOutlinedIcon from '@mui/icons-material/NoteOutlined';\n", '')
      .replace(
        /\n {8}<ListItemButton\n {10}component=\{Link\}\n {10}to="\/_dashboard\/notes"[\s\S]*?<\/ListItemButton>/,
        '',
      ),
  );

  // 7. Strip notes block from template-shared i18n keys.ts
  await tryEdit(join(projectRoot, 'libs/template-shared/src/lib/i18n/keys.ts'), (src) =>
    src.replace(/^\s{4}notes: \{\n(?:\s+.*\n)*?\s{4}\},\n/m, ''),
  );
}

async function main() {
  // Remove Nx projects via generator — handles dir deletion + tsconfig.base.json paths
  nx(['g', '@nx/workspace:remove', '--projectName=notes', '--no-interactive']);
  nx(['g', '@nx/workspace:remove', '--projectName=notes-e2e', '--no-interactive']);
  nx(['g', '@nx/workspace:remove', '--projectName=notes-client', '--no-interactive']);

  await removeNotesFiles(root);

  console.log('✓ Notes sample feature removed.');
  console.log('  Run `yarn nx run-many -t build` to verify the build is clean.');
}

// Run only when executed (`node tools/remove-notes.mjs`), not when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
