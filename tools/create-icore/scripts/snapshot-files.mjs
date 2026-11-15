import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Repo-relative paths git considers part of the project: tracked files plus untracked files that
 * are NOT ignored. A snapshot built from this list can never pick up `.env`, agent state
 * (`.claude-flow`, `ruvector.db`) or other local files that `.gitignore` excludes, which a plain
 * directory copy would carry into `templates/` and from there into the npm tarball.
 */
export function listSnapshotFiles(root) {
  const raw = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: root,
      maxBuffer: 256 * 1024 * 1024,
    },
  ).toString('utf8');
  return raw
    .split('\0')
    .filter(Boolean)
    .filter((rel) => {
      // `--cached` still lists a file that was deleted from the working tree.
      const abs = resolve(root, rel);
      return existsSync(abs) && !lstatSync(abs).isDirectory();
    });
}

/** Files of `all` that live at or under `rel` (a file or a directory, repo-relative). */
export function filesUnder(all, rel) {
  const prefix = rel.endsWith('/') ? rel : `${rel}/`;
  return all.filter((f) => f === rel || f.startsWith(prefix));
}
