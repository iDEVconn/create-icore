#!/usr/bin/env node
// Usage: node tools/create-icore/scripts/check-route-integrity.mjs
//
// Guards apps/templates/client-*/src/routes against the TanStack Router
// generator silently masking corruption: @tanstack/router-generator (via the
// tanstackRouter() Vite plugin) rewrites any existing route file whose
// content is empty with a default `Hello "<path>"!` scaffold. If something
// else empties a route file first, the generator's next run hides the loss
// instead of failing loud. This check must run BEFORE any command that loads
// vite.config.mts (dev/build/test), so corruption is caught as a zero-byte
// or scaffold file, never silently re-filled.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const templatesDir = join(root, 'apps/templates');

const IGNORE_PATTERN = /(__tests__|\.test\.(t|j)sx?$)/;
const HELLO_SCAFFOLD = /Hello\s+["'`][^"'`]*["'`]!/;

function findRouteFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { recursive: true })) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) continue;
    if (!/\.tsx?$/.test(full)) continue;
    if (IGNORE_PATTERN.test(full)) continue;
    files.push(full);
  }
  return files;
}

function isLayoutRoute(filePath) {
  const base = filePath.split('/').pop();
  return base === '__root.tsx' || base.startsWith('_');
}

const violations = [];

for (const template of readdirSync(templatesDir)) {
  const routesDir = join(templatesDir, template, 'src/routes');
  try {
    if (!statSync(routesDir).isDirectory()) continue;
  } catch {
    continue;
  }

  for (const file of findRouteFiles(routesDir)) {
    const relPath = file.slice(root.length + 1);
    const content = readFileSync(file, 'utf-8');

    if (content.trim().length === 0) {
      violations.push(`${relPath}: empty route file`);
      continue;
    }

    if (HELLO_SCAFFOLD.test(content)) {
      violations.push(
        `${relPath}: default TanStack "Hello" scaffold found — real implementation was lost`,
      );
      continue;
    }

    if (isLayoutRoute(file) && !content.includes('<Outlet')) {
      violations.push(
        `${relPath}: layout route missing <Outlet /> — child routes would be invisible`,
      );
    }
  }
}

if (violations.length) {
  console.error('ROUTE INTEGRITY FAILED:');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log('ROUTE INTEGRITY OK: no empty/scaffolded/outlet-less route files');
