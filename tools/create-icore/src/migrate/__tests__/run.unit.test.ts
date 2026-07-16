import { describe, it, expect, vi } from 'vitest';
import { runMigrate, type CodemodDeps } from '../run.js';
import type { RegistryEntry } from '../../migrations/build-registry.js';

function entry(over: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'example',
    kind: 'codemod',
    affectedAxes: ['ui:mui'],
    affectedGlobs: ['x/**'],
    commitRange: '1234567..89abcde',
    description: 'Example',
    version: '0.2.0',
    diff: '',
    ...over,
  };
}

function makeDeps(over: Partial<CodemodDeps> = {}): CodemodDeps {
  return {
    isApplied: vi.fn().mockResolvedValue(false),
    isTreeClean: vi.fn().mockResolvedValue(true),
    commit: vi.fn().mockResolvedValue(undefined),
    loadCodemod: vi.fn().mockResolvedValue(vi.fn().mockResolvedValue(undefined)),
    bumpGeneratorVersion: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('runMigrate', () => {
  it('returns up-to-date for an empty plan without checking the tree', async () => {
    const deps = makeDeps();
    const result = await runMigrate('/proj', [], '0.3.0', deps, vi.fn());
    expect(result).toBe('up-to-date');
    expect(deps.isTreeClean).not.toHaveBeenCalled();
  });

  it('throws on a dirty tree before touching any entry', async () => {
    const deps = makeDeps({ isTreeClean: vi.fn().mockResolvedValue(false) });
    await expect(runMigrate('/proj', [entry()], '0.3.0', deps, vi.fn())).rejects.toThrow(
      /not clean/,
    );
    expect(deps.isApplied).not.toHaveBeenCalled();
  });

  it('auto-chains through consecutive codemod entries and bumps the version at the end', async () => {
    const codemodFn = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ loadCodemod: vi.fn().mockResolvedValue(codemodFn) });
    const plan = [entry({ id: 'a', version: '0.2.0' }), entry({ id: 'b', version: '0.3.0' })];
    const result = await runMigrate('/proj', plan, '0.3.0', deps, vi.fn());
    expect(result).toBe('completed');
    expect(codemodFn).toHaveBeenCalledTimes(2);
    expect(deps.commit).toHaveBeenNthCalledWith(1, '/proj', 'migrate: a');
    expect(deps.commit).toHaveBeenNthCalledWith(2, '/proj', 'migrate: b');
    expect(deps.bumpGeneratorVersion).toHaveBeenCalledWith('/proj', '0.3.0');
  });

  it('stops at the first ai-prompt entry without touching later entries', async () => {
    const onAiPrompt = vi.fn();
    const deps = makeDeps();
    const plan = [
      entry({ id: 'prompt-one', kind: 'ai-prompt', version: '0.2.0' }),
      entry({ id: 'never-reached', version: '0.3.0' }),
    ];
    const result = await runMigrate('/proj', plan, '0.3.0', deps, onAiPrompt);
    expect(result).toBe('paused');
    expect(onAiPrompt).toHaveBeenCalledWith(plan[0]);
    expect(deps.isApplied).toHaveBeenCalledTimes(1);
    expect(deps.bumpGeneratorVersion).not.toHaveBeenCalled();
  });

  it('skips entries already marked applied', async () => {
    const codemodFn = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      isApplied: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      loadCodemod: vi.fn().mockResolvedValue(codemodFn),
    });
    const plan = [entry({ id: 'already-done' }), entry({ id: 'still-pending', version: '0.3.0' })];
    const result = await runMigrate('/proj', plan, '0.3.0', deps, vi.fn());
    expect(result).toBe('completed');
    expect(codemodFn).toHaveBeenCalledTimes(1);
    expect(deps.commit).toHaveBeenCalledWith('/proj', 'migrate: still-pending');
  });

  it('propagates a codemod function error without committing or bumping', async () => {
    const failingFn = vi.fn().mockRejectedValue(new Error('anchor not found unexpectedly'));
    const deps = makeDeps({ loadCodemod: vi.fn().mockResolvedValue(failingFn) });
    await expect(runMigrate('/proj', [entry()], '0.3.0', deps, vi.fn())).rejects.toThrow(
      /anchor not found/,
    );
    expect(deps.commit).not.toHaveBeenCalled();
    expect(deps.bumpGeneratorVersion).not.toHaveBeenCalled();
  });
});
