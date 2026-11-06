// Measures every component's mount against the calibration, and writes the measurements that
// `tests/scenario-component-mount.spec.ts` holds each component to:
//
//   node packages/showcase/tools/perf/mount-budgets.mjs <component-mount build> [--out <json>]
//
// For each tag of `packages/ui/custom-elements.json`, in a fresh page of the `component-mount` build:
// a warm-up, then `samples` pairs of `__calibrate(units)` and `__mount(tag, instances)`, alternated.
// A pair's ratio is the component's milliseconds over the calibration's, measured beside it, so it
// holds on a machine slower or faster than this one. The tag's measurement is the median of its
// pairs. `samples`, `units` and `instances` are read from the output file, so the spec measures the
// way its numbers were measured; only `ratio` and `measured` are written.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, median, openScenario, packageDir, serve } from './lib.mjs';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt < 0 ? resolve(packageDir, 'tests', 'scenario-component-mount.json') : resolve(args.splice(outAt, 2)[1]);
const [dir] = args;
if (!dir) {
    console.error('usage: mount-budgets.mjs <component-mount build> [--out <json>]');
    process.exit(2);
}

const file = JSON.parse(readFileSync(out, 'utf8'));
const { samples, units, instances, warmUp } = file;
const manifest = JSON.parse(readFileSync(resolve(packageDir, '..', 'ui', 'custom-elements.json'), 'utf8'));
const tags = manifest.modules.flatMap((m) => (m.declarations ?? []).flatMap((d) => (d.tagName ? [d.tagName] : []))).sort();

const site = await serve(resolve(dir));
const browser = await launch();
const ratio = {};
for (const tag of tags) {
    const page = await openScenario(browser, site.url);
    const pair = () => page.evaluate(async ({ tag, units, instances }) => {
        const c = await window.__calibrate(units);
        const m = await window.__mount(tag, instances);
        return m / c;
    }, { tag, units, instances });
    for (let i = 0; i < warmUp; i++) await pair();
    const ratios = [];
    for (let i = 0; i < samples; i++) ratios.push(await pair());
    await page.close();
    ratio[tag] = Math.round(median(ratios) * 100) / 100;
    console.log(`${tag.padEnd(28)} ${ratio[tag].toFixed(2)}`);
}
await browser.close();
site.close();

file.measured = new Date().toISOString().slice(0, 10);
file.ratio = ratio;
writeFileSync(out, JSON.stringify(file, null, 2) + '\n');
console.log(`${tags.length} tags → ${out}`);
