// Two builds of one page, timed as scenario-port-mount.spec.ts times a row on CI (#1287, item I):
//
//   node tools/perf/compare-pairs.mjs <action> <base dir> <candidate dir> [--couples <n>] [--cpu <rate>]
//
// compare.mjs opens one page per build for the whole run, and the page opened first reads slower: a
// local compare of the same build read 1.28× and then 0.995×, and reversing the order flipped the
// sign (#1280). This takes the port spec's procedure instead, and its arithmetic itself
// (tests/port-ratio.ts, imported as it is: Node 22.18+ strips its types):
//   - each pair is two FRESH pages, the base's and the candidate's, warmed up with 3 calls each;
//   - pairs come in couples, one opened candidate first and one base first, so a factor that follows
//     the order a pair's pages were opened in cancels in the couple's geometric mean;
//   - inside a pair, SAMPLES alternated samples, b first on even ones, a first on odd ones, read in
//     turns of two, so the order of each sample's two calls cancels too;
//   - the ratio is the median of the couples, candidate over base, to a hundredth.
// It prints each couple's ratio, so their spread says how far the result can be trusted.
// `--cpu <rate>` throttles each page's CPU (CDP), which the port spec does not: a few per cent a fast
// machine hides show at 4. 4 couples by default, as the port spec's.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { launch, openScenario, parseAction, runAction, serve } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const { SAMPLES, coupleRatios, portRatio } = await import(pathToFileURL(join(here, '..', '..', 'tests', 'port-ratio.ts')).href);

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const at = args.indexOf(name);
    return at < 0 ? fallback : Number(args.splice(at, 2)[1]);
};
const couples = option('--couples', 4);
const cpu = option('--cpu', 1);
const [actionArg, baseArg, candidateArg] = args;
if (!actionArg || !baseArg || !candidateArg) {
    console.error('usage: compare-pairs.mjs <action> <base dir> <candidate dir> [--couples <n>] [--cpu <rate>]');
    process.exit(2);
}
const action = parseAction(actionArg);
const [base, candidate] = await Promise.all([serve(resolve(baseArg)), serve(resolve(candidateArg))]);
const browser = await launch();

/** A fresh page of `url`, throttled as asked. */
async function open(url) {
    const page = await openScenario(browser, url);
    if (cpu !== 1) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpu });
    return page;
}

/** One pair, as the port spec's: `a` is the candidate, `b` the base. */
async function pair(candidateFirst) {
    let pa, pb;
    if (candidateFirst) { pa = await open(candidate.url); pb = await open(base.url); }
    else { pb = await open(base.url); pa = await open(candidate.url); }
    for (let i = 0; i < 3; i++) { await runAction(pa, action); await runAction(pb, action); }
    const a = [];
    const b = [];
    for (let i = 0; i < SAMPLES; i++) {
        if (i % 2) { a.push(await runAction(pa, action)); b.push(await runAction(pb, action)); }
        else { b.push(await runAction(pb, action)); a.push(await runAction(pa, action)); }
    }
    await Promise.all([pa.close(), pb.close()]);
    return { a, b, oursFirst: candidateFirst };
}

const pairs = [];
for (let c = 0; c < couples; c++) { pairs.push(await pair(true)); pairs.push(await pair(false)); }
await browser.close();
base.close();
candidate.close();

const each = coupleRatios(pairs).map((r) => r.toFixed(3)).join(', ');
console.log(`${action.label}: ${couples} couples${cpu !== 1 ? `, CPU ${cpu}x` : ''}; candidate / base = ${portRatio(pairs).toFixed(2)} (couples ${each})`);
