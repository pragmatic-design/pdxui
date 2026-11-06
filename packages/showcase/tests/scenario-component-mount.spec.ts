/**
 * Every @pdxui/ui component mounts within a budget of time, on a production build (#865).
 *
 * The `component-mount` scenario (`scenarios/component-mount/`, built by `scenarios-build.ts`) mounts
 * 100 of a tag in its default state and returns the milliseconds of the synchronous mount, its style
 * and layout forced (the scenario's own comment says why that part and not "until drawn"). Beside it,
 * `__calibrate(units)` times a fixed piece of DOM work the same way. A row is the component's time over
 * the calibration's, in pairs that alternate in one page, so a machine twice as slow is twice as slow
 * on both sides and the ratio is what is held, as `scenario-pilot-mount.spec.ts` holds its own.
 *
 * Each tag's measurement is in `scenario-component-mount.json`, written by
 * `tools/perf/mount-budgets.mjs` from the same build (`samples` pairs after `warmUp`, read from that
 * file here too). The budget is the measurement × SLACK. SLACK is wide because a row is noisy: two
 * full runs of the tool on one machine, 2026-11-06, put a tag's second measurement at 0.89–1.13× its
 * first for 80% of the tags, and at 0.70–1.78× at the extremes (`pdx-data-grid` 2.33 then 4.15). So a
 * row catches a component that has become several times slower — the calendar's formatters were 4.3×
 * before #894 — and not one that is 20% slower: that is what `tools/perf/compare.mjs` is for.
 *
 * A row also fails when it measures under its measurement ÷ STALE: the component has become much
 * faster, its budget no longer measures anything, and the tool is run again.
 */
import { test, expect } from './fixture';
import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { scenarioDist } from './scenarios-build';

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

/** A static server over the scenario's build: module scripts do not load from file://. */
function serve(dir: string): Promise<{ url: string; server: Server }> {
    const server = createServer((req, res) => {
        const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]));
        const file = join(dir, path === '/' || path === '\\' ? 'index.html' : path);
        if (!file.startsWith(dir) || !existsSync(file)) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
    });
    return new Promise((done) => server.listen(0, '127.0.0.1', () => {
        done({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, server });
    }));
}

const here = resolve(fileURLToPath(import.meta.url), '..');

/** Every tag the library declares, from its manifest: a component added there gets a row by arriving. */
const manifest = JSON.parse(readFileSync(resolve(here, '..', '..', 'ui', 'custom-elements.json'), 'utf8')) as { modules: { declarations?: { tagName?: string }[] }[] };
const TAGS = manifest.modules.flatMap((m) => (m.declarations ?? []).flatMap((d) => (d.tagName ? [d.tagName] : []))).sort();

const MEASURED = JSON.parse(readFileSync(resolve(here, 'scenario-component-mount.json'), 'utf8')) as {
    instances: number; units: number; warmUp: number; samples: number; measured: string; ratio: Record<string, number>;
};

/** A row's budget is its measurement times this. */
const SLACK = 2.5;
/** A row under its measurement divided by this is stale. */
const STALE = 3;

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

let site: { url: string; server: Server };
test.beforeAll(async () => { site = await serve(scenarioDist('component-mount')); });
test.afterAll(async () => { await new Promise((r) => site.server.close(r)); });

test('every tag of the manifest has a measurement, and every measurement a tag', () => {
    const tool = 'run tools/perf/mount-budgets.mjs on a component-mount build';
    expect(TAGS.filter((t) => !(t in MEASURED.ratio)), `tags with no measurement: ${tool}`).toEqual([]);
    expect(Object.keys(MEASURED.ratio).filter((t) => !TAGS.includes(t)), `measurements of tags the manifest no longer has: ${tool}`).toEqual([]);
});

test.describe('a component mounts within its budget', () => {
    for (const tag of TAGS) {
        const measured = MEASURED.ratio[tag];
        test(`${tag} within ${SLACK}× its measurement of ${MEASURED.measured}`, async ({ browser }) => {
            test.skip(measured === undefined, 'no measurement: the test above fails for it');
            const page = await browser.newPage();
            await page.goto(site.url);
            await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
            const pair = () => page.evaluate(async ({ t, units, n }) => {
                const w = window as unknown as { __calibrate(u: number): Promise<number>; __mount(t: string, n: number): Promise<number> };
                const c = await w.__calibrate(units);
                return (await w.__mount(t, n)) / c;
            }, { t: tag, units: MEASURED.units, n: MEASURED.instances });
            for (let i = 0; i < MEASURED.warmUp; i++) await pair();
            const ratios: number[] = [];
            for (let i = 0; i < MEASURED.samples; i++) ratios.push(await pair());
            await page.close();

            const ratio = Math.round(median(ratios) * 100) / 100;
            console.log(`[scenario] mount ${tag}: ${ratio}× the calibration (measured ${measured}, budget ${(measured * SLACK).toFixed(2)})`);
            expect(ratio, `${tag} mounts in ${ratio}× the calibration, over its budget of ${SLACK} × ${measured}: say in the commit why it grew`)
                .toBeLessThanOrEqual(measured * SLACK);
            expect(ratio, `${tag} mounts in ${ratio}× the calibration, under a third of its measurement ${measured}: run tools/perf/mount-budgets.mjs again`)
                .toBeGreaterThanOrEqual(measured / STALE);
        });
    }
});
