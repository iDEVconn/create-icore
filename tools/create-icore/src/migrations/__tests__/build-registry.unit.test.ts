import { describe, it, expect } from 'vitest';
import { buildRegistry, type BuildRegistryDeps, type ChangesetPair } from '../build-registry.js';

function makeDeps(
  overrides: Partial<BuildRegistryDeps> & { pairs: ChangesetPair[] },
): BuildRegistryDeps {
  const { pairs, ...rest } = overrides;
  return {
    listChangesetPairs: async () => pairs,
    codemodExists: async () => true,
    diffFiles: async () => ['some/file.ts'],
    diffText: async () => '--- a/some/file.ts\n+++ b/some/file.ts\n',
    currentVersion: async () => '0.12.2',
    loadExistingRegistry: async () => ({ entries: [] }),
    ...rest,
  };
}

const EXAMPLE_YAML = [
  'id: example-fix',
  'kind: codemod',
  'affectedAxes:',
  '  - "ui:mui"',
  'affectedGlobs:',
  '  - "apps/templates/client-mui/**"',
  'commitRange: "1234567..89abcde"',
  'description: "Example fix."',
].join('\n');

function basePair(over: Partial<ChangesetPair> = {}): ChangesetPair {
  return {
    slug: 'example',
    changesetPath: '.changeset/example.md',
    migrationYamlPath: '.changeset/example.migration.yml',
    migrationYamlRaw: EXAMPLE_YAML,
    changesetReleases: [{ name: '@idevconn/create-icore', type: 'patch' }],
    ...over,
  };
}

describe('buildRegistry', () => {
  it('adds a new codemod entry, stamped with the computed next version', async () => {
    const deps = makeDeps({ pairs: [basePair()] });
    const result = await buildRegistry(deps);
    expect(result.entries).toEqual([
      {
        id: 'example-fix',
        kind: 'codemod',
        affectedAxes: ['ui:mui'],
        affectedGlobs: ['apps/templates/client-mui/**'],
        commitRange: '1234567..89abcde',
        description: 'Example fix.',
        version: '0.12.3',
        diff: '--- a/some/file.ts\n+++ b/some/file.ts\n',
      },
    ]);
  });

  it('bumps minor when any changeset in the batch requests minor, even without a migration sibling', async () => {
    const deps = makeDeps({
      pairs: [
        basePair(),
        {
          slug: 'unrelated-feature',
          changesetPath: '.changeset/unrelated-feature.md',
          migrationYamlPath: null,
          migrationYamlRaw: null,
          changesetReleases: [{ name: '@idevconn/create-icore', type: 'minor' }],
        },
      ],
    });
    const result = await buildRegistry(deps);
    expect(result.entries[0].version).toBe('0.13.0');
  });

  it('skips a changeset with no migration sibling (no entry produced)', async () => {
    const deps = makeDeps({
      pairs: [
        {
          slug: 'docs-only',
          changesetPath: '.changeset/docs-only.md',
          migrationYamlPath: null,
          migrationYamlRaw: null,
          changesetReleases: [{ name: '@idevconn/create-icore', type: 'patch' }],
        },
      ],
    });
    const result = await buildRegistry(deps);
    expect(result.entries).toEqual([]);
  });

  it('throws on an orphan migration file with no matching changeset', async () => {
    const deps = makeDeps({
      pairs: [
        {
          slug: 'orphan',
          changesetPath: null,
          migrationYamlPath: '.changeset/orphan.migration.yml',
          migrationYamlRaw: EXAMPLE_YAML,
          changesetReleases: [],
        },
      ],
    });
    await expect(buildRegistry(deps)).rejects.toThrow(/Orphan migration file/);
  });

  it('throws on a duplicate id within the same batch', async () => {
    const deps = makeDeps({
      pairs: [
        basePair(),
        basePair({
          slug: 'example-2',
          changesetPath: '.changeset/example-2.md',
          migrationYamlPath: '.changeset/example-2.migration.yml',
        }),
      ],
    });
    await expect(buildRegistry(deps)).rejects.toThrow(/Duplicate migration id "example-fix"/);
  });

  it('throws on a duplicate id against the existing registry', async () => {
    const deps = makeDeps({
      pairs: [basePair()],
      loadExistingRegistry: async () => ({
        entries: [
          {
            id: 'example-fix',
            kind: 'codemod',
            affectedAxes: ['ui:mui'],
            affectedGlobs: ['x/**'],
            commitRange: '0000000..1111111',
            description: 'old',
            version: '0.1.0',
            diff: '',
          },
        ],
      }),
    });
    await expect(buildRegistry(deps)).rejects.toThrow(/Duplicate migration id "example-fix"/);
  });

  it('throws when affectedGlobs matches zero changed files', async () => {
    const deps = makeDeps({ pairs: [basePair()], diffFiles: async () => [] });
    await expect(buildRegistry(deps)).rejects.toThrow(/matched zero changed files/);
  });

  it('throws when a codemod-kind entry has no matching codemod file', async () => {
    const deps = makeDeps({ pairs: [basePair()], codemodExists: async () => false });
    await expect(buildRegistry(deps)).rejects.toThrow(/does not exist/);
  });

  it('does not require a codemod file for ai-prompt entries', async () => {
    const aiPromptYaml = EXAMPLE_YAML.replace('kind: codemod', 'kind: ai-prompt');
    const deps = makeDeps({
      pairs: [basePair({ migrationYamlRaw: aiPromptYaml })],
      codemodExists: async () => false,
    });
    const result = await buildRegistry(deps);
    expect(result.entries[0].kind).toBe('ai-prompt');
  });

  it('sorts merged entries by version ascending', async () => {
    const deps = makeDeps({
      pairs: [basePair()],
      loadExistingRegistry: async () => ({
        entries: [
          {
            id: 'older-entry',
            kind: 'codemod',
            affectedAxes: ['ui:mui'],
            affectedGlobs: ['x/**'],
            commitRange: '0000000..1111111',
            description: 'old',
            version: '0.5.0',
            diff: '',
          },
        ],
      }),
    });
    const result = await buildRegistry(deps);
    expect(result.entries.map((e) => e.id)).toEqual(['older-entry', 'example-fix']);
  });
});
