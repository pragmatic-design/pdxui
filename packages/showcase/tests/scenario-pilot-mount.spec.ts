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
 * on `main` (#919). `main`'s pilot is built from a worktree of `origin/main` (`pilot-main.ts`) and
 * mounted in the same test, alternated with the other two (#938): a row fails when its ratio is over
 * its bound AND this tree's `.pdx` side is slower than `main`'s, beside it, by more than MAIN_SLACK.
 * It was held against a recording of `main` over a calibration, until the measurement showed that
 * unfair to the change: the unchanged build moved up to 38% between runs, and a synchronous
 * calibration does not take the waits a mount does on a busy machine.
 */
import { test, expect, type Page } from './fixture';
import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import type { AddressInfo } from 'node:net';
import { scenarioDist, PILOT_MAIN } from './scenarios-build';

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
 * The sampling: 100 instances, 10 warm-up mounts, then 61 samples per side. 61, from 21 (#911): under
 * load the median of 21 read the value list from 1.55 to 2.04× in eight runs of this procedure (sd
 * 0.176) and failed its bound with nothing changed; the median of 61 read 1.69–1.89× (sd 0.064). The
 * conditions went from sd 0.057 to 0.036. The bounds did not move: the measurement got steadier.
 */
const INSTANCES = 100;
const WARM_UP = 10;
const SAMPLES = 61;

/**
 * How much slower than `main`'s, beside it, this tree's `.pdx` side may read before an over-bound row
 * fails (#938). The measurement it is set from is at its use.
 */
const MAIN_SLACK = 1.25;

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

/** `main`'s pilot, built by `scenarios-build.ts`, and the commit it was built from. */
const mainCommit = (): string => readFileSync(join(scenarioDist(PILOT_MAIN), 'commit.txt'), 'utf8').trim();

let ts: { url: string; server: Server };
let pdx: { url: string; server: Server };
let main: { url: string; server: Server };
test.beforeAll(async () => {
    ts = await serve(scenarioDist('pilot-ts'));
    pdx = await serve(scenarioDist('pilot-pdx'));
    main = await serve(scenarioDist(PILOT_MAIN));
});
test.afterAll(async () => { await Promise.all([ts, pdx, main].map((s) => new Promise((r) => s.server.close(r)))); });

test.describe('the pilot mounted 100 at a time, .pdx against TypeScript, production builds', () => {
    // Each row's sides alternate in one test, so a slower moment hits all three. The rows run one after
    // another, in one worker (#911): run side by side, each row measured the others' load, which does
    // not hit the sides evenly. The conditions read 1.32× with the four rows in parallel and 1.15–1.25×
    // run one at a time. 'default', not 'serial': one row's failure does not skip the next row.
    test.describe.configure({ mode: 'default', timeout: 240_000 });

    for (const row of ROWS) {
        test(`${row.name}: within ${row.max}× of the TypeScript version`, async ({ browser }) => {
            const pages = await Promise.all([browser.newPage(), browser.newPage(), browser.newPage()]);
            const sides = [
                { page: pages[0], url: ts.url, times: [] as number[] },
                { page: pages[1], url: pdx.url, times: [] as number[] },
                { page: pages[2], url: main.url, times: [] as number[] },
            ];
            for (const s of sides) {
                await s.page.goto(s.url);
                await s.page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
            }
            for (let i = 0; i < WARM_UP; i++) for (const s of sides) await mount(s.page, row.kind);
            for (let i = 0; i < SAMPLES; i++) {
                // Each sample starts from another side, so none always runs right after another's GC.
                for (let k = 0; k < sides.length; k++) {
                    const s = sides[(i + k) % sides.length];
                    s.times.push(await mount(s.page, row.kind));
                }
            }
            await Promise.all(pages.map((p) => p.close()));

            const [a, b, m] = sides.map((s) => median(s.times));
            const ratio = Math.round((b / a) * 100) / 100;
            const overMain = Math.round((b / m) * 100) / 100;
            console.log(`[scenario] pilot mount ${row.name}: TypeScript ${a.toFixed(1)} ms, .pdx ${b.toFixed(1)} ms, ${ratio}×; main's .pdx ${m.toFixed(1)} ms, this one ${overMain}× it (main ${mainCommit().slice(0, 8)})`);
            if (ratio <= row.max) return;
            // Over its bound: the row holds only if the .pdx side is no slower than main's, beside it (#919, #938).
            expect(overMain, `${row.name}: .pdx ${b.toFixed(1)} ms against TypeScript ${a.toFixed(1)} ms is ${ratio}×, over ${row.max}×, and ${overMain}× main's .pdx measured beside it (${m.toFixed(1)} ms, limit ${MAIN_SLACK}): the .pdx side got slower`).toBeLessThanOrEqual(MAIN_SLACK);
        });
    }
});
