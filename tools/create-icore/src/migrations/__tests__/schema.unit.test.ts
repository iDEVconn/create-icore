import { describe, it, expect } from 'vitest';
import { parseMigrationYaml } from '../schema.js';

const VALID_YAML = [
  'id: mui-9-2-icon-rename',
  'kind: codemod',
  'affectedAxes:',
  '  - "ui:mui"',
  'affectedGlobs:',
  '  - "apps/templates/client-mui/src/**/*.tsx"',
  'commitRange: "336161f..a1b2c3d"',
  'description: "Rename 3 icon imports for MUI v9."',
].join('\n');

describe('parseMigrationYaml', () => {
  it('parses a valid migration yaml', () => {
    const entry = parseMigrationYaml(VALID_YAML, '.changeset/mui-9-2-icon-rename.migration.yml');
    expect(entry).toEqual({
      id: 'mui-9-2-icon-rename',
      kind: 'codemod',
      affectedAxes: ['ui:mui'],
      affectedGlobs: ['apps/templates/client-mui/src/**/*.tsx'],
      commitRange: '336161f..a1b2c3d',
      description: 'Rename 3 icon imports for MUI v9.',
    });
  });

  it('throws when id is missing', () => {
    const yamlText = VALID_YAML.replace(/^id: .*$/m, '');
    expect(() => parseMigrationYaml(yamlText, 'bad.yml')).toThrow(
      /"id" must be a non-empty string/,
    );
  });

  it('throws when kind is invalid', () => {
    const yamlText = VALID_YAML.replace('kind: codemod', 'kind: rewrite-everything');
    expect(() => parseMigrationYaml(yamlText, 'bad.yml')).toThrow(
      /"kind" must be "codemod" or "ai-prompt"/,
    );
  });

  it('throws when affectedAxes is empty', () => {
    const yamlText = VALID_YAML.replace(/affectedAxes:\n\s+- "ui:mui"/, 'affectedAxes: []');
    expect(() => parseMigrationYaml(yamlText, 'bad.yml')).toThrow(
      /"affectedAxes" must be a non-empty array/,
    );
  });

  it('throws when affectedGlobs is empty', () => {
    const yamlText = VALID_YAML.replace(
      /affectedGlobs:\n\s+- "apps\/templates\/client-mui\/src\/\*\*\/\*\.tsx"/,
      'affectedGlobs: []',
    );
    expect(() => parseMigrationYaml(yamlText, 'bad.yml')).toThrow(
      /"affectedGlobs" must be a non-empty array/,
    );
  });

  it('throws when commitRange is malformed', () => {
    const yamlText = VALID_YAML.replace('336161f..a1b2c3d', 'not-a-range');
    expect(() => parseMigrationYaml(yamlText, 'bad.yml')).toThrow(/"commitRange" must match/);
  });

  it('throws when description is missing', () => {
    const yamlText = VALID_YAML.replace(/^description: .*$/m, '');
    expect(() => parseMigrationYaml(yamlText, 'bad.yml')).toThrow(
      /"description" must be a non-empty string/,
    );
  });

  it('throws when top-level content is not a mapping', () => {
    expect(() => parseMigrationYaml('- just\n- a\n- list', 'bad.yml')).toThrow(
      /top-level content must be a YAML mapping/,
    );
  });

  it('throws with the source path in the error message', () => {
    expect(() =>
      parseMigrationYaml('not: valid\nkind: whatever', '.changeset/foo.migration.yml'),
    ).toThrow(/\.changeset\/foo\.migration\.yml/);
  });
});
