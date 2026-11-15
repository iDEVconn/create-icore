import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ciPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../_template-shell/.github/workflows/ci.yml',
);

// `nx affected -t lint test build` never runs `graphql-codegen`, so a broken .graphql operation
// would pass the generated project's CI. The step must run it for every project that has the target
// (and none in a rest project, where no project has it).
describe('generated project CI', () => {
  it('validates GraphQL operations through every project with a graphql-codegen target', async () => {
    const ci = await readFile(ciPath, 'utf8');
    expect(ci).toContain('nx show projects --with-target graphql-codegen');
    expect(ci).toContain('nx run "$p:graphql-codegen"');
  });
});
