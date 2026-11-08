/**
 * Every @pdxui/ui component mounts within a budget of time, on a production build (#865).
 *
 * The `component-mount` scenario (`scenarios/component-mount/`, built by `scenarios-build.ts`) mounts
 * 100 of a tag in its default state and returns the milliseconds of the synchronous mount, its style
 * and layout forced (the scenario's own comment says why that part and not "until drawn").
 *
 * A row is held against `main`'s mount of the same tag, measured beside it (#950): `main`'s scenario is
 * built from a worktree of `origin/main` (`pilot-main.ts`) and the two are timed in one test, in pages
 * that alternate, so a slower moment hits both and their ratio is what is held — as
 * `scenario-pilot-mount.spec.ts` holds its `.pdx` side (#938). Until then a row was held to a
 * recording of the tag over a calibration: a synchronous calibration does not take the event loop's
 * waits a mount does, and `pdx-radio-group` read 1.37× it alone and 3.67× under the pre-push's load on
 * one unchanged build.
 *
 * SLACK is wide because a row is noisy and its sampling short (WARM_UP, SAMPLES): two full runs on one
 * machine, 2026-11-06, put a tag's second measurement at 0.89–1.13× its first for 80% of the tags and
 * 0.70–1.78× at the extremes. So a row catches a component that has become several times slower — the
 * calendar's formatters were 4.3× before #894 — and not one that is 20% slower: that is what
 * `tools/perf/compare.mjs` is for. A tag that `main` does not have yet is measured and reported, and
 * held once it is merged.
 */
import { test, expect, type Page } from './fixture';
import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { scenarioDist, COMPONENT_MOUNT_MAIN } from './scenarios-build';

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

const INSTANCES = 100;
const WARM_UP = 2;
const SAMPLES = 7;
/** A row fails when this tree's mount is more than this many times `main`'s, beside it. */
const SLACK = 2.5;

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const mount = (page: Page, tag: string) =>
    page.evaluate(({ t, n }) => (window as unknown as { __mount(t: string, n: number): Promise<number> }).__mount(t, n), { t: tag, n: INSTANCES });

const mainCommit = (): string => readFileSync(join(scenarioDist(COMPONENT_MOUNT_MAIN), 'commit.txt'), 'utf8').trim().slice(0, 8);

let site: { url: string; server: Server };
let main: { url: string; server: Server };
test.beforeAll(async () => {
    site = await serve(scenarioDist('component-mount'));
    main = await serve(scenarioDist(COMPONENT_MOUNT_MAIN));
});
test.afterAll(async () => { await Promise.all([site, main].map((s) => new Promise((r) => s.server.close(r)))); });

test.describe('a component mounts within its budget', () => {
    for (const tag of TAGS) {
        test(`${tag} within ${SLACK}× main's mount, beside it`, async ({ browser }) => {
            const [here, there] = await Promise.all([browser.newPage(), browser.newPage()]);
            for (const [page, url] of [[here, site.url], [there, main.url]] as const) {
                await page.goto(url);
                await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
            }
            const onMain = await there.evaluate((t) => customElements.get(t) !== undefined, tag);
            const times = { here: [] as number[], main: [] as number[] };
            for (let i = 0; i < WARM_UP; i++) { await mount(here, tag); if (onMain) await mount(there, tag); }
            for (let i = 0; i < SAMPLES; i++) {
                // Each sample starts from the other side, so neither always runs right after the other's GC.
                if (i % 2 || !onMain) { times.here.push(await mount(here, tag)); if (onMain) times.main.push(await mount(there, tag)); }
                else { times.main.push(await mount(there, tag)); times.here.push(await mount(here, tag)); }
            }
            await Promise.all([here.close(), there.close()]);

            const a = median(times.here);
            if (!onMain) {
                console.log(`[scenario] mount ${tag}: ${a.toFixed(1)} ms; main (${mainCommit()}) has no ${tag} yet, so nothing to hold it to`);
                return;
            }
            const m = median(times.main);
            const ratio = Math.round((a / m) * 100) / 100;
            console.log(`[scenario] mount ${tag}: ${a.toFixed(1)} ms, main's ${m.toFixed(1)} ms beside it, ${ratio}× (main ${mainCommit()})`);
            expect(ratio, `${tag} mounts in ${a.toFixed(1)} ms, ${ratio}× main's ${m.toFixed(1)} ms measured beside it, over ${SLACK}×: say in the commit why it grew`)
                .toBeLessThanOrEqual(SLACK);
        });
    }
});
