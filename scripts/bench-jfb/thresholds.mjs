#!/usr/bin/env node
// node scripts/bench-jfb/thresholds.mjs <bench.json>
//
// Holds PDX to thresholds over a js-framework-benchmark run (#248). `<bench.json>` is what
// `pnpm bench:jfb --json` writes: the combined medians of every framework of the run, and since #736
// the combined means of the samples under `$means`.
//
// - Script times are held as the RATIO of PDX to vanillajs in the same run: a ratio carries across
//   machines, a millisecond does not.
// - A ratio threshold is a number, held against the ratio of the medians, or `{ "max": …, "of": "mean" }`,
//   held against the ratio of the means (#736). Each says the statistic it was derived on: the means
//   are steadier on a sub-millisecond script, and a threshold moves to them once the nightlies that
//   recorded them are enough to derive it (bench-replay.mjs measures that).
// - Memory is held in MB, absolute.
// - A threshold of null is reported and not held: that is how the first nightly measures. A metric
//   the run does not have fails, whatever its threshold, rather than passing in silence.
//
// The thresholds are in thresholds.json: each is the measured median plus 15%, the highest of the
// first three runs, since a ratio over a vanillajs script of a millisecond or two moved by up to 40%
// between them. One is lowered when a render-path
// change improves the number, never raised without a commit that says why; a night that goes red
// on an unchanged tree is the signal that a margin is too narrow. PDX's absolute numbers are printed beside the specification's targets on every run, so the
// distance to them stays visible (docs/language/beta/performance.md, O1/O2 and «Bounded memory»).

import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASELINE = 'vanillajs';
const SUBJECT = 'pdx';

/** The specification's targets, printed beside PDX's absolute numbers. */
const TARGETS = [
    { metric: '07_create10k script', label: 'create 10,000 rows, script', target: '≤ 75 ms, then ≤ 45 ms (O1)', unit: 'ms' },
    { metric: '22_run-memory', label: 'memory after creating 1,000 rows', target: '≤ 3.5 MB per 1,000 rows', unit: 'MB' },
];

/**
 * Check a run against thresholds. `data` is `{ [framework]: { [metric]: median }, $means?: { [framework]:
 * { [metric]: mean } } }`; `thresholds` is `{ ratio: { [metric]: max | null | { max, of } }, memoryMB:
 * { [metric]: max | null } }`. Returns the rows to print and the failures, each naming its metric.
 */
export function checkThresholds(data, thresholds) {
    const rows = [];
    const failures = [];

    for (const [metric, entry] of Object.entries(thresholds.ratio ?? {})) {
        const { max, of } = entry !== null && typeof entry === 'object' ? entry : { max: entry, of: 'median' };
        // The means are their own table: a threshold of the means never falls back to the medians.
        const table = of === 'mean' ? data.$means ?? {} : data;
        const subject = table[SUBJECT] ?? {};
        const base = table[BASELINE] ?? {};
        const value = subject[metric] !== undefined && base[metric] ? subject[metric] / base[metric] : undefined;
        rows.push({ ...row('ratio', metric, value, max, failures, `${SUBJECT}/${BASELINE}, ${of}s`), of });
    }
    const subject = data[SUBJECT] ?? {};
    for (const [metric, threshold] of Object.entries(thresholds.memoryMB ?? {})) {
        rows.push(row('memoryMB', metric, subject[metric], threshold, failures, 'MB'));
    }
    return { rows, failures };
}

function row(kind, metric, value, threshold, failures, unit) {
    if (value === undefined || !Number.isFinite(value)) {
        failures.push(`${metric}: not in the run (${kind === 'ratio' ? `needs ${SUBJECT} and ${BASELINE}` : SUBJECT})`);
        return { kind, metric, value: undefined, threshold, ok: false };
    }
    const ok = threshold === null || value <= threshold;
    if (!ok) failures.push(`${metric}: ${value.toFixed(2)} ${unit}, over its threshold of ${threshold}`);
    return { kind, metric, value, threshold, ok };
}

function markdown(rows, data) {
    const lines = [
        '| metric | measured | threshold | |',
        '|---|---|---|---|',
        ...rows.map((r) => `| ${r.metric} (${r.kind === 'ratio' ? `× vanillajs, ${r.of}s` : 'MB'}) | ${r.value === undefined ? '—' : r.value.toFixed(2)} | ${r.threshold ?? 'not held yet'} | ${r.ok ? 'ok' : 'FAIL'} |`),
        '',
        '| PDX, absolute | measured | the specification |',
        '|---|---|---|',
        ...TARGETS.map((t) => {
            const v = data[SUBJECT]?.[t.metric];
            return `| ${t.label} | ${v === undefined ? '—' : `${v.toFixed(1)} ${t.unit}`} | ${t.target} |`;
        }),
    ];
    return lines.join('\n');
}

function main() {
    const file = process.argv[2];
    if (!file) throw new Error('usage: node scripts/bench-jfb/thresholds.mjs <bench.json>');
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const here = dirname(fileURLToPath(import.meta.url));
    const thresholds = JSON.parse(readFileSync(join(here, 'thresholds.json'), 'utf8'));
    const { rows, failures } = checkThresholds(data, thresholds);
    const table = markdown(rows, data);
    console.log(`\n${table}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## js-framework-benchmark thresholds\n\n${table}\n`);
    if (failures.length) {
        for (const f of failures) console.error(`over: ${f}`);
        process.exit(1);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
