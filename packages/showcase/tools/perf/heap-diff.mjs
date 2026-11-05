// What grows: two heap snapshots of a tag's mounts, diffed by object kind.
//
//   node tools/perf/heap-diff.mjs <dir> <tag> [rounds]
//
// Mounts and removes <tag> 100 at a time for <rounds> (5), takes a snapshot, mounts twice as many more,
// takes another, and prints the 20 kinds of object (`type name`) whose total size grew most, with how
// many were added per mount. A kind that grows by a steady count per mount is what a leak is made of
// even when no instance is kept: `closure recompute` and `markDirty` at 14 a mount were the computeds
// of #889.
import { mountScenario, snapshot } from './memory.mjs';

const [dir, tag, roundsArg] = process.argv.slice(2);
if (!dir || !tag) {
    console.error('usage: heap-diff.mjs <dir> <tag> [rounds]');
    process.exit(2);
}
const rounds = Number(roundsArg ?? 5);
const { page, close } = await mountScenario(dir);
const mount = () => page.evaluate((t) => window.__mount(t, 100), tag);

/** Total self size and count of each `type name` in a snapshot. */
function byKind(snap) {
    const { node_fields: nf, node_types: [types] } = snap.snapshot.meta;
    const NF = nf.length, iType = nf.indexOf('type'), iName = nf.indexOf('name'), iSize = nf.indexOf('self_size');
    const kinds = new Map();
    for (let i = 0; i < snap.nodes.length; i += NF) {
        const type = types[snap.nodes[i + iType]];
        const name = /string|number/.test(type) ? `(${type})` : snap.strings[snap.nodes[i + iName]].slice(0, 70);
        const key = `${type} ${name}`;
        const k = kinds.get(key) ?? { count: 0, size: 0 };
        k.count++;
        k.size += snap.nodes[i + iSize];
        kinds.set(key, k);
    }
    return kinds;
}

for (let i = 0; i < rounds; i++) await mount();
const before = byKind(await snapshot(page));
for (let i = 0; i < rounds * 2; i++) await mount();
const after = byKind(await snapshot(page));
await close();

const added = rounds * 2 * 100;
console.log(`${tag}: ${added} mounts between the two snapshots`);
const rows = [...after].map(([k, v]) => ({ k, count: v.count - (before.get(k)?.count ?? 0), size: v.size - (before.get(k)?.size ?? 0) }))
    .filter((r) => r.size > 0).sort((a, b) => b.size - a.size).slice(0, 20);
for (const r of rows) console.log(`${(r.size / 1024).toFixed(0).padStart(7)} KB  +${String(r.count).padStart(7)}  ${(r.count / added).toFixed(2).padStart(6)}/mount  ${r.k}`);
