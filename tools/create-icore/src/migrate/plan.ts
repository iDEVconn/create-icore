import semver from 'semver';
import type { RegistryEntry, RegistryFile } from '../migrations/build-registry.js';

/**
 * Filters the bundled registry to entries strictly newer than the project's
 * current generatorVersion, up to (inclusive of) the requested target, whose
 * affectedAxes all match the project's blueprint selections — sorted ascending.
 */
export function computePlan(
  registry: RegistryFile,
  currentVersion: string,
  targetVersion: string,
  projectAxes: Record<string, string>,
): RegistryEntry[] {
  return registry.entries
    .filter(
      (entry) =>
        semver.gt(entry.version, currentVersion) && semver.lte(entry.version, targetVersion),
    )
    .filter((entry) =>
      entry.affectedAxes.every((axis) => {
        const [axisName, unitId] = axis.split(':');
        return projectAxes[axisName] === unitId;
      }),
    )
    .sort((a, b) => semver.compare(a.version, b.version));
}
