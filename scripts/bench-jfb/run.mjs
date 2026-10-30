#!/usr/bin/env node
// pnpm bench:jfb [--with vanillajs svelte …] [--runs N] [--only 01_,07_] [--port 8080]
//                [--chrome <path>] [--headless] [--json <file>]
//
// Runs js-framework-benchmark with PDX and the reference frameworks in ONE run, and prints a markdown
// table of the medians with their ratio to vanillajs. Totals vary between runs on the same machine, so
// frameworks are compared only within a run; --runs N repeats the whole run and keeps the median of
// the medians. After the runs, a local check the benchmark does not have — selecting a row among
// 10,000 (select10k.mjs) — is measured on the same builds and printed as a table of its own.
//
// The benchmark is cloned at a pinned commit into the OS temp directory, never into this repository,
// and its dependencies stay there. The clone is reused by the next run; delete the folder to start
// clean. PDX is built from this checkout: core and compiler first, then the app in this folder.
//
// --json <file> also writes the combined medians of every framework of the run to that file, which
// thresholds.mjs holds to thresholds in the nightly job (#248), and the combined means of the samples
// under `$means` (#736).
//
// The four benchmarks whose vanillajs script is under a millisecond take 100 samples, the others the
// benchmark's own count (runs.mjs, SUB_MS_BENCHMARKS, #736).
//
// A run that fails does not lose the others (runs.mjs, #374): each completed run's medians are written
// to <clone>/pdx-runs/<start time>/run-<i>.json as it completes, the table is the median of the runs
// that completed and says how many, the failed runs are listed under it, and the command exits 1.
//
// The failure that made this necessary, and what is known of it (#374, 2026-10-15). On 2026-10-13, 4
// of 9 `--runs 3` comparisons on one Windows machine failed with `ProtocolError:
// Runtime.callFunctionOn timed out` in select1k or clear1k, each framework hit at least once. The
// driver at the pinned commit is puppeteer-core 25.3.0, launched with no `protocolTimeout`, so the
// default applies: 180 s. The call is one the benchmark makes on the page after its click (`page.$`,
// `elem.evaluate`), so the page did not answer for three minutes — not a slow measurement. The
// benchmark's own `Cannot compute stats on empty array` follows from it: that benchmark has no sample.
// Not reproduced: 18 runs in the nightly job (Linux, headless) and 5 runs of select1k and clear1k on a
// Windows machine with nothing else running (headless) completed. The failures were on a loaded
// machine, and whether its Chrome was headless is not recorded; neither has been ruled out as the
// cause, and the cause is not known.

import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { combineRuns, readRun, toMarkdown } from './summarize.mjs';
import { measureSelect10k, select10kMarkdown } from './select10k.mjs';
import { collectRuns, jfbInvocations, runsTitle } from './runs.mjs';

const JFB_REPO = 'https://github.com/krausest/js-framework-benchmark.git';
// The commit the procedure was first run against by hand (2026-10-10). Moving it is a change to
// review: a new commit can change the benchmarks, the driver or the reference implementations.
const JFB_COMMIT = 'bf894b681fb56433ccb6efb4a3c93e35eda2b20d';
const DEFAULT_WITH = ['vanillajs', 'svelte', 'solid', 'lit', 'vue'];
const WIN = process.platform === 'win32';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');

function parseArgs(argv) {
    const options = { with: DEFAULT_WITH, runs: 1, only: [], port: 8080, chrome: null, headless: false, json: null };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--with') {
            const list = [];
            while (argv[i + 1] && !argv[i + 1].startsWith('--')) list.push(...argv[++i].split(','));
            options.with = list.filter(Boolean);
        } else if (arg === '--runs') {
            options.runs = Number(argv[++i]);
        } else if (arg === '--only') {
            options.only = (argv[++i] ?? '').split(',').filter(Boolean);
        } else if (arg === '--port') {
            options.port = Number(argv[++i]);
        } else if (arg === '--chrome') {
            options.chrome = argv[++i];
        } else if (arg === '--headless') {
            options.headless = true;
        } else if (arg === '--json') {
            options.json = argv[++i];
            if (!options.json) throw new Error('--json takes a file path');
        } else {
            throw new Error(`unknown argument ${arg}`);
        }
    }
    if (!Number.isInteger(options.runs) || options.runs < 1) throw new Error('--runs takes a positive integer');
    if (!Number.isInteger(options.port) || options.port < 1) throw new Error('--port takes a port number');
    if (!options.with.includes('vanillajs')) options.with.unshift('vanillajs');
    for (const name of options.with) {
        if (!/^[\w.-]+$/.test(name)) throw new Error(`--with: "${name}" is not a framework folder name`);
    }
    return options;
}

