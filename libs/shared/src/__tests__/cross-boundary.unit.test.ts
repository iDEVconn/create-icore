/**
 * Cross-boundary dependency guard.
 *
 * Rule 1 — CLIENT boundary: no file reachable from @icore/shared/client
 *          may import @nestjs/* (server-only).
 *
 * Rule 2 — SERVER boundary: no file under apps/microservices/** or
 *          libs/*-client/** (NestJS modules) may import react or other
 *          browser-only packages.
 *
 * These are static source-level checks — they run fast in Vitest without
 * needing a full build.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../../../..');

// ── helpers ────────────────────────────────────────────────────────────────

async function walkTs(dir: string): Promise<string[]> {
  const files: string[] = [];
  let entries: Dirent<string>[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '__tests__') {
      files.push(...(await walkTs(full)));
    } else if (e.isFile() && /\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

async function importsIn(file: string): Promise<string[]> {
  const src = await readFile(file, 'utf8');
  const matches = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)];
  return matches.map((m) => m[1] ?? '');
}

// ── Rule 1: client boundary ────────────────────────────────────────────────

describe('client boundary — no @nestjs/* in browser-safe exports', () => {
  const CLIENT_ROOTS = [
    join(ROOT, 'libs/shared/src/client.ts'),
    join(ROOT, 'libs/shared/src/abilities'),
    join(ROOT, 'libs/shared/src/types'),
    join(ROOT, 'libs/template-shared/src'),
  ];

  it('no @nestjs/* import found in client-side source files', async () => {
    const violations: string[] = [];

    for (const root of CLIENT_ROOTS) {
      const s = await stat(root).catch(() => null);
      if (!s) continue;
      const files = s.isFile() ? [root] : await walkTs(root);

      for (const file of files) {
        const imports = await importsIn(file);
        for (const imp of imports) {
          if (/^(@nestjs\/|firebase-admin|bullmq|ioredis)/.test(imp)) {
            violations.push(`${file.replace(ROOT + '/', '')}  →  ${imp}`);
          }
        }
      }
    }

    expect(
      violations,
      `Server-only imports found in client code:\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});

// ── Rule 2: server boundary ────────────────────────────────────────────────

describe('server boundary — no browser-only packages in NestJS modules', () => {
  const SERVER_ROOTS = [
    join(ROOT, 'apps/microservices'),
    join(ROOT, 'libs/auth-client/src'),
    join(ROOT, 'libs/upload-client/src'),
    join(ROOT, 'libs/notes-client/src'),
    join(ROOT, 'libs/payment-client/src'),
    join(ROOT, 'libs/jobs-client/src'),
  ];

  // Regex matches the start of a bare import specifier
  const BROWSER_ONLY =
    /^(react(-dom|-router)?|@tanstack\/react-|antd|@mui\/|@radix-ui\/|lucide-react|sonner|@ant-design\/)/;

  it('no browser-only import found in server-side source files', async () => {
    const violations: string[] = [];

    for (const root of SERVER_ROOTS) {
      const s = await stat(root).catch(() => null);
      if (!s) continue;
      const files = s.isFile() ? [root] : await walkTs(root);

      for (const file of files) {
        const imports = await importsIn(file);
        for (const imp of imports) {
          if (BROWSER_ONLY.test(imp)) {
            violations.push(`${file.replace(ROOT + '/', '')}  →  ${imp}`);
          }
        }
      }
    }

    expect(
      violations,
      `Browser-only imports found in server code:\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});
