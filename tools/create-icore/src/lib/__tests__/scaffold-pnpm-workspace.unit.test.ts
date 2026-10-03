import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writePnpmWorkspace } from '../scaffold-pkg.js';

async function workspaceYaml(workspaces: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-pnpm-ws-'));
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'demo', workspaces }));
  await writePnpmWorkspace(dir);
  return readFile(join(dir, 'pnpm-workspace.yaml'), 'utf8');
}

describe('writePnpmWorkspace', () => {
  it('lists the workspace globs', async () => {
    const yaml = await workspaceYaml(['apps/*', 'libs/*']);
    expect(yaml).toContain("  - 'apps/*'");
    expect(yaml).toContain("  - 'libs/*'");
  });

  it('keeps pre-approving the toolchain build scripts', async () => {
    const yaml = await workspaceYaml(['apps/*']);
    expect(yaml).toContain('allowBuilds:');
    expect(yaml).toContain("'nx': true");
  });

  // The built microservice bundles keep every non-@icore package EXTERNAL and
  // resolve it upward from dist/ to the ROOT node_modules (apps/*/webpack.config.js).
  // Under pnpm's strict isolation a dependency declared only in a workspace lib
  // (firebase-admin in libs/firebase-admin, ioredis in libs/shared, …) is NOT
  // hoisted there, so the service dies at boot with "Cannot find module".
  // npm/yarn hoist, so pnpm must too for the same project to run.
  it('hoists every dependency to the root node_modules so built bundles resolve them under pnpm', async () => {
    const yaml = await workspaceYaml(['apps/*']);
    expect(yaml).toMatch(/^shamefullyHoist: true$/m);
  });
});
