// node --test scripts/bench-jfb/summarize.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { frameworkName, readRun, combineRuns, toMarkdown } from './summarize.mjs';

test('frameworkName drops the version and the keyed suffix', () => {
    assert.equal(frameworkName('pdx-v1.0.0-alpha.1-keyed'), 'pdx');
    assert.equal(frameworkName('react-hooks-v19.2.0-keyed'), 'react-hooks');
    assert.equal(frameworkName('svelte-v5.42.1-keyed'), 'svelte');
    assert.equal(frameworkName('vanillajs-keyed'), 'vanillajs');
});

test('readRun takes the total and the script median of a CPU result, the DEFAULT of the others', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jfb-summary-'));
    try {
        writeFileSync(join(dir, 'pdx-v1.0.0-alpha.1-keyed_07_create10k.json'), JSON.stringify({
            framework: 'pdx-v1.0.0-alpha.1-keyed', benchmark: '07_create10k', type: 'cpu',
            values: { total: { median: 627 }, script: { median: 149 }, paint: { median: 472 } },
        }));
        writeFileSync(join(dir, 'pdx-v1.0.0-alpha.1-keyed_42_size-compressed.json'), JSON.stringify({
            framework: 'pdx-v1.0.0-alpha.1-keyed', benchmark: '42_size-compressed', type: 'size',
            values: { DEFAULT: { median: 13 } },
        }));
        writeFileSync(join(dir, 'notes.txt'), 'not a result');
        assert.deepEqual(readRun(dir), {
            pdx: { '07_create10k': 627, '07_create10k script': 149, '42_size-compressed': 13 },
        });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('combineRuns keeps the median of the per-run medians', () => {
    const runs = [
        { pdx: { '01_run1k': 50 } },
        { pdx: { '01_run1k': 90 } },
        { pdx: { '01_run1k': 60 } },
    ];
    assert.deepEqual(combineRuns(runs), { pdx: { '01_run1k': 60 } });
    assert.deepEqual(combineRuns(runs.slice(0, 2)), { pdx: { '01_run1k': 70 } });
});

test('toMarkdown puts vanillajs first, gives each cell its ratio and the CPU geometric means', () => {
    const table = toMarkdown({
        pdx: { '01_run1k': 80, '01_run1k script': 20, '02_replace1k': 90, '22_run-memory': 4.8 },
        vanillajs: { '01_run1k': 40, '01_run1k script': 10, '02_replace1k': 45, '22_run-memory': 2.4 },
    }, ['pdx']).split('\n');
    assert.equal(table[0], '| benchmark | vanillajs | pdx |');
    assert.ok(table.includes('| 01_run1k (ms) | 40.0 (1.00×) | 80.0 (2.00×) |'));
    assert.ok(table.includes('| 01_run1k script (ms) | 10.0 (1.00×) | 20.0 (2.00×) |'));
    assert.ok(table.includes('| 22_run-memory (MB) | 2.4 (1.00×) | 4.8 (2.00×) |'));
    assert.ok(table.includes('| **CPU total, geometric mean of the ratios** | 1.00× | 2.00× |'));
    assert.ok(table.includes('| **CPU script, geometric mean of the ratios** | 1.00× | 2.00× |'));
});

test('toMarkdown shows a missing result as a dash, and no geometric mean for an incomplete column', () => {
    const table = toMarkdown({
        pdx: { '01_run1k': 80 },
        vanillajs: { '01_run1k': 40, '02_replace1k': 45 },
    }, ['pdx']).split('\n');
    assert.ok(table.includes('| 02_replace1k (ms) | 45.0 (1.00×) | — |'));
    assert.ok(table.includes('| **CPU total, geometric mean of the ratios** | 1.00× | — |'));
});
