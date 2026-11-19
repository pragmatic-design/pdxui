/**
 * A component moved to `.pdx` mounts as fast as its TypeScript version, measured on CI (#1243).
 *
 * The library's move to `.pdx` (#1210) holds each component it moves to its TypeScript version's mount
 * time, at most 1.0× (the owner, 2026-11-19). Measured on a shared developer machine that stopped
 * deciding: runs of the same two builds swung 0.90–1.28×, and the spread was between PAGES more than
 * between moments — each run opens fresh pages, and two pages of one build settle differently.
 *
 * The comparison is already built: `component-mount` is built from this tree and from `main`'s worktree
 * (`scenarios-build.ts`, `pilot-main.ts`), as `scenario-component-mount.spec.ts` uses it. A tag that
 * `main` has in TypeScript and this tree in `.pdx` is a tag the change moves, and `main`'s side IS its
 * TypeScript version. `PDX_PORT_BASE` names another base for `main`'s side (a commit from before a move).
 *
 * The procedure, for each moved tag: PAIRS fresh pairs of pages, each with WARM_UP mounts and SAMPLES
 * alternated samples of INSTANCES tags; a pair's ratio is the median of its samples, the tag's the median
 * of its pairs. The bound is the runner's own spread: a CONTROL row measures one tag with this tree's
 * build on both sides, by the same procedure, and its ratio is held to the same band. The band comes
 * from that control over CI runs, written at BAND with the runs it was set from.
 */
import { test, expect, type Browser, type Page } from './fixture';
import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { scenarioDist, COMPONENT_MOUNT_MAIN } from './scenarios-build';

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

/** A static server over a scenario's build: module scripts do not load from file://. */
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

const PAIRS = 7;
const WARM_UP = 3;
const SAMPLES = 21;
/** 1,000 and not the 100 of the budget spec: at 100 the 0.1 ms timer is several per cent of a mount. */
const INSTANCES = 1000;
/** The tag the control measures against itself: on both sides, the same in every tree. */
const CONTROL_TAG = 'pdx-badge';
/**
 * How far from 1.0 the runner can tell, set from the control's ratio over CI runs (#1243, 2026-11-19):
 * 1.01, 1.01, 1.01, 1.01, 0.99 in five runs on AWS and Azure runners, its single pairs from 0.94 to
 * 1.24 — the median of seven pairs is what holds still. Five times that spread, so a row fails on a
 * component and not on the runner: one 6% slower than its TypeScript version fails. Measured with it on
 * the same runners against the commit before #1241: pdx-divider 0.98, pdx-progress 0.85, pdx-spinner
 * 0.98, and a divider made slower on purpose 3.08×.
 */
const BAND = 0.05;

interface Manifest { modules: { path: string; declarations?: { tagName?: string }[] }[] }
const here = resolve(fileURLToPath(import.meta.url), '..');

/** Each tag of a manifest, by the module that declares it. */
function modulesByTag(manifest: Manifest): Map<string, string> {
    const byTag = new Map<string, string>();
    for (const m of manifest.modules) for (const d of m.declarations ?? []) if (d.tagName) byTag.set(d.tagName, m.path);
    return byTag;
}

/** The tags a change moves: in `main` from a `.ts`, here from a `.pdx`. */
function movedTags(): string[] {
    const ours = modulesByTag(JSON.parse(readFileSync(resolve(here, '..', '..', 'ui', 'custom-elements.json'), 'utf8')) as Manifest);
    const theirs = modulesByTag(JSON.parse(readFileSync(join(scenarioDist(COMPONENT_MOUNT_MAIN), 'custom-elements.json'), 'utf8')) as Manifest);
    return [...ours].filter(([tag, path]) => path.endsWith('.pdx') && theirs.get(tag)?.endsWith('.ts')).map(([tag]) => tag).sort();
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const mount = (page: Page, tag: string) =>
    page.evaluate(({ t, n }) => (window as unknown as { __mount(t: string, n: number): Promise<number> }).__mount(t, n), { t: tag, n: INSTANCES });

async function open(browser: Browser, url: string): Promise<Page> {
    const page = await browser.newPage();
    await page.goto(url);
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
    return page;
}

/** One pair of fresh pages: the median of each side's alternated samples. */
async function pair(browser: Browser, ours: string, theirs: string, tag: string): Promise<{ a: number; b: number }> {
    const [pa, pb] = [await open(browser, ours), await open(browser, theirs)];
    for (let i = 0; i < WARM_UP; i++) { await mount(pa, tag); await mount(pb, tag); }
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
        // Each sample starts from the other side, so neither always runs right after the other's GC.
        if (i % 2) { a.push(await mount(pa, tag)); b.push(await mount(pb, tag)); }
        else { b.push(await mount(pb, tag)); a.push(await mount(pa, tag)); }
    }
    await Promise.all([pa.close(), pb.close()]);
    return { a: median(a), b: median(b) };
}

/** The tag's ratio, ours over theirs: the median of PAIRS fresh pairs, each pair's the median of its samples. */
async function ratioOf(browser: Browser, ours: string, theirs: string, tag: string): Promise<{ ratio: number; a: number; b: number; pairs: number[] }> {
    const results: { a: number; b: number }[] = [];
    for (let p = 0; p < PAIRS; p++) results.push(await pair(browser, ours, theirs, tag));
    const pairs = results.map((r) => Math.round((r.a / r.b) * 100) / 100);
    return { ratio: median(pairs), a: median(results.map((r) => r.a)), b: median(results.map((r) => r.b)), pairs };
}

let site: { url: string; server: Server };
let main: { url: string; server: Server };
test.beforeAll(async () => {
    site = await serve(scenarioDist('component-mount'));
    main = await serve(scenarioDist(COMPONENT_MOUNT_MAIN));
});
test.afterAll(async () => { await Promise.all([site, main].map((s) => new Promise((r) => s.server.close(r)))); });

const mainCommit = (): string => readFileSync(join(scenarioDist(COMPONENT_MOUNT_MAIN), 'commit.txt'), 'utf8').trim().slice(0, 8);

test.describe('a component moved to .pdx against its TypeScript version, on this runner', () => {
    test.describe.configure({ timeout: 600_000 });

    test(`control: ${CONTROL_TAG} against itself reads within ${BAND} of 1.0`, async ({ browser }) => {
        const r = await ratioOf(browser, site.url, site.url, CONTROL_TAG);
        console.log(`[port] control ${CONTROL_TAG} against itself: ${r.a.toFixed(2)} ms / ${r.b.toFixed(2)} ms, ratio ${r.ratio} (pairs: ${r.pairs.join(' ')})`);
        expect(Math.abs(r.ratio - 1), `the runner reads one build ${r.ratio}× itself: the band ${BAND} is narrower than its spread`).toBeLessThanOrEqual(BAND);
    });

    test('every tag moved to .pdx mounts within the band of its TypeScript version', async ({ browser }) => {
        const tags = movedTags();
        test.skip(tags.length === 0, `no tag is .ts in main (${mainCommit()}) and .pdx here: nothing was measured`);
        for (const tag of tags) {
            const r = await ratioOf(browser, site.url, main.url, tag);
            console.log(`[port] ${tag}: TS ${r.b.toFixed(2)} ms (main ${mainCommit()}), .pdx ${r.a.toFixed(2)} ms, ratio ${r.ratio} (pairs: ${r.pairs.join(' ')})`);
            expect.soft(r.ratio, `${tag} mounts ${r.ratio}× its TypeScript version, over 1 + ${BAND}`).toBeLessThanOrEqual(1 + BAND);
        }
    });
});
