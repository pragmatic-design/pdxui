// Reads the result files of one js-framework-benchmark run and turns one or more runs into a
// markdown table: per benchmark, each framework's median and its ratio to vanillajs.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASELINE = 'vanillajs';

/** `pdx-v1.0.0-alpha.1-keyed` → `pdx`, `vanillajs-keyed` → `vanillajs`. */
export function frameworkName(resultName) {
    return resultName.replace(/-keyed$/, '').replace(/-v\d[^-]*(-[a-z]+\.\d+)?$/, '');
}

/**
 * One run's results: `{ [framework]: { [metric]: median } }`. A CPU benchmark gives two metrics,
 * its total (`07_create10k`) and its script time (`07_create10k script`); memory and size give one.
 */
export function readRun(resultsDir) {
    const run = {};
    for (const file of readdirSync(resultsDir)) {
        if (!file.endsWith('.json')) continue;
        const result = JSON.parse(readFileSync(join(resultsDir, file), 'utf8'));
        const metrics = (run[frameworkName(result.framework)] ??= {});
        const values = result.values ?? {};
        const main = values.total ?? values.DEFAULT;
        if (main) metrics[result.benchmark] = main.median;
        if (values.script) metrics[`${result.benchmark} script`] = values.script.median;
    }
    return run;
}

function median(xs) {
    const sorted = [...xs].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Several runs → the median of each framework's per-run medians. */
export function combineRuns(runs) {
    const combined = {};
    for (const run of runs) {
        for (const [framework, metrics] of Object.entries(run)) {
            for (const [metric, value] of Object.entries(metrics)) {
                ((combined[framework] ??= {})[metric] ??= []).push(value);
            }
        }
    }
    for (const metrics of Object.values(combined)) {
        for (const metric of Object.keys(metrics)) metrics[metric] = median(metrics[metric]);
    }
    return combined;
}

const UNITS = { cpu: 'ms', memory: 'MB', size: 'KB', paint: 'ms' };

function unitOf(metric) {
    const id = Number(metric.slice(0, 2));
    if (id < 20) return UNITS.cpu;
    if (id < 40) return UNITS.memory;
    return metric.startsWith('43_') ? UNITS.paint : UNITS.size;
}

function format(value) {
    return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
}

function geometricMean(ratios) {
    return Math.exp(ratios.reduce((sum, r) => sum + Math.log(r), 0) / ratios.length);
}

/**
 * The table. Columns are vanillajs, then the frameworks in `order`; a framework that has no result
 * for a metric shows `—`. The last two rows are the geometric means of the CPU ratios to vanillajs,
 * total and script, over the benchmarks every framework has.
 */
export function toMarkdown(data, order) {
    const frameworks = [BASELINE, ...order.filter(f => f !== BASELINE)].filter(f => data[f]);
    const metrics = [...new Set(frameworks.flatMap(f => Object.keys(data[f])))].sort();
    const lines = [
        `| benchmark | ${frameworks.join(' | ')} |`,
        `|---|${frameworks.map(() => '---').join('|')}|`,
    ];
    for (const metric of metrics) {
        const base = data[BASELINE]?.[metric];
        const cells = frameworks.map(f => {
            const value = data[f][metric];
            if (value === undefined) return '—';
            return base ? `${format(value)} (${(value / base).toFixed(2)}×)` : format(value);
        });
        lines.push(`| ${metric} (${unitOf(metric)}) | ${cells.join(' | ')} |`);
    }
    for (const [label, suffix] of [['CPU total', ''], ['CPU script', ' script']]) {
        const cpu = metrics.filter(m => /^0\d_/.test(m) && (suffix ? m.endsWith(suffix) : !m.endsWith(' script')));
        const cells = frameworks.map(f => {
            const ratios = cpu.map(m => data[f][m] / data[BASELINE]?.[m]).filter(r => Number.isFinite(r) && r > 0);
            return ratios.length === cpu.length && cpu.length ? `${geometricMean(ratios).toFixed(2)}×` : '—';
        });
        lines.push(`| **${label}, geometric mean of the ratios** | ${cells.join(' | ')} |`);
    }
    return lines.join('\n');
}
