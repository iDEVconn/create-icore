import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRANSPORT_DEPS } from '../scaffold-env.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../..');

// Each broker transport's driver is an optional peer dependency of @nestjs/microservices, so it must be
// installed under the exact package name Nest imports. Nest 12 moved NATS from `nats` to
// `@nats-io/transport-node` (NATS v3): a project still installing `nats` dies at boot with
// `The "@nats-io/transport-node" package is missing`.
describe('transport drivers installed by create-icore match @nestjs/microservices peers', () => {
  it('every dependency in TRANSPORT_DEPS is a peer Nest imports', async () => {
    const nest = JSON.parse(
      await readFile(resolve(repoRoot, 'node_modules/@nestjs/microservices/package.json'), 'utf8'),
    ) as { peerDependencies: Record<string, string> };
    const peers = new Set(Object.keys(nest.peerDependencies));

    const unknown: string[] = [];
    for (const [transport, deps] of Object.entries(TRANSPORT_DEPS)) {
      for (const dep of Object.keys(deps)) {
        if (!peers.has(dep)) unknown.push(`${transport}: ${dep}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('the repo root installs the NATS v3 driver, not the retired `nats` package', async () => {
    const root = JSON.parse(await readFile(resolve(repoRoot, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(root.dependencies['@nats-io/transport-node']).toMatch(/^\^3\./);
    expect(root.dependencies['nats']).toBeUndefined();
  });
});
