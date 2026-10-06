/**
 * Docker orchestrator for deterministic certification (local == CI).
 *
 *   node tests/docker/run.mjs                     → Dimension 5 + the font guard (the default)
 *   node tests/docker/run.mjs --update-snapshots  → (re)generates the -docker-linux baselines
 *   node tests/docker/run.mjs axe-runner          → one runner; the default steps aside
 *   node tests/docker/run.mjs --all               → all five runners in the container
 *
 * It builds the pinned image (Dockerfile) and mounts __screenshots__/test-results on the host
 * so the baselines persist. The deps are Linux-native inside the image (the host's are excluded
 * via .dockerignore).
 *
 * Why there is a default at all: with no filter this script runs ALL FIVE runners at
 * `workers: 1`, and four of them — manifest-contract, axe, isolation, keyboard, 4371 tests — are
 * exactly what `pnpm certify` has already run in parallel on the host: 5962 tests in 96 min,
 * against 26.7 min for the 1591 this default selects. CI does not run the five either
 * (`certify.yml` runs Dim 1-4 outside Docker and filters the visual job to `visual-runner`), so
 * the unfiltered local command is both slower than CI and a reproduction of nothing.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..'); // docker → tests → responsive → packages → <root>
const IMAGE = 'pdx-cert:latest';
const CONFIG = 'tests/playwright-docker.config.ts';

/**
 * Dimension 5, plus the guard on the image its baselines were taken in.
 *
 * `fonts` travels with the visual runner and is not decoration: when Manrope resolves to a CJK
 * font, EVERY heading of EVERY baseline is rendered in Chinese — with every screenshot green,
 * because they all agree with each other. A bare
 * `visual-runner` filter excludes it (the positional is a regex over the file path), which is why
 * this default has two entries rather than one.
 */
export const DEFAULT_FILTERS = ['visual-runner', 'fonts'];

/**
 * Playwright flags that consume the next argument. Needed to tell a FILTER (a positional, which is
 * a regex over the file path) from an option's VALUE: `--grep "visual: x"` is two arguments, and
 * the second does not start with `-`. Without this list, `--grep x` would read as "the caller
 * already chose a filter" and the default would disappear silently.
 */
const FLAGS_WITH_VALUE = new Set([
    '--grep', '-g', '--grep-invert', '--project', '--reporter', '--workers', '-j',
    '--shard', '--timeout', '--repeat-each', '--retries', '--max-failures', '--output',
]);

/**
 * The `playwright test` arguments for one invocation of this script.
 *
 * Pure on purpose: it is what lets the default be verified without starting Docker.
 */
export function buildArgs(passThrough) {
    const args = passThrough.filter((a) => a !== '--all');
    const explicitAll = passThrough.includes('--all');

    let expectsValue = false;
    const hasFilter = args.some((a) => {
        if (expectsValue) { expectsValue = false; return false; }
        if (a.startsWith('-')) { expectsValue = FLAGS_WITH_VALUE.has(a); return false; }
        return true;
    });

    // The default applies only when nobody asked for something else. `--all` is how you say
    // "the whole container", which is what makes the pinned image worth having when you need it.
    const filters = explicitAll || hasFilter ? [] : DEFAULT_FILTERS;
    return ['test', '--config', CONFIG, ...filters, ...args];
}

function run(cmd, args) {
    console.log(`\n> ${cmd} ${args.join(' ')}\n`);
    execFileSync(cmd, args, { stdio: 'inherit', cwd: repoRoot });
}

function main(passThrough) {
    // Directories to keep on the host (created before the mount, or Docker creates them as root)
    const mounts = [
        'packages/responsive/tests/integration/visual-regression/__screenshots__',
        'packages/responsive/test-results',
    ];
    for (const rel of mounts) mkdirSync(resolve(repoRoot, rel), { recursive: true });

    // 1) Build the deterministic image
    run('docker', ['build', '-f', 'packages/responsive/tests/docker/Dockerfile', '-t', IMAGE, '.']);

    // 2) Run with mounted volumes, so the baselines and results persist
    const volArgs = mounts.flatMap((rel) => ['-v', `${resolve(repoRoot, rel)}:/work/${rel}`]);
    run('docker', [
        'run', '--rm', '--ipc=host',
        ...volArgs,
        IMAGE,
        'npx', 'playwright', ...buildArgs(passThrough),
    ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
