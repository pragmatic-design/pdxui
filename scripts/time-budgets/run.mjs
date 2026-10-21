#!/usr/bin/env node
// node scripts/time-budgets/run.mjs --base <dir> [--runs N] [--only check,analyze,build]
//
// The project-wide passes a developer waits on, timed against the showcase (#247): `pdx check`,
// `pdx analyze`, and a cold `pdx build` — the showcase's `dist/` and `node_modules/.vite` removed
// before each run. Each runs through the BUILT CLI, `packages/cli/dist`, so run `pnpm build` first.
//
// A pass is judged against `main`, not against a number of milliseconds (#593). `--base` is a built
// checkout of `main` (installed and `pnpm build`-ed); each pass runs N times (3 by default) in both
// trees, alternating, on the same machine, and the median on this tree over the median on `main` is
// held to the pass's `maxRatio` in budgets.json (verdict.mjs). An absolute budget judged the runner:
// a runner 19-24% slower failed a change that `pdx` does not read. The script exits non-zero when a
// ratio is over its budget or a command fails. Without `--base` it only prints this tree's medians,
// and in CI (`CI` set) it refuses to run without one.
//
// A `maxRatio` is raised only in a commit that says why the pass got slower.

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judge } from './verdict.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const COMMANDS = ['check', 'analyze', 'build'];

function parseArgs(argv) {
    const options = { runs: 3, only: COMMANDS, base: null };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--runs') options.runs = Number(argv[++i]);
        else if (argv[i] === '--only') options.only = (argv[++i] ?? '').split(',').filter(Boolean);
        else if (argv[i] === '--base') options.base = resolve(argv[++i] ?? '');
        else throw new Error(`unknown argument ${argv[i]}`);
    }
    if (!Number.isInteger(options.runs) || options.runs < 1) throw new Error('--runs takes a positive integer');
    for (const c of options.only) if (!COMMANDS.includes(c)) throw new Error(`--only: "${c}" is not one of ${COMMANDS.join(', ')}`);
    return options;
}

/** A checkout the passes run in: its showcase and its built CLI. */
function tree(root) {
    const t = { root, showcase: join(root, 'packages', 'showcase'), cli: join(root, 'packages', 'cli', 'dist', 'index.mjs') };
    if (!existsSync(t.cli)) throw new Error(`no built CLI at ${t.cli}: run \`pnpm build\` in ${root} first`);
    return t;
}

/** Remove what makes a build warm: the output and Vite's dependency cache. */
function coldStart(t) {
    rmSync(join(t.showcase, 'dist'), { recursive: true, force: true });
    rmSync(join(t.showcase, 'node_modules', '.vite'), { recursive: true, force: true });
}

/**
 * Where `pdx analyze` writes its manifest: a temporary folder. Its default is `pdx-manifest.json` in
 * the working directory, and a run here left one, untracked, in the showcase.
 */
const scratch = mkdtempSync(join(tmpdir(), 'pdx-time-budgets-'));
const ARGS = { analyze: ['--out', join(scratch, 'pdx-manifest.json')] };

/** One run of `pdx <command>` in a tree's showcase: its wall time, or the output that says why it failed. */
function runOnce(t, command) {
    if (command === 'build') coldStart(t);
    const start = performance.now();
    const r = spawnSync(process.execPath, [t.cli, command, ...(ARGS[command] ?? [])], { cwd: t.showcase, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const ms = performance.now() - start;
    if (r.status !== 0) {
        const output = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().split('\n').slice(-40).join('\n');
        return { ms, failed: `exit ${r.status}${r.error ? ` (${r.error.message})` : ''}\n${output}` };
    }
    return { ms };
}

const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

function main() {
    const options = parseArgs(process.argv.slice(2));
    if (!options.base && process.env.CI) throw new Error('--base is required in CI: a pass is judged against main on the same runner (#593)');
    const branch = tree(repo);
    const base = options.base ? tree(options.base) : null;
    const budgets = JSON.parse(readFileSync(join(here, 'budgets.json'), 'utf8'));

    const medians = { branch: {}, base: {} };
    const times = {};
    let failed = false;
    for (const command of options.only) {
        times[command] = { branch: [], base: [] };
        // Alternating, so a stretch where the machine is slower falls on both sides; and which side
        // goes first alternates too, since the first run of a pair warms the files both trees share
        // (pnpm's store is linked into both).
        for (let i = 0; i < options.runs && !failed; i++) {
            const pair = i % 2 === 0 ? [['base', base], ['branch', branch]] : [['branch', branch], ['base', base]];
            for (const [side, t] of base ? pair : [['branch', branch]]) {
                const run = runOnce(t, command);
                if (run.failed) {
                    console.error(`pdx ${command} failed on ${side === 'base' ? 'main' : 'this tree'}, run ${i + 1}:\n${run.failed}`);
                    failed = true;
                    break;
                }
                times[command][side].push(run.ms);
                console.log(`pdx ${command} ${side === 'base' ? 'main' : 'this tree'} run ${i + 1}: ${Math.round(run.ms)} ms`);
            }
        }
        if (times[command].branch.length === options.runs) medians.branch[command] = Math.round(median(times[command].branch));
        if (times[command].base.length === options.runs) medians.base[command] = Math.round(median(times[command].base));
    }

    const rows = judge(medians.branch, medians.base, budgets);
    if (rows.some((r) => r.verdict === 'OVER')) failed = true;
    const runs = (xs) => xs.map(Math.round).join(', ');
    const table = [
        '| command | this tree (ms) | main (ms) | ratio | max ratio | |',
        '|---|---|---|---|---|---|',
        ...rows.map((r) => `| pdx ${r.command} | ${runs(times[r.command].branch)} → ${r.branch} | ${r.base === null ? '—' : `${runs(times[r.command].base)} → ${r.base}`} | ${r.ratio ?? '—'} | ${r.maxRatio ?? '—'} | ${r.verdict} |`),
    ].join('\n');
    console.log(`\n${table}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Time budgets\n\n${table}\n`);
    if (failed) {
        console.error('A pass is over its ratio to main, or failed. A maxRatio is raised only in a commit that says why the pass got slower.');
        process.exit(1);
    }
}

main();
