// pdx-chart must read a real DataSource's reactive `data` signal.
// createDataSource exposes `data` (a signal) and has NO `rows` / `subscribe`: a chart that looked
// for those would never receive rows. We mock the canvas engine (happy-dom has no 2D
// context) and assert the chart reads `source.data`.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';

// Mock the canvas engine — we only care that the chart pulls rows from the source.
const updateCalls: unknown[] = [];
vi.mock('../../src/chart/core/engine', () => ({
    ChartEngine: class {
        update(cfg: unknown) { updateCalls.push(cfg); }
        destroy() {}
    },
}));

import '../../src/chart/pdx-chart';

describe('pdx-chart binds to a DataSource `data` signal', () => {
    beforeEach(() => { cleanup(); updateCalls.length = 0; });

    it('reads source.data (the DataSource signal), feeding rows into the engine', async () => {
        const rows = [{ x: 'A', y: 1 }, { x: 'B', y: 2 }];
        const dataFn = vi.fn(() => rows); // stand-in for the DataSource `data` ReadonlySignal

        const el = document.createElement('pdx-chart');
        el.setAttribute('type', 'bar');
        document.body.appendChild(el);
        await tick(50);

        // Attach a DataSource-shaped object (has `data`, no `rows`/`subscribe`).
        (el as any).source = { data: dataFn, setFilter() {} };
        await tick(50);

        // Old code checked src.rows/src.subscribe only → never touched src.data.
        expect(dataFn).toHaveBeenCalled();

        // And the rows reached the engine.
        const cfgWithData = updateCalls.find((c: any) => Array.isArray(c?.data) && c.data.length === 2);
        expect(cfgWithData).toBeTruthy();
    });
});
