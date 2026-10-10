#!/usr/bin/env node
// pnpm bench:jfb [--with vanillajs svelte …] [--runs N] [--only 01_,07_] [--port 8080]
//
// Runs js-framework-benchmark with PDX and the reference frameworks in ONE run, and prints a markdown
// table of the medians with their ratio to vanillajs. Totals vary between runs on the same machine, so
// frameworks are compared only within a run; --runs N repeats the whole run and keeps the median of
// the medians.
//
// The benchmark is cloned at a pinned commit into the OS temp directory, never into this repository,
// and its dependencies stay there. The clone is reused by the next run; delete the folder to start
// clean. PDX is built from this checkout: core and compiler first, then the app in this folder.

import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { combineRuns, readRun, toMarkdown } from './summarize.mjs';

const JFB_REPO = 'https://github.com/krausest/js-framework-benchmark.git';
// The commit the procedure was first run against by hand (2026-10-10). Moving it is a change to
// review: a new commit can change the benchmarks, the driver or the reference implementations.
const JFB_COMMIT = 'bf894b681fb56433ccb6efb4a3c93e35eda2b20d';
const DEFAULT_WITH = ['vanillajs', 'svelte', 'solid', 'lit', 'vue'];
const WIN = process.platform === 'win32';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');

function parseArgs(argv) {
    const options = { with: DEFAULT_WITH, runs: 1, only: [], port: 8080 };
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

/**
 * The environment of a command run in the clone. `pnpm bench:jfb` exports pnpm's own settings as
 * `npm_config_*` (`dir`, `verify-deps-before-run`, …); npm would read them as its own. The user's
 * `.npmrc` still applies: npm reads it itself.
 */
function cloneEnv(extra = {}) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^npm_config_/i.test(k)));
    return { ...env, ...extra };
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
function checkKeyed(webdriver, env) {
    const result = spawnSync(process.execPath, ['dist/isKeyed.js', '--framework', 'keyed/pdx'], {
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
    const webdriver = join(jfb, 'webdriver-ts');
    const frameworks = ['pdx', ...options.with];
    const env = { LANG: 'en_US.UTF-8', PORT: String(options.port) };

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
    const runs = [];
    try {
        step('checking that the PDX implementation is keyed');
        checkKeyed(webdriver, env);
        for (let i = 1; i <= options.runs; i++) {
            step(`run ${i} of ${options.runs}: ${frameworks.join(', ')}`);
            const results = join(webdriver, 'results');
            rmSync(results, { recursive: true, force: true });
            const args = ['dist/benchmarkRunner.js', '--framework', ...frameworks.map(f => `keyed/${f}`)];
            if (options.only.length) args.push('--benchmark', ...options.only);
            run(process.execPath, args, webdriver, env);
            const measured = readRun(results);
            const missing = frameworks.filter(f => !measured[f]);
            if (missing.length) throw new Error(`run ${i} has no results for ${missing.join(', ')}`);
            runs.push(measured);
        }
    } finally {
        step('stopping the benchmark server');
        stopServer(server);
        if (!(await waitClosed(options.port))) {
            console.error(`[bench:jfb] something still listens on port ${options.port} after the run`);
            process.exitCode = 1;
        }
    }

    const title = options.runs > 1 ? `median of ${options.runs} runs` : 'one run';
    console.log(`\n## js-framework-benchmark, ${title} (benchmark ${JFB_COMMIT.slice(0, 12)})\n`);
    console.log(toMarkdown(combineRuns(runs), frameworks));
}

main().catch(error => {
    console.error(`[bench:jfb] ${error.message ?? error}`);
    process.exitCode = 1;
});
