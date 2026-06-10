import type { Unit } from './types.js';

export function mergeDeps(units: Unit[]): Record<string, string> {
  return Object.assign({}, ...units.map((u) => u.deps));
}

export function mergeTsPaths(units: Unit[]): Record<string, string[]> {
  return Object.assign({}, ...units.map((u) => u.tsPaths));
}

export function collectEnvBlocks(units: Unit[]): NonNullable<Unit['envBlock']>[] {
  return units.flatMap((u) => (u.envBlock ? [u.envBlock] : []));
}
