#!/usr/bin/env node
// Post-generate helper: removes the notes sample feature from a scaffolded project.
// Run from the project root: node tools/remove-notes.mjs  (or: yarn remove-notes)
import { rm, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function main() {
  // 1. Remove Nx projects via generator — handles dir deletion + tsconfig.base.json paths
  nx(['g', '@nx/workspace:remove', '--projectName=notes', '--no-interactive']);
  nx(['g', '@nx/workspace:remove', '--projectName=notes-client', '--no-interactive']);

  // 2. Delete non-Nx paths (gateway module + client UI) that nx g remove doesn't touch
  for (const p of ['apps/api/src/app/notes', 'apps/client/src/components/notes']) {
    await rm(join(root, p), { recursive: true, force: true });
  }
  for (const p of [
    'apps/client/src/routes/_dashboard/notes.tsx',
    'apps/client/src/queries/notes.ts',
  ]) {
    await rm(join(root, p), { force: true });
  }

  // 3. Strip NotesModule from gateway app.module.ts
  await tryEdit(join(root, 'apps/api/src/app/app.module.ts'), (src) =>
    src
      .replace(/^import \{ NotesModule \} from '\.\/notes\/notes\.module';\n/m, '')
      .replace(/,\s*NotesModule/g, ''),
  );

  // 4. Strip @icore/notes-client from api/package.json (nx g remove skips workspace deps)
  await tryEdit(join(root, 'apps/api/package.json'), (src) => {
    const pkg = JSON.parse(src);
    delete pkg?.dependencies?.['@icore/notes-client'];
    delete pkg?.devDependencies?.['@icore/notes-client'];
    return JSON.stringify(pkg, null, 2) + '\n';
  });

  // 5. Strip notes nav from LayoutSider (handles shadcn, antd, mui variants)
  await tryEdit(join(root, 'apps/client/src/components/layout/LayoutSider.tsx'), (src) =>
    src
      // shadcn: remove StickyNote icon + notes Link block
      .replace(', StickyNote', '')
      .replace(
        /\n {8}<Link\n {10}to="\/_dashboard\/notes"[\s\S]*?<\/Link>/,
        '',
      )
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

  // 6. Strip notes block from template-shared i18n keys.ts
  await tryEdit(join(root, 'libs/template-shared/src/lib/i18n/keys.ts'), (src) =>
    src.replace(/^\s{4}notes: \{\n(?:\s+.*\n)*?\s{4}\},\n/m, ''),
  );

  console.log('✓ Notes sample feature removed.');
  console.log('  Run `yarn nx run-many -t build` to verify the build is clean.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
