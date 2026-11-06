// Measures the `.pdx` pilot's rows against the calibration, and writes the measurements that
// `tests/scenario-pilot-mount.spec.ts` holds the `.pdx` side to when a row's ratio is over its bound:
//
//   node packages/showcase/tools/perf/pilot-baseline.mjs <pilot-pdx build of main> [--out <json>]
//
// For each row, in a fresh page of the build: a warm-up, then `samples` pairs of `__calibrate(units)`
// and `__mount(row, instances)`. A row's measurement is the median of its pairs' ratios, the `.pdx`
// time over the calibration measured beside it (#919). `units`, `instances`, `warmUp`, `samples` and
// the rows are read from the output file, so the spec measures the way its numbers were measured; only
// `pdx` and `measured` are written. Run it on a build of `main`: the measurement is what a change is
// held to.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, median, openScenario, packageDir, serve } from './lib.mjs';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt < 0 ? resolve(packageDir, 'tests', 'scenario-pilot-mount.json') : resolve(args.splice(outAt, 2)[1]);
const [dir] = args;
if (!dir) {
    console.error('usage: pilot-baseline.mjs <pilot-pdx build of main> [--out <json>]');
    process.exit(2);
}

const file = JSON.parse(readFileSync(out, 'utf8'));
const { units, instances, warmUp, samples } = file;
const site = await serve(resolve(dir));
const browser = await launch();
const pdx = {};
for (const row of Object.keys(file.pdx)) {
    const page = await openScenario(browser, site.url);
    const pair = () => page.evaluate(async ({ row, units, instances }) => {
        const c = window.__calibrate(units);
        return (await window.__mount(row, instances)) / c;
    }, { row, units, instances });
    for (let i = 0; i < warmUp; i++) await pair();
    const ratios = [];
    for (let i = 0; i < samples; i++) ratios.push(await pair());
    await page.close();
    pdx[row] = Math.round(median(ratios) * 100) / 100;
    console.log(`${row.padEnd(12)} ${pdx[row].toFixed(2)}`);
}
await browser.close();
site.close();

file.measured = new Date().toISOString().slice(0, 10);
file.pdx = pdx;
writeFileSync(out, JSON.stringify(file, null, 2) + '\n');
console.log(`${Object.keys(pdx).length} rows → ${out}`);
