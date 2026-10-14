#!/usr/bin/env node
// node scripts/time-budgets/run.mjs [--runs N] [--only check,analyze,build]
//
// The project-wide passes a developer waits on, timed against the showcase (#247): `pdx check`,
// `pdx analyze`, and a cold `pdx build` — the showcase's `dist/` and `node_modules/.vite` removed
// before each run. Each runs N times (3 by default) through the BUILT CLI, `packages/cli/dist`, so
// run `pnpm build` first. The median of each is compared with its budget in budgets.json, and the
// script exits non-zero when a median is over its budget or a command fails.
//
// A budget of null is not measured against: it prints the median, so the first CI run can set it.
// A budget is the first CI measurement + 20%, rounded up to 100 ms. It is raised only in a commit
// that says why the pass got slower, and lowered when a measurement is more than 20% under it.

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const showcase = join(repo, 'packages', 'showcase');
const cli = join(repo, 'packages', 'cli', 'dist', 'index.mjs');
const COMMANDS = ['check', 'analyze', 'build'];

function parseArgs(argv) {
    const options = { runs: 3, only: COMMANDS };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--runs') options.runs = Number(argv[++i]);
        else if (argv[i] === '--only') options.only = (argv[++i] ?? '').split(',').filter(Boolean);
        else throw new Error(`unknown argument ${argv[i]}`);
    }
    if (!Number.isInteger(options.runs) || options.runs < 1) throw new Error('--runs takes a positive integer');
    for (const c of options.only) if (!COMMANDS.includes(c)) throw new Error(`--only: "${c}" is not one of ${COMMANDS.join(', ')}`);
    return options;
}

/** Remove what makes a build warm: the output and Vite's dependency cache. */
function coldStart() {
    rmSync(join(showcase, 'dist'), { recursive: true, force: true });
    rmSync(join(showcase, 'node_modules', '.vite'), { recursive: true, force: true });
}

/** One run of `pdx <command>` in the showcase: its wall time, or the output that says why it failed. */
function runOnce(command) {
    if (command === 'build') coldStart();
    const start = performance.now();
    const r = spawnSync(process.execPath, [cli, command], { cwd: showcase, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
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
    if (!existsSync(cli)) throw new Error(`no built CLI at ${cli}: run \`pnpm build\` first`);
    const budgets = JSON.parse(readFileSync(join(here, 'budgets.json'), 'utf8'));

    const rows = [];
    let failed = false;
    for (const command of options.only) {
        const times = [];
        for (let i = 0; i < options.runs; i++) {
            const run = runOnce(command);
            if (run.failed) {
                console.error(`pdx ${command} failed on run ${i + 1}:\n${run.failed}`);
                failed = true;
                break;
            }
            times.push(run.ms);
            console.log(`pdx ${command} run ${i + 1}: ${Math.round(run.ms)} ms`);
        }
        if (times.length < options.runs) {
            rows.push({ command, median: null, budget: budgets[command]?.ms ?? null, verdict: 'failed' });
            continue;
        }
        const m = Math.round(median(times));
        const budget = budgets[command]?.ms ?? null;
        const over = budget !== null && m > budget;
        if (over) failed = true;
        rows.push({ command, median: m, budget, verdict: budget === null ? 'no budget yet' : over ? 'OVER' : 'ok', times });
    }

    const table = [
        '| command | runs (ms) | median (ms) | budget (ms) | |',
        '|---|---|---|---|---|',
        ...rows.map((r) => `| pdx ${r.command} | ${(r.times ?? []).map(Math.round).join(', ')} | ${r.median ?? '—'} | ${r.budget ?? '—'} | ${r.verdict} |`),
    ].join('\n');
    console.log(`\n${table}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Time budgets\n\n${table}\n`);
    if (failed) {
        console.error('A pass is over its budget or failed. A budget is raised only in a commit that says why the pass got slower.');
        process.exit(1);
    }
}

main();
