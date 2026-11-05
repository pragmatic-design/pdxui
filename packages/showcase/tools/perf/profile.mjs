// A CPU profile of a page's action:
//
//   node tools/perf/profile.mjs <dir> <action> [runs] [--out <file>]
//
// Serves the build in <dir>, warms it up with 10 calls of the action, then records a CDP CPU profile
// (sampled every 50 µs) over <runs> calls (30 by default). The action is `name[:arg,arg…]`, a call of
// the page's `window.__<name>` (lib.mjs, parseAction). The profile is saved as <file>, by default
// `<dir>/<name>.cpuprofile`, for tree.mjs and callers.mjs; what is printed is the action's median and
// the functions with the most self and inclusive time. Profile an unminified build: a minified one
// names its functions with one letter.
import { writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { functionKey, launch, median, openScenario, parseAction, readProfile, runAction, serve } from './lib.mjs';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const outArg = outAt < 0 ? undefined : args.splice(outAt, 2)[1];
const [dirArg, actionArg, runsArg] = args;
if (!dirArg || !actionArg) {
    console.error('usage: profile.mjs <dir> <action> [runs] [--out <file>]');
    process.exit(2);
}
const dir = resolve(dirArg);
const action = parseAction(actionArg);
const runs = Number(runsArg ?? 30);
const out = resolve(outArg ?? join(dir, `${action.name}.cpuprofile`));

const server = await serve(dir);
const browser = await launch();
const page = await openScenario(browser, server.url);
for (let i = 0; i < 10; i++) await runAction(page, action);

const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 50 });
await cdp.send('Profiler.start');
const times = [];
for (let i = 0; i < runs; i++) times.push(await runAction(page, action));
const { profile } = await cdp.send('Profiler.stop');
await browser.close();
server.close();
writeFileSync(out, JSON.stringify(profile));

const { byId, parent, selfMs } = readProfile(out);
const where = (n) => `${functionKey(n)} ${n.callFrame.url.split('/').pop()}`.trimEnd();
const self = new Map();
for (const [id, ms] of selfMs) {
    const k = where(byId.get(id));
    self.set(k, (self.get(k) ?? 0) + ms);
}
// Inclusive: a sample counts once for every distinct function on its stack.
const inclusive = new Map();
for (let i = 0; i < profile.samples.length; i++) {
    const seen = new Set();
    for (let id = profile.samples[i]; id !== undefined; id = parent.get(id)) {
        const k = where(byId.get(id));
        if (seen.has(k)) continue;
        seen.add(k);
        inclusive.set(k, (inclusive.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
    }
}
const total = [...self.values()].reduce((a, b) => a + b, 0);
const rows = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, ms]) => `${ms.toFixed(1).padStart(8)} ms ${(100 * ms / total).toFixed(1).padStart(5)}%  ${k}`).join('\n');

console.log(`${action.label}: median ${median(times).toFixed(2)} ms over ${runs} runs; ${total.toFixed(0)} ms sampled`);
console.log(`profile → ${relative(process.cwd(), out)}`);
console.log('— self —');
console.log(rows(self, 15));
console.log('— inclusive —');
// The engine's own frames say nothing about the code, and `(root)` holds every sample.
const ENGINE = /^\((root|program|idle|garbage collector)\):/;
console.log(rows(new Map([...inclusive].filter(([k]) => !ENGINE.test(k))), 15));
