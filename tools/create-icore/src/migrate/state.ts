import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * An entry counts as applied iff `projectDir`'s git history contains a
 * commit whose subject is EXACTLY `migrate: <id>`. Deliberately not
 * implemented via `git log --grep` — verified experimentally that no
 * combination of `--fixed-strings`/`^...$` gives exact-match semantics
 * (fixed-strings treats anchors as literal characters, so the pattern
 * then never matches; without fixed-strings, id substrings of a longer
 * real id false-positive). Exactness is enforced here instead.
 */
export async function isApplied(id: string, projectDir: string): Promise<boolean> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync('git', ['log', '--format=%s'], { cwd: projectDir }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('does not have any commits yet')) return false;
    throw err;
  }
  const marker = `migrate: ${id}`;
  return stdout.split('\n').some((line) => line === marker);
}
