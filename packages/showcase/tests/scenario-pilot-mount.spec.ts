/**
 * A component compiled from `.pdx` mounts as fast as its TypeScript version, on a production build
 * (#685; packages/ui/PILOT.md, «Measurements»).
 *
 * The pilot rewrote three components in `.pdx` and measured them slower, on the dev server: 1.4× the
 * switch, 2.5× the select, 2.1–2.6× the filter popover. Here the same page is built twice
 * (`scenarios/pilot-mount/`, `scenarios-build.ts`): `pilot-ts` with the library's TypeScript
 * components, `pilot-pdx` with the `.pdx` rewrites in their place. Each row mounts 100 of a component
 * (the popover: 100 contents) and waits until each has drawn what it is measured by.
 *
 * The two builds are timed in one run, on one machine, alternating: a machine twice as slow is twice
 * as slow on both sides, so the ratio is what is held, not milliseconds. After a warm-up that brings
 * both to optimised code, each side's time is the median of its samples, and `.pdx` over TypeScript is
 * held to its row's ratio.
 *
 * Measured 2026-11-03 on a production build: the switch 0.74×, the select 0.92× — the 1.4× and 2.5×
 * the pilot saw were the dev server's. The filter popover's two conditions were 1.85×: their editors
 * are in an `@defer (immediate)`, and every popover rendered them a flush after its append, into the
 * live page, though the code had arrived with the first. A `@defer`'s code is now one loader per
 * module (core's `deferCode`), and a block whose code has arrived renders in its own task: 1.06–1.14×.
 *
 * The value list is not within 1.2×, and why is in its row.
 *
 * A ratio also rises when the TypeScript side gets faster: #910 made the library's mount faster on
 * both sides, the TypeScript popover more, and the conditions read 1.3–1.4× though the `.pdx` side
 * had got faster too. So a row over its bound passes when the `.pdx` side itself is no slower than
 * on `main` (#919). It is measured over a calibration beside it (`__calibrate`, the same DOM work as
 * `component-mount`'s), against what `tools/perf/pilot-baseline.mjs` recorded from a build of `main` in
 * `scenario-pilot-mount.json`, with PDX_SLACK on top. A row fails when the ratio is over its bound AND
 * the `.pdx` side has become slower.
 */
import { test, expect, type Page } from './fixture';
import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { scenarioDist } from './scenarios-build';

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

/** A static server over a scenario's build: module scripts do not load from file://. */
function serve(dir: string): Promise<{ url: string; server: Server }> {
    const server = createServer((req, res) => {
        const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]));
        const file = join(dir, path === '/' || path === '\\' ? 'index.html' : path);
        if (!file.startsWith(dir) || !existsSync(file)) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
        resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, server });
    }));
}

/** What #685 holds a component to: its `.pdx` mount within 1.2× of the TypeScript one. */
const COMPONENT_RATIO = 1.2;

/**
 * The `.pdx` side's recorded measurements on `main`, and the sampling both this spec and the tool use:
 * 100 instances, 10 warm-up mounts, then 61 samples per side. 61, from 21 (#911): under load the
 * median of 21 read the value list from 1.55 to 2.04× in eight runs of this procedure (sd 0.176) and
 * failed its bound with nothing changed; the median of 61 read 1.69–1.89× (sd 0.064). The conditions
 * went from sd 0.057 to 0.036. The bounds did not move: the measurement got steadier.
 */
const RECORDED = JSON.parse(readFileSync(resolve(fileURLToPath(import.meta.url), '..', 'scenario-pilot-mount.json'), 'utf8')) as {
    units: number; instances: number; warmUp: number; samples: number; measured: string; pdx: Record<string, number>;
};
const INSTANCES = RECORDED.instances;
const WARM_UP = RECORDED.warmUp;
const SAMPLES = RECORDED.samples;

/**
 * How much slower than its recording the `.pdx` side may read before an over-bound row fails. Three
 * runs of the tool on one machine, 2026-11-06, spread 5% on the select, value list and conditions and
 * 11% on the switch.
 */
const PDX_SLACK = 1.25;

/**
 * Each row and the ratio it is held to. The value list measures 1.82–1.84× in three runs, from
 * 1.96–2.05× before whitespace at an element's or a block's edges stopped being a text node (#907:
 * four of them on every row), and from 2.12–2.33× before an `@if` chain compiled to one branch (core's
 * `whenChain`). The profile below is from before #907. A profile of 30 × 100 value lists (CPU,
 * Chromium) gives the TypeScript side 257 ms, 163 of them its buttons; the `.pdx` side 577 ms, of
 * which 313 ms are the content without its buttons against ~90, and 147 ms of that the keyed list
 * against 31. Each `.pdx` row is a set of reactive bindings — its item and index signals, its branch,
 * its `checked`, its label — where a TypeScript row is built once; with its list costing what the
 * TypeScript one does it would still be 1.8×. It is held to its ratio with the headroom of a ratio measured beside other specs
 * (it moved 10% that way), so it can only get better.
 *
 * The conditions measured 1.06, 1.12, 1.14 and 1.18× in four runs of this spec, and 1.19–1.28× since
 * the TypeScript side got faster (#899, a template's bindings found once). They are held at 1.3, so
 * that the gate fails on a regression and not on a busy machine.
 */
