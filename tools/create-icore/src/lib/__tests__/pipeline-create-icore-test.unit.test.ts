import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pipelinePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../.github/workflows/pipeline.yml',
);

// The golden and matrix tests of create-icore scaffold from the repo's apps/ and libs/, but the Nx
// graph has no edge from those to create-icore: `nx affected -t test` skips it on a PR that only
// touches them. That let a red dev through twice (#417, #422).
describe('pipeline.yml check job', () => {
  it('runs the create-icore tests unconditionally, after the affected tests', async () => {
    const yml = await readFile(pipelinePath, 'utf8');
    const affected = yml.indexOf('yarn nx affected -t test');
    const always = yml.indexOf('yarn nx run create-icore:test');
    expect(affected).toBeGreaterThan(-1);
    expect(always).toBeGreaterThan(affected);
    // `!cancelled()` (not the default success()) so one red step still reports the others.
    const step = yml.slice(yml.lastIndexOf('- name:', always), always);
    expect(step).toContain('if: ${{ !cancelled() }}');
  });
});
