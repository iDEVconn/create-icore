import type { CreateIcoreOptions } from '../lib/options.js';
import type { Unit } from './types.js';
import { MANIFEST } from './index.js';

const EMPTY: Unit = { libDirs: [], deps: {}, tsPaths: {} };

/** Map the user's choices to the concrete set of units to add. Additive only. */
export function resolveUnits(opts: CreateIcoreOptions): Unit[] {
  const units: Unit[] = [
    opts.authProvider === 'none' ? EMPTY : MANIFEST.auth[opts.authProvider],
    opts.dbProvider === 'none' ? EMPTY : MANIFEST.db[opts.dbProvider],
    MANIFEST.ui[opts.ui],
    MANIFEST.transport[opts.transport],
  ];
  if (opts.upload !== 'none') units.push(MANIFEST.storage[opts.upload]);
  if (opts.payment !== 'none') units.push(MANIFEST.feature.payment);
  if (opts.jobs !== 'none') units.push(MANIFEST.feature.jobs);
  if (opts.example === 'notes') units.push(MANIFEST.feature.notes);

  const firebaseUsed =
    opts.authProvider === 'firebase' ||
    opts.dbProvider === 'firebase' ||
    opts.upload === 'firebase';
  if (firebaseUsed) units.push(MANIFEST.shared.firebaseAdmin);

  return units;
}
