#!/usr/bin/env node
// node scripts/bench-jfb/bench-replay.mjs <folder> [--metric "04_select1k script"] [--groups a,b]
//
// How noisy a threshold's statistic is, over runs already made (#736). The noise of a rule is the
// pooled standard deviation of ln(ratio) within groups of runs on the same code: the A/B rounds of one
// ref, or the nightlies of one commit. The lower it is, the smaller a regression the threshold can
// catch without going red on an unchanged tree. It is how a threshold is moved from the medians to the
// means, and how a trimmed mean would be judged if the means prove unsteady.
//
// <folder> holds either:
// - jfb results folders named `<group>-r<n>` (a same-runner A/B: each one round of one ref), read with
//   the benchmark's median and mean of the samples; or
// - bench.json files named `<group>-<anything>.json` (bench-all.mjs writes the nightlies as
//   `<commit>-<run id>.json`), whose medians are at the top and whose means, when the run recorded
//   them, are under `$means`.
// --groups keeps only the groups named.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRun } from './summarize.mjs';

const SUBJECT = 'pdx';
const BASELINE = 'vanillajs';

/** PDX's ratio to vanillajs for `metric` in one table `{ [framework]: { [metric]: value } }`, or undefined. */
export function ratioOf(table, metric) {
    const s = table?.[SUBJECT]?.[metric];
    const b = table?.[BASELINE]?.[metric];
    return s !== undefined && b ? s / b : undefined;
}

/**
 * The pooled standard deviation of ln(x) within groups: √(Σ (ln x − the group's mean)² / (N − G)),
 * over the groups with at least two values. Undefined when no group has two.
 */
export function pooledSdLn(groups) {
    let squares = 0;
    let n = 0;
    let g = 0;
    for (const values of groups) {
        const logs = values.filter((v) => v > 0 && Number.isFinite(v)).map(Math.log);
        if (logs.length < 2) continue;
        const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
        squares += logs.reduce((sum, x) => sum + (x - mean) ** 2, 0);
        n += logs.length;
        g += 1;
    }
    return n > g ? Math.sqrt(squares / (n - g)) : undefined;
}

/** `main-r3` → `main`; `679b6de8-40838090544.json` → `679b6de8`. */
export function groupOf(name) {
    return name.replace(/\.json$/, '').replace(/-r\d+$/, '').replace(/-\d+$/, '');
}

/** Each run of the folder as `{ group, median, mean }`, the two tables of one run (mean may be absent). */
function readFolder(folder) {
    const runs = [];
    for (const name of readdirSync(folder).sort()) {
        const path = join(folder, name);
        if (statSync(path).isDirectory()) {
            if (!/-r\d+$/.test(name)) continue;
            runs.push({ group: groupOf(name), median: readRun(path), mean: readRun(path, 'mean') });
        } else if (name.endsWith('.json')) {
            const data = JSON.parse(readFileSync(path, 'utf8'));
            if (!data[SUBJECT]) continue;
            const { $means, ...medians } = data;
            runs.push({ group: groupOf(name), median: medians, mean: $means });
        }
    }
    return runs;
}

/** One row per metric and statistic: how many runs and groups, and the pooled SD of ln(ratio). */
export function replay(runs, metrics) {
    const rows = [];
    for (const metric of metrics) {
        for (const stat of ['median', 'mean']) {
            const byGroup = new Map();
            for (const run of runs) {
                const r = ratioOf(run[stat], metric);
                if (r === undefined) continue;
                (byGroup.get(run.group) ?? byGroup.set(run.group, []).get(run.group)).push(r);
            }
            const groups = [...byGroup.values()];
            rows.push({ metric, stat, runs: groups.flat().length, groups: groups.length, sd: pooledSdLn(groups) });
        }
    }
    return rows;
}

function main() {
    const argv = process.argv.slice(2);
    let folder = null;
    let metricArg = null;
    let only = null;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--metric') metricArg = argv[++i];
        else if (argv[i] === '--groups') only = (argv[++i] ?? '').split(',').filter(Boolean);
        else if (!folder) folder = argv[i];
        else throw new Error(`unknown argument ${argv[i]}`);
    }
    if (!folder) throw new Error('usage: node scripts/bench-jfb/bench-replay.mjs <folder> [--metric "<metric>"] [--groups a,b]');
    const runs = readFolder(folder).filter((r) => !only || only.includes(r.group));
    const metrics = metricArg ? [metricArg]
        : [...new Set(runs.flatMap((r) => Object.keys(r.median?.[SUBJECT] ?? {})))].filter((m) => /^0\d_.* script$/.test(m)).sort();
    console.log('| metric | statistic | runs | groups | pooled SD of ln(ratio) |');
    console.log('|---|---|---|---|---|');
    for (const r of replay(runs, metrics)) {
        console.log(`| ${r.metric} | ${r.stat} | ${r.runs} | ${r.groups} | ${r.sd === undefined ? '—' : r.sd.toFixed(3)} |`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
