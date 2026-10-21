// scripts/time-budgets/verdict.mjs: a pass is judged by its median on the branch over its median on
// `main`, both timed on the same runner (#593). An absolute budget judged the runner: #592 changed
// nothing `pdx` reads and failed on a runner 19-24% slower. The cases replay that issue's numbers.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { judge } from '../../../scripts/time-budgets/verdict.mjs';

const RUN = join(__dirname, '..', '..', '..', 'scripts', 'time-budgets', 'run.mjs');

const budgets = { check: { maxRatio: 1.15 }, analyze: { maxRatio: 1.15 }, build: { maxRatio: 1.15 } };

describe('time budgets', () => {
    it('an unchanged tree on a slow runner passes: both sides are slow alike', () => {
        // #592's runner, eastus: 2975, 987 and 8479 ms, over the old 2700 / 7500 ms budgets. Main on
        // the same runner takes the same.
        const rows = judge({ check: 2975, analyze: 987, build: 8479 }, { check: 2950, analyze: 1001, build: 8390 }, budgets);
        expect(rows.map((r) => r.verdict)).toEqual(['ok', 'ok', 'ok']);
    });

    it('a branch made 30% slower fails, on a fast runner as on a slow one', () => {
        for (const base of [{ check: 2501, analyze: 830, build: 6827 }, { check: 2975, analyze: 987, build: 8479 }]) {
            const slower = Object.fromEntries(Object.entries(base).map(([k, ms]) => [k, Math.round(ms * 1.3)]));
            expect(judge(slower, base, budgets).map((r) => r.verdict)).toEqual(['OVER', 'OVER', 'OVER']);
        }
    });

    it('reports the ratio, and a pass with no base or no budget is not judged', () => {
        const [row] = judge({ check: 1100 }, { check: 1000 }, budgets);
        expect(row).toMatchObject({ command: 'check', branch: 1100, base: 1000, ratio: 1.1, maxRatio: 1.15, verdict: 'ok' });
        expect(judge({ check: 1100 }, {}, budgets)[0].verdict).toBe('no base');
        expect(judge({ check: 1100 }, { check: 1000 }, {})[0].verdict).toBe('no budget yet');
    });

    it('in CI the runner refuses to time without main to compare with, before timing anything', () => {
        const r = spawnSync(process.execPath, [RUN, '--only', 'analyze'], { encoding: 'utf8', env: { ...process.env, CI: '1' } });
        expect(r.status).not.toBe(0);
        expect(r.stderr).toContain('--base is required in CI');
        expect(r.stdout).not.toContain('run 1');
    });
});
