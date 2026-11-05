// Several builds of one page, timed against each other in one run:
//
//   node tools/perf/compare.mjs <action> <dirA> <dirB> [<dir> …] [--samples <n>]
//
// Serves every build, opens each in its own page of one browser, warms each up with 10 calls of the
// action, then takes <n> samples (31 by default): one call per build, in an order that reverses on
// every other sample, so that no build always runs first. Prints each build's median and its ratio
// to the first build's. Two runs of the same pair move by about 10% against each other, so a ratio is
// read only against a baseline timed in the same run: patch a copy of an unminified build by hand,
// and compare it with the build it was copied from.
import { resolve } from 'node:path';
import { launch, median, openScenario, parseAction, runAction, serve } from './lib.mjs';

const args = process.argv.slice(2);
const samplesAt = args.indexOf('--samples');
const samples = samplesAt < 0 ? 31 : Number(args.splice(samplesAt, 2)[1]);
const [actionArg, ...dirArgs] = args;
if (!actionArg || dirArgs.length < 2) {
    console.error('usage: compare.mjs <action> <dirA> <dirB> [<dir> …] [--samples <n>]');
    process.exit(2);
}
const action = parseAction(actionArg);
const dirs = dirArgs.map((d) => resolve(d));

const servers = await Promise.all(dirs.map((d) => serve(d)));
const browser = await launch();
const pages = [];
for (const s of servers) pages.push(await openScenario(browser, s.url));
for (let w = 0; w < 10; w++) for (const p of pages) await runAction(p, action);

const times = pages.map(() => []);
for (let s = 0; s < samples; s++) {
    const order = pages.map((_, i) => i);
    if (s % 2) order.reverse();
    for (const i of order) times[i].push(await runAction(pages[i], action));
}
await browser.close();
for (const s of servers) s.close();

const base = median(times[0]);
const width = Math.max(...dirArgs.map((d) => d.length));
console.log(`${action.label}: ${samples} samples per build, alternated`);
for (let i = 0; i < dirs.length; i++) {
    const m = median(times[i]);
    console.log(`${dirArgs[i].padEnd(width)}  ${m.toFixed(2).padStart(8)} ms  ${(m / base).toFixed(2)}×`);
}
