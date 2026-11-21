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
 * The procedure, for each moved tag: COUPLES couples of fresh pairs of pages, one pair opened ours first
 * and one theirs first, each with WARM_UP mounts and SAMPLES alternated samples of INSTANCES tags; a
 * pair's ratio is the median of its turns (a sample of each order, which cancels a mount that is slower
 * for running second), a couple's the geometric mean of its two pairs', which cancels a page that is
 * slower for being opened first (#1277, `port-ratio.ts`), and the tag's the median of its couples. The bound is the runner's own spread: a CONTROL row measures one tag with this tree's
 * build on both sides, by the same procedure, and its ratio is held to the same band. The band comes
 * from that control over CI runs, written at BAND with the runs it was set from.
 */
import { test, expect, type Browser, type Page } from './fixture';
import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { scenarioDist, COMPONENT_MOUNT_MAIN } from './scenarios-build';
import { portRatio, coupleRatios, SAMPLES, type PairResult } from './port-ratio';

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

/** Couples of pairs, one opened in each order (#1277): eight fresh pairs, one more than the seven before. */
const COUPLES = 4;
const WARM_UP = 3;
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

const median = (xs: readonly number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const mount = (page: Page, tag: string) =>
    page.evaluate(({ t, n }) => (window as unknown as { __mount(t: string, n: number): Promise<number> }).__mount(t, n), { t: tag, n: INSTANCES });

async function open(browser: Browser, url: string): Promise<Page> {
    const page = await browser.newPage();
    await page.goto(url);
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
    return page;
}

/**
 * One pair of fresh pages: each side's alternated samples, in the order they were taken. `oursFirst` is
 * the order the two are opened in; `portRatio` balances it, and the order of each sample's two mounts
 * (#1277).
 */
async function pair(browser: Browser, ours: string, theirs: string, tag: string, oursFirst: boolean): Promise<RawPair> {
    let pa: Page;
    let pb: Page;
    if (oursFirst) { pa = await open(browser, ours); pb = await open(browser, theirs); }
    else { pb = await open(browser, theirs); pa = await open(browser, ours); }
    const warm: number[] = [];
    for (let i = 0; i < WARM_UP; i++) { warm.push(await mount(pa, tag)); warm.push(await mount(pb, tag)); }
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
        // Sample i mounts `b` first when i is even, `a` first when odd: the order `pairRatio` reads.
        if (i % 2) { a.push(await mount(pa, tag)); b.push(await mount(pb, tag)); }
        else { b.push(await mount(pb, tag)); a.push(await mount(pa, tag)); }
    }
    await Promise.all([pa.close(), pb.close()]);
    return { a, b, oursFirst, warm };
}

/**
 * A pair with its warm-up (a, b, a, b, …), logged by the control with its samples (#1277): on Azure
 * runners one side read slower with the same build on both, and these say which mount is.
 */
interface RawPair extends PairResult { warm: number[] }

/** One raw pair as a log line. */
const rawLine = (p: RawPair, i: number): string => {
    const f = (xs: readonly number[]) => xs.map((x) => x.toFixed(1)).join(',');
    return `[port-raw] pair ${i} ${p.oursFirst ? 'a-opened-first' : 'b-opened-first'} warm=${f(p.warm)} a=${f(p.a)} b=${f(p.b)}`;
};

/**
 * The tag's ratio, ours over theirs: COUPLES couples of fresh pairs, one opened ours first and one theirs
 * first (`portRatio`, #1277). `pairs` are the couples' ratios; `a` and `b`, for the log, the median over
 * the pairs of each side's median sample.
 */
async function ratioOf(browser: Browser, ours: string, theirs: string, tag: string): Promise<{ ratio: number; a: number; b: number; pairs: number[]; raw: RawPair[] }> {
    const results: RawPair[] = [];
    for (let p = 0; p < COUPLES * 2; p++) results.push(await pair(browser, ours, theirs, tag, p % 2 === 0));
    const pairs = coupleRatios(results).map((r) => Math.round(r * 100) / 100);
    return { ratio: portRatio(results), a: median(results.map((r) => median(r.a))), b: median(results.map((r) => median(r.b))), pairs, raw: results };
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
        // The raw times, and the runner's cores, for #1277: always logged, so every run is a data point.
        console.log(`[port-raw] cores ${cpus().length} (${cpus()[0]?.model ?? '?'})`);
        r.raw.forEach((p, i) => console.log(rawLine(p, i)));
        // The ratio is to a hundredth, and so is its distance from 1: in floating point 1.05 - 1 is
        // 0.050000000000000044, which read a control exactly at the band as outside it.
        const off = Math.round(Math.abs(r.ratio - 1) * 100) / 100;
        expect(off, `the runner reads one build ${r.ratio}× itself: the band ${BAND} is narrower than its spread`).toBeLessThanOrEqual(BAND);
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