const ROWS = [
    { kind: 'switch', name: 'pdx-switch', max: COMPONENT_RATIO },
    { kind: 'select', name: 'pdx-select', max: COMPONENT_RATIO },
    { kind: 'values', name: 'filter popover, value list', max: 2.0 },
    { kind: 'conditions', name: 'filter popover, conditions', max: 1.3 },
] as const;

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const mount = (page: Page, kind: string) =>
    page.evaluate(({ k, n }) => (window as unknown as { __mount(k: string, n: number): Promise<number> }).__mount(k, n), { k: kind, n: INSTANCES });

/** The `.pdx` side's sample: its mount and the calibration timed just before it, in one evaluation. */
const pdxSample = (page: Page, kind: string) =>
    page.evaluate(async ({ k, n, u }) => {
        const w = window as unknown as { __mount(k: string, n: number): Promise<number>; __calibrate(u: number): number };
        const c = w.__calibrate(u);
        return { ms: await w.__mount(k, n), c };
    }, { k: kind, n: INSTANCES, u: RECORDED.units });

test('every row has a recorded .pdx measurement, and every measurement a row', () => {
    expect(Object.keys(RECORDED.pdx).sort()).toEqual(ROWS.map((r) => r.kind).sort());
});

let ts: { url: string; server: Server };
let pdx: { url: string; server: Server };
test.beforeAll(async () => { ts = await serve(scenarioDist('pilot-ts')); pdx = await serve(scenarioDist('pilot-pdx')); });
test.afterAll(async () => { await Promise.all([ts, pdx].map((s) => new Promise((r) => s.server.close(r)))); });

test.describe('the pilot mounted 100 at a time, .pdx against TypeScript, production builds', () => {
    // Each row's two sides alternate in one test, so a slower moment hits both. The rows run one after
    // another, in one worker (#911): run side by side, each row measured the others' load, which does
    // not hit both sides evenly. The conditions read 1.32× with the four rows in parallel and 1.15–1.25×
    // run one at a time. 'default', not 'serial': one row's failure does not skip the next row.
    test.describe.configure({ mode: 'default', timeout: 180_000 });

    for (const row of ROWS) {
        test(`${row.name}: within ${row.max}× of the TypeScript version`, async ({ browser }) => {
            const pages = await Promise.all([browser.newPage(), browser.newPage()]);
            const [tsPage, pdxPage] = pages;
            await tsPage.goto(ts.url);
            await pdxPage.goto(pdx.url);
            for (const p of pages) await p.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);

            for (let i = 0; i < WARM_UP; i++) { await mount(tsPage, row.kind); await mount(pdxPage, row.kind); }
            const times = { ts: [] as number[], pdx: [] as number[], own: [] as number[] };
            const pdxOnce = async () => { const s = await pdxSample(pdxPage, row.kind); times.pdx.push(s.ms); times.own.push(s.ms / s.c); };
            for (let i = 0; i < SAMPLES; i++) {
                // Alternating which side goes first, so neither always runs right after the other's GC.
                if (i % 2) { await pdxOnce(); times.ts.push(await mount(tsPage, row.kind)); }
                else { times.ts.push(await mount(tsPage, row.kind)); await pdxOnce(); }
            }
            await Promise.all(pages.map((p) => p.close()));

            const a = median(times.ts), b = median(times.pdx);
            const ratio = Math.round((b / a) * 100) / 100;
            const own = Math.round(median(times.own) * 100) / 100;
            const recorded = RECORDED.pdx[row.kind];
            const ownLimit = Math.round(recorded * PDX_SLACK * 100) / 100;
            console.log(`[scenario] pilot mount ${row.name}: TypeScript ${a.toFixed(1)} ms, .pdx ${b.toFixed(1)} ms, ${ratio}×; .pdx ${own}× the calibration (main ${recorded})`);
            if (ratio <= row.max) return;
            // Over its bound: the row holds only if the .pdx side is no slower than on main (#919).
            expect(own, `${row.name}: .pdx ${b.toFixed(1)} ms against TypeScript ${a.toFixed(1)} ms is ${ratio}×, over ${row.max}×, and the .pdx side reads ${own}× the calibration against ${recorded} on main (limit ${ownLimit}): the .pdx side got slower`).toBeLessThanOrEqual(ownLimit);
        });
    }
});
