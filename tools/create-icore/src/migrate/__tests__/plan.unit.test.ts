import { describe, it, expect } from 'vitest';
import { computePlan } from '../plan.js';
import type { RegistryEntry, RegistryFile } from '../../migrations/build-registry.js';

function entry(over: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'example',
    kind: 'codemod',
    affectedAxes: ['ui:mui'],
    affectedGlobs: ['apps/templates/client-mui/**'],
    commitRange: '1234567..89abcde',
    description: 'Example',
    version: '0.2.0',
    diff: '',
    ...over,
  };
}

describe('computePlan', () => {
  it('includes entries strictly above current version and up to (inclusive of) target', () => {
    const registry: RegistryFile = {
      entries: [
        entry({ id: 'too-old', version: '0.1.0' }),
        entry({ id: 'in-range', version: '0.2.0' }),
        entry({ id: 'at-target', version: '0.3.0' }),
        entry({ id: 'too-new', version: '0.4.0' }),
      ],
    };
    const plan = computePlan(registry, '0.1.5', '0.3.0', { ui: 'mui' });
    expect(plan.map((e) => e.id)).toEqual(['in-range', 'at-target']);
  });

  it('excludes an entry whose version equals currentVersion (strictly greater-than)', () => {
    const registry: RegistryFile = { entries: [entry({ id: 'same', version: '0.2.0' })] };
    const plan = computePlan(registry, '0.2.0', '0.3.0', { ui: 'mui' });
    expect(plan).toEqual([]);
  });

  it('filters out entries whose axes do not all match the project', () => {
    const registry: RegistryFile = {
      entries: [
        entry({ id: 'matches', affectedAxes: ['ui:mui'] }),
        entry({ id: 'wrong-ui', affectedAxes: ['ui:antd'] }),
        entry({ id: 'multi-axis-match', affectedAxes: ['ui:mui', 'authProvider:postgres'] }),
        entry({ id: 'multi-axis-partial', affectedAxes: ['ui:mui', 'authProvider:supabase'] }),
      ],
    };
    const plan = computePlan(registry, '0.0.0', '9.9.9', { ui: 'mui', authProvider: 'postgres' });
    expect(plan.map((e) => e.id)).toEqual(['matches', 'multi-axis-match']);
  });

  it('sorts the resulting plan by version ascending', () => {
    const registry: RegistryFile = {
      entries: [
        entry({ id: 'later', version: '0.5.0' }),
        entry({ id: 'earlier', version: '0.2.0' }),
      ],
    };
    const plan = computePlan(registry, '0.0.0', '9.9.9', { ui: 'mui' });
    expect(plan.map((e) => e.id)).toEqual(['earlier', 'later']);
  });

  it('returns an empty plan when nothing is in range', () => {
    const registry: RegistryFile = { entries: [entry({ version: '0.1.0' })] };
    expect(computePlan(registry, '0.5.0', '0.9.0', { ui: 'mui' })).toEqual([]);
  });
});
