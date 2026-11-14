import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The client GraphQL data layer has no UI-library code, so `create-icore`
 * ships the SAME files for client-shadcn, client-antd and client-mui (the
 * `api=graphql` overlay renames `queries/*.graphql.ts` over the REST twins).
 * Any drift between the three copies would make one UI choice behave
 * differently, so they must stay byte-identical.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const TEMPLATES = ['client-shadcn', 'client-antd', 'client-mui'] as const;

const SHARED_FILES = [
  'graphql-loader.d.ts',
  'codegen.ts',
  'src/api/graphql.ts',
  'src/api/__tests__/graphql.unit.test.ts',
  'src/graphql/operation.ts',
  'src/graphql/__tests__/operation.unit.test.ts',
  'src/graphql/gql/notes.graphql',
  'src/graphql/gql/profile.graphql',
  'src/graphql/notes.queries.ts',
  'src/graphql/profile.queries.ts',
  'src/gql/types.ts',
  'src/queries/notes.graphql.ts',
  'src/queries/profile.graphql.ts',
  'src/queries/__tests__/notes.graphql.unit.test.ts',
  'src/queries/__tests__/profile.graphql.unit.test.ts',
  // The REST twins the overlay replaces must stay identical too.
  'src/queries/notes.ts',
  'src/queries/profile.ts',
];

function read(template: string, file: string): string {
  return readFileSync(join(repoRoot, 'apps/templates', template, file), 'utf8');
}

describe('client GraphQL layer parity across the three UI templates', () => {
  it.each(SHARED_FILES)('%s exists and is byte-identical in every template', (file) => {
    for (const template of TEMPLATES) {
      expect(
        existsSync(join(repoRoot, 'apps/templates', template, file)),
        `${template}/${file}`,
      ).toBe(true);
    }
    const reference = read(TEMPLATES[0], file);
    for (const template of TEMPLATES.slice(1)) {
      expect(read(template, file), `${template}/${file} differs from ${TEMPLATES[0]}`).toBe(
        reference,
      );
    }
  });

  it.each(TEMPLATES)(
    '%s registers the graphql loader and the graphql-codegen target',
    (template) => {
      expect(read(template, 'vite.config.mts')).toMatch(
        /import graphqlLoader from 'vite-plugin-graphql-loader';[\s\S]*plugins: \[[\s\S]*graphqlLoader\(\)/,
      );
      const project = JSON.parse(read(template, 'project.json')) as {
        targets?: Record<
          string,
          { executor?: string; options?: { command?: string; cwd?: string } }
        >;
      };
      expect(project.targets?.['graphql-codegen']).toMatchObject({
        executor: 'nx:run-commands',
        options: {
          command: 'graphql-codegen --config codegen.ts',
          cwd: `apps/templates/${template}`,
        },
      });
    },
  );

  it.each(TEMPLATES)('%s production code still imports the REST queries only', (template) => {
    const offenders: string[] = [];
    const roots = ['src/routes', 'src/components', 'src/layouts', 'src/app', 'src/main.tsx'];
    const walk = (rel: string): void => {
      const abs = join(repoRoot, 'apps/templates', template, rel);
      if (!existsSync(abs)) return;
      if (statSync(abs).isDirectory()) {
        for (const name of readdirSync(abs)) {
          if (name === '__tests__') continue;
          walk(join(rel, name));
        }
        return;
      }
      if (
        /\.(ts|tsx)$/.test(rel) &&
        /queries\/(notes|profile)\.graphql['"]/.test(read(template, rel))
      ) {
        offenders.push(rel);
      }
    };
    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });
});