function step(message) {
    console.log(`\n[bench:jfb] ${message}`);
}

let playwrightBrowsers = null;

/**
 * The environment of a command run in the clone.
 * - `pnpm bench:jfb` exports pnpm's own settings as `npm_config_*` (`dir`, `verify-deps-before-run`,
 *   …); npm would read them as its own. The user's `.npmrc` still applies: npm reads it itself.
 * - The benchmark brings its own Playwright, and a Playwright removes from the shared browser cache
 *   the browsers no installed Playwright refers to: in a container it deleted the image's Chromium.
 *   The clone gets a browser folder of its own, beside it, and downloads nothing: the benchmark drives
 *   the Chrome given with --chrome, or the system one.
 */
function cloneEnv(extra = {}) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^npm_config_/i.test(k)));
    return {
        ...env,
        PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsers,
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
        ...extra,
    };
}

/**
 * Runs a command to completion, output inherited, and throws if it fails. No argument is a path:
 * each command gets its directory through `cwd`, so the shell npm needs on Windows quotes nothing.
 */
function run(command, args, cwd, env = {}) {
    const result = spawnSync(command, args, {
        cwd, stdio: 'inherit', shell: WIN && command !== process.execPath,
        env: cloneEnv(env),
    });
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} failed in ${cwd} (exit ${result.status ?? result.signal})`);
    }
}

/**
 * The benchmark's own check. Its exit code is not enough: it exits 0 when no framework matched, and
 * when it fails before the check starts. The verdict is the line it prints for the framework.
 */
function checkKeyed(webdriver, env, browserArgs) {
    const result = spawnSync(process.execPath, ['dist/isKeyed.js', '--framework', 'keyed/pdx', ...browserArgs], {
        cwd: webdriver, encoding: 'utf8', env: cloneEnv(env),
    });
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    const verdict = /^pdx-\S+ is keyed for 'run benchmark' and keyed for 'remove row benchmark' and keyed for 'swap rows benchmark' /m;
    if (result.status !== 0 || !verdict.test(result.stdout ?? '')) {
        throw new Error('the PDX implementation did not pass isKeyed: the run is not valid');
    }
}

function clone(dir) {
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' });
    if (head.status === 0 && head.stdout.trim() === JFB_COMMIT) return;
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    mkdirSync(dir, { recursive: true });
    run('git', ['init', '--quiet'], dir);
    run('git', ['remote', 'add', 'origin', JFB_REPO], dir);
    run('git', ['fetch', '--quiet', '--depth', '1', 'origin', JFB_COMMIT], dir);
    run('git', ['checkout', '--quiet', 'FETCH_HEAD'], dir);
}

/** Runs `work` once per clone: a stamp file records that it completed. */
function once(dir, name, work) {
    const stamp = join(dir, `.pdx-${name}`);
    if (existsSync(stamp)) return;
    work();
    writeFileSync(stamp, new Date().toISOString());
}

function installBenchmark(jfb) {
    // --legacy-peer-deps: an eslint peer conflict upstream, which touches only the benchmark's lint.
    once(jfb, 'installed', () => {
        run('npm', ['ci', '--legacy-peer-deps'], jfb);
        run('npm', ['ci', '--legacy-peer-deps'], join(jfb, 'webdriver-ts'));
        run('npm', ['run', 'compile'], join(jfb, 'webdriver-ts'));
    });
}

function buildReference(jfb, name) {
    const dir = join(jfb, 'frameworks', 'keyed', name);
    if (!existsSync(join(dir, 'package.json'))) throw new Error(`--with: frameworks/keyed/${name} does not exist in the benchmark`);
    once(dir, 'built', () => {
        run('npm', ['ci', '--legacy-peer-deps'], dir);
        run('npm', ['run', 'build-prod'], dir);
    });
}

function buildPdx(jfb) {
    run('pnpm', ['--filter', '@pdxui/core', '--filter', '@pdxui/compiler', 'run', 'build'], repo);
    const dir = join(jfb, 'frameworks', 'keyed', 'pdx');
    rmSync(join(dir, 'src'), { recursive: true, force: true });
    rmSync(join(dir, 'dist'), { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const entry of ['index.html', 'vite.config.js', 'src']) cpSync(join(here, entry), join(dir, entry), { recursive: true });
    const core = JSON.parse(readFileSync(join(repo, 'packages', 'core', 'package.json'), 'utf8'));
    const vite = JSON.parse(readFileSync(join(repo, 'packages', 'compiler', 'node_modules', 'vite', 'package.json'), 'utf8'));
    // The package the benchmark reads: its name and version label the results, customURL points at
    // the build. The two PDX packages are linked to this checkout, vite is the version it builds with.
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
        name: 'js-framework-benchmark-pdx',
        private: true,
        type: 'module',
        'js-framework-benchmark': {
            frameworkVersion: core.version,
            frameworkHomeURL: 'https://github.com/pragmatic-design/pdxui',
            customURL: '/dist',
            language: 'JavaScript',
        },
        scripts: { 'build-prod': 'vite build' },
        dependencies: { '@pdxui/core': `file:${join(repo, 'packages', 'core').replaceAll('\\', '/')}` },
        devDependencies: {
            '@pdxui/compiler': `file:${join(repo, 'packages', 'compiler').replaceAll('\\', '/')}`,
            vite: vite.version,
        },
    }, null, 2));
    run('npm', ['install', '--no-audit', '--no-fund'], dir);
    run('npm', ['run', 'build-prod'], dir);
}

function portOpen(port) {
    return new Promise(done => {
        const socket = connect({ port, host: '127.0.0.1' });
        socket.once('connect', () => { socket.destroy(); done(true); });
        socket.once('error', () => done(false));
    });
}

async function startServer(jfb, port) {
    if (await portOpen(port)) throw new Error(`port ${port} is already in use: stop what listens there, or pass --port`);
    const server = join(jfb, 'server');
    const tsx = join(server, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const child = spawn(process.execPath, [tsx, 'index.ts'], {
        cwd: server, stdio: 'inherit', detached: !WIN, env: cloneEnv({ PORT: String(port) }),
    });
    for (let waited = 0; waited < 30_000; waited += 250) {
        if (await portOpen(port)) return child;
        if (child.exitCode !== null) throw new Error(`the benchmark server exited with ${child.exitCode}`);
        await new Promise(r => setTimeout(r, 250));
    }
    stopServer(child);
    throw new Error(`the benchmark server did not listen on ${port} within 30 s`);
}

/** Stops the server and every process it started: tsx runs the server in a child of its own. */
function stopServer(child) {
    if (child.exitCode !== null) return;
    if (WIN) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGTERM');
}

async function waitClosed(port) {
    for (let waited = 0; waited < 10_000; waited += 250) {
        if (!(await portOpen(port))) return true;
        await new Promise(r => setTimeout(r, 250));
    }
    return false;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const jfb = join(tmpdir(), 'pdx-jfb', JFB_COMMIT.slice(0, 12));
    playwrightBrowsers = join(tmpdir(), 'pdx-jfb', 'playwright-browsers');
    const webdriver = join(jfb, 'webdriver-ts');
    const frameworks = ['pdx', ...options.with];
    const env = { LANG: 'en_US.UTF-8', PORT: String(options.port) };
    // The benchmark looks for Chrome in one place per platform (on Linux, /snap/bin/chromium) and
    // opens a window; a machine without either passes --chrome and --headless.
    const browserArgs = [
        ...(options.chrome ? ['--chromeBinary', options.chrome] : []),
        ...(options.headless ? ['--headless'] : []),
    ];

    step(`benchmark at ${JFB_COMMIT.slice(0, 12)} in ${jfb}`);
    clone(jfb);
    installBenchmark(jfb);
    for (const name of options.with) {
        step(`building ${name}`);
        buildReference(jfb, name);
    }
    step('building PDX from this checkout');
    buildPdx(jfb);

    step(`starting the benchmark server on ${options.port}`);
    const server = await startServer(jfb, options.port);
    let runs = [];
    let failures = [];
    let select10k = null;
    try {
        step('checking that the PDX implementation is keyed');
        checkKeyed(webdriver, env, browserArgs);
        // Each completed run's medians on disk as it completes, beside the clone (#374).
        const saveDir = join(jfb, 'pdx-runs', new Date().toISOString().replace(/[:.]/g, '-'));
        ({ runs, failures } = collectRuns({
            total: options.runs,
            saveDir,
            runOnce: (i) => {
                step(`run ${i} of ${options.runs}: ${frameworks.join(', ')}`);
                const results = join(webdriver, 'results');
                rmSync(results, { recursive: true, force: true });
                // Two invocations into one results folder: the four sub-millisecond benchmarks take more
                // samples, and --count applies to every benchmark of an invocation (#736, runs.mjs).
                for (const { benchmarks, count } of jfbInvocations(options.only)) {
                    const args = ['dist/benchmarkRunner.js', ...browserArgs, '--framework', ...frameworks.map(f => `keyed/${f}`),
                        '--benchmark', ...benchmarks, ...(count ? ['--count', String(count)] : [])];
                    run(process.execPath, args, webdriver, env);
                }
                const medians = readRun(results);
                const missing = frameworks.filter(f => !medians[f]);
                if (missing.length) throw new Error(`run ${i} has no results for ${missing.join(', ')}`);
                return { medians, means: readRun(results, 'mean') };
            },
        }));
        if (runs.length === 0) {
            throw new Error(`no run completed: ${failures.map(f => `run ${f.run}: ${f.message}`).join('; ')}`);
        }
        step('selecting a row among 10,000 (not one of the benchmark\'s results)');
        select10k = await measureSelect10k({ jfb, port: options.port, frameworks, chrome: options.chrome, headless: options.headless });
    } finally {
        step('stopping the benchmark server');
        stopServer(server);
        if (!(await waitClosed(options.port))) {
            console.error(`[bench:jfb] something still listens on port ${options.port} after the run`);
            process.exitCode = 1;
        }
    }

    console.log(`\n## js-framework-benchmark, ${runsTitle(runs.length, options.runs)} (benchmark ${JFB_COMMIT.slice(0, 12)})\n`);
    const combined = combineRuns(runs.map(r => r.medians));
    console.log(toMarkdown(combined, frameworks));
    // A failed run is reported beside the table it is missing from, and the command fails: the table
    // stands for the runs it has, and says how many.
    if (failures.length) {
        console.log(`\n${failures.length} of ${options.runs} runs failed and are not in the table:`);
        for (const f of failures) console.log(`- run ${f.run}: ${f.message}`);
        process.exitCode = 1;
    }
    if (options.json) {
        // The medians as before, at the top; the means beside them under `$means`, a key no framework
        // folder can have, so a reader of the medians alone is unchanged (#736).
        const means = combineRuns(runs.map(r => r.means));
        writeFileSync(resolve(options.json), JSON.stringify({ ...combined, $means: means }, null, 2));
        console.log(`\n[bench:jfb] the combined medians, and the means under $means, are in ${resolve(options.json)}`);
    }
    // A local check, measured on the same builds after the runs, and kept apart from them (#117).
    console.log('\n## Local check, not part of js-framework-benchmark\n');
    console.log(select10kMarkdown(select10k));
}

main().catch(error => {
    console.error(`[bench:jfb] ${error.message ?? error}`);
    process.exitCode = 1;
});
