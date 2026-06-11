import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateConfig, loadConfig, ConfigFileError } from '../config.js';

describe('validateConfig', () => {
  it('returns empty object for empty input', () => {
    expect(validateConfig({})).toEqual({});
  });

  it('accepts a full valid config', () => {
    const result = validateConfig({
      projectName: 'my-app',
      authProvider: 'supabase',
      dbProvider: 'firebase',
      upload: 'cloudinary',
      payment: 'paypal',
      jobs: 'bullmq',
      example: 'notes',
      ui: 'antd',
      transport: 'nats',
      packageManager: 'npm',
      initGit: true,
      install: false,
    });
    expect(result).toEqual({
      projectName: 'my-app',
      authProvider: 'supabase',
      dbProvider: 'firebase',
      upload: 'cloudinary',
      payment: 'paypal',
      jobs: 'bullmq',
      example: 'notes',
      ui: 'antd',
      transport: 'nats',
      packageManager: 'npm',
      initGit: true,
      install: false,
    });
  });

  it('accepts a partial config', () => {
    const result = validateConfig({ authProvider: 'mongodb', transport: 'kafka' });
    expect(result).toEqual({ authProvider: 'mongodb', transport: 'kafka' });
  });

  it('silently ignores unknown keys', () => {
    const result = validateConfig({ authProvider: 'supabase', unknownKey: 'value' });
    expect(result).toEqual({ authProvider: 'supabase' });
  });

  it('silently ignores targetDir', () => {
    const result = validateConfig({ authProvider: 'supabase', targetDir: '/some/path' });
    expect(result).toEqual({ authProvider: 'supabase' });
  });

  it('accepts authProvider: "none"', () => {
    expect(validateConfig({ authProvider: 'none' })).toEqual({ authProvider: 'none' });
  });

  it('accepts dbProvider: "none"', () => {
    expect(validateConfig({ dbProvider: 'none' })).toEqual({ dbProvider: 'none' });
  });

  it('error message for invalid authProvider lists none as valid', () => {
    expect(() => validateConfig({ authProvider: 'oracle' })).toThrowError(
      'expected one of: supabase, firebase, mongodb, none',
    );
  });

  it('throws ConfigFileError for invalid authProvider', () => {
    expect(() => validateConfig({ authProvider: 'postgres' })).toThrowError(ConfigFileError);
    expect(() => validateConfig({ authProvider: 'postgres' })).toThrowError(
      'config field "authProvider" got "postgres", expected one of: supabase, firebase, mongodb',
    );
  });

  it('throws ConfigFileError for invalid dbProvider', () => {
    expect(() => validateConfig({ dbProvider: 'redis' })).toThrowError(ConfigFileError);
  });

  it('throws ConfigFileError for invalid upload', () => {
    expect(() => validateConfig({ upload: 'aws-s3' })).toThrowError(ConfigFileError);
  });

  it('throws ConfigFileError for invalid ui', () => {
    expect(() => validateConfig({ ui: 'bootstrap' })).toThrowError(ConfigFileError);
  });

  it('throws ConfigFileError for invalid transport', () => {
    expect(() => validateConfig({ transport: 'grpc' })).toThrowError(ConfigFileError);
  });

  it('throws ConfigFileError for projectName with invalid chars', () => {
    expect(() => validateConfig({ projectName: 'my app!' })).toThrowError(ConfigFileError);
    expect(() => validateConfig({ projectName: 'my app!' })).toThrowError('projectName');
  });

  it('throws ConfigFileError for non-boolean initGit', () => {
    expect(() => validateConfig({ initGit: 'yes' })).toThrowError(ConfigFileError);
    expect(() => validateConfig({ initGit: 'yes' })).toThrowError('"initGit" must be a boolean');
  });

  it('throws ConfigFileError for non-boolean install', () => {
    expect(() => validateConfig({ install: 1 })).toThrowError(ConfigFileError);
  });

  it('throws ConfigFileError when raw is not an object', () => {
    expect(() => validateConfig('string')).toThrowError(ConfigFileError);
    expect(() => validateConfig(42)).toThrowError(ConfigFileError);
    expect(() => validateConfig(null)).toThrowError(ConfigFileError);
    expect(() => validateConfig([])).toThrowError(ConfigFileError);
  });
});

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'icore-config-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('reads and validates a valid JSON config file', async () => {
    const file = join(tmpDir, 'config.json');
    await writeFile(file, JSON.stringify({ authProvider: 'supabase', transport: 'nats' }), 'utf8');
    const result = await loadConfig(file);
    expect(result).toEqual({ authProvider: 'supabase', transport: 'nats' });
  });

  it('throws ConfigFileError when file does not exist', async () => {
    await expect(loadConfig(join(tmpDir, 'missing.json'))).rejects.toThrowError(ConfigFileError);
    await expect(loadConfig(join(tmpDir, 'missing.json'))).rejects.toThrowError(
      'config file not found',
    );
  });

  it('throws ConfigFileError for invalid JSON', async () => {
    const file = join(tmpDir, 'bad.json');
    await writeFile(file, '{ not json }', 'utf8');
    await expect(loadConfig(file)).rejects.toThrowError(ConfigFileError);
    await expect(loadConfig(file)).rejects.toThrowError('config file is not valid JSON');
  });

  it('throws ConfigFileError when JSON is valid but contains invalid field', async () => {
    const file = join(tmpDir, 'invalid-field.json');
    await writeFile(file, JSON.stringify({ authProvider: 'oracle' }), 'utf8');
    await expect(loadConfig(file)).rejects.toThrowError(ConfigFileError);
    await expect(loadConfig(file)).rejects.toThrowError('"authProvider"');
  });
});
