// What a js-framework-benchmark row costs in the heap: two snapshots of a benchmark page, one with the
// table cleared and one after "Create 1,000 rows", diffed by object kind (#1204).
//
//   node tools/perf/bench-heap.mjs <jfb clone> <page> [top]
//
// <jfb clone> is the folder `pnpm bench:jfb` clones the benchmark into (the run prints it);
// <page> is a framework's page under it, `frameworks/keyed/pdx/dist/index.html` or
// `frameworks/keyed/vanillajs/index.html`. The pages load their assets by absolute path from the
// clone's root, so the clone is served.
//
// The table is filled and cleared once before the first snapshot, so the code a row runs is loaded and
// its one-time allocations are in both. Prints the heap the 1,000 rows add, then the [top] (25) kinds of
// object that grew most, with count and bytes per row: what to remove from a row is read off this.
import { chromium } from '@playwright/test';
import { byKind } from './memory.mjs';
import { serve } from './lib.mjs';

const [root, pagePath, topArg] = process.argv.slice(2);
if (!root || !pagePath) {
    console.error('usage: bench-heap.mjs <jfb clone> <page> [top]');
    process.exit(2);
}
const ROWS = 1000;
const top = Number(topArg ?? 25);

const server = await serve(root);
const browser = await chromium.launch();
try {
    const page = await browser.newPage();
    await page.goto(new URL(pagePath, server.url).href);
    await page.waitForSelector('#run');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    const rows = () => page.evaluate(() => document.querySelectorAll('tbody tr').length);
    const click = async (id, want) => {
        await page.click(`#${id}`);
        await page.waitForFunction((n) => document.querySelectorAll('tbody tr').length === n, want);
    };
    const snapshotOf = async () => {
        await cdp.send('HeapProfiler.collectGarbage');
        await cdp.send('HeapProfiler.collectGarbage');
        const { usedSize } = await cdp.send('Runtime.getHeapUsage');
        let text = '';
        const onChunk = ({ chunk }) => { text += chunk; };
        cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
        await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
        cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
        return { used: usedSize, kinds: byKind(JSON.parse(text)) };
    };

    await click('run', ROWS);
    await click('clear', 0);
    const before = await snapshotOf();
    await click('run', ROWS);
    if ((await rows()) !== ROWS) throw new Error('the table does not hold the rows');
    const after = await snapshotOf();

    const kb = (b) => (b / 1024).toFixed(1);
    console.log(`${pagePath}: JS heap ${kb(before.used)} KB cleared, ${kb(after.used)} KB with ${ROWS} rows: +${kb(after.used - before.used)} KB, ${((after.used - before.used) / ROWS).toFixed(0)} B a row`);
    const grown = [...after.kinds].map(([k, v]) => ({ k, count: v.count - (before.kinds.get(k)?.count ?? 0), size: v.size - (before.kinds.get(k)?.size ?? 0) }))
        .filter((r) => r.size > 0).sort((a, b) => b.size - a.size);
    const total = grown.reduce((s, r) => s + r.size, 0);
    console.log(`snapshot growth ${kb(total)} KB (${(total / ROWS).toFixed(0)} B a row); the ${top} largest kinds:`);
    for (const r of grown.slice(0, top)) {
        console.log(`${kb(r.size).padStart(8)} KB  ${(r.count / ROWS).toFixed(2).padStart(6)}/row  ${(r.size / ROWS).toFixed(0).padStart(5)} B/row  ${r.k}`);
    }
} finally {
    await browser.close();
    server.close();
}
