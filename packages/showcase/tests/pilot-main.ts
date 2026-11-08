/**
 * `main`'s pilot beside this tree's (#938): the `.pdx` side of `scenario-pilot-mount.spec.ts` is held
 * against `main`'s, measured in the same run and alternated with it, not against a recording. A
 * recording was taken once; measured since, an unchanged build moved up to 38% from one run to the
 * next on one machine, past the 25% a row was allowed — the row failed on the machine, not on the
 * change. Two builds measured side by side see the same machine.
 *
 * `main` is a git worktree of `origin/main` with an install of its own, on the same disk as this tree
 * (a tree elsewhere can be slower for where it is — `scripts/time-budgets/run.mjs`): under this
 * repository's `node_modules/.cache`, kept between runs and moved to `origin/main` each time. Its
 * pilot is built with this tree's Vite, from its own sources and node_modules.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
/** Where `main`'s worktree is kept. */
const WORKTREE = join(repoDir, 'node_modules', '.cache', 'pdx-main');

const git = (args: string[], cwd = repoDir): string => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/**
 * The root of a worktree at `origin/main`, installed, and its commit. Fetched first; when the fetch
 * fails — offline — the last `origin/main` this repository has is used, and the commit says which.
 */
export function mainWorktree(): { root: string; commit: string } {
    // A shallow clone (CI's checkout) fetches main shallow too; a full clone is left full.
    const shallow = git(['rev-parse', '--is-shallow-repository']) === 'true';
    try {
        git(['fetch', '--no-tags', ...(shallow ? ['--depth=1'] : []), 'origin', 'main']);
    } catch (e) {
        console.warn(`[pilot-main] could not fetch origin/main (${(e as Error).message.split('\n')[0]}): the last one known is measured`);
    }
    const commit = git(['rev-parse', 'origin/main']);
    if (!existsSync(join(WORKTREE, '.git'))) {
        mkdirSync(dirname(WORKTREE), { recursive: true });
        git(['worktree', 'add', '--detach', '--force', WORKTREE, commit]);
    } else {
        git(['checkout', '--detach', '--force', commit], WORKTREE);
    }
    // Its own install, against its own lockfile. No scripts: `prepare` points git at the hooks, which
    // this repository's install has already done for every worktree of it.
    execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['install', '--frozen-lockfile', '--prefer-offline', '--ignore-scripts'], {
        cwd: WORKTREE, stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32',
    });
    return { root: WORKTREE, commit };
}
