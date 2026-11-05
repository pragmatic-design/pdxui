// Bottom-up: who a function's self time is spent for.
//
//   node tools/perf/callers.mjs <profile> <fn> [depth]
//
// <fn> is a function's name, or `name:line`. Every sample taken inside <fn> itself is grouped by the
// chain of its callers, up to <depth> (6) frames, and the ten chains with the most milliseconds are
// printed, nearest caller first.
import { functionKey, isFunction, readProfile } from './lib.mjs';

const [file, name, depthArg] = process.argv.slice(2);
if (!file || !name) {
    console.error('usage: callers.mjs <profile> <fn> [depth]');
    process.exit(2);
}
const depth = Number(depthArg ?? 6);
const { profile, byId, parent } = readProfile(file);

const chains = new Map();
let total = 0;
for (let i = 0; i < profile.samples.length; i++) {
    const n = byId.get(profile.samples[i]);
    if (!isFunction(n, name)) continue;
    const ms = (profile.timeDeltas[i] ?? 0) / 1000;
    const chain = [];
    for (let p = parent.get(n.id); p !== undefined && chain.length < depth; p = parent.get(p)) chain.push(functionKey(byId.get(p)));
    const k = chain.join(' < ');
    chains.set(k, (chains.get(k) ?? 0) + ms);
    total += ms;
}
if (total === 0) {
    console.error(`no sample inside ${name} in ${file}`);
    process.exit(1);
}
console.log(`${name}: ${total.toFixed(1)} ms of self time`);
for (const [k, ms] of [...chains].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`${ms.toFixed(1).padStart(8)} ms  ${k}`);
