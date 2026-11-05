// Why a removed component stays alive: the shortest strong paths from the GC roots to its elements.
//
//   node tools/perf/retainers.mjs <dir> <tag> [paths] [--mounts <n>]
//
// Serves the component-mount build in <dir>, mounts and removes <tag> 100 at a time (3 rounds by
// default), forces a GC, takes a heap snapshot and walks it backwards from each live `<tag …>` element
// to the root, over strong edges only (weak and shortcut edges do not keep anything). Paths that
// differ only by array indices are counted as one; the <paths> most frequent are printed, root first.
// Build the scenario unminified, or the functions on the path are one letter long.
import { flag, mountScenario, snapshot } from './memory.mjs';

const args = process.argv.slice(2);
const mounts = Number(flag(args, '--mounts') ?? 3);
const [dir, tag, pathsArg] = args;
if (!dir || !tag) {
    console.error('usage: retainers.mjs <dir> <tag> [paths] [--mounts <n>]');
    process.exit(2);
}
const { page, close } = await mountScenario(dir);
for (let i = 0; i < mounts; i++) await page.evaluate((t) => window.__mount(t, 100), tag);
const snap = await snapshot(page);
await close();

const { nodes, edges, strings } = snap;
const { node_fields: nf, edge_fields: ef, node_types: [nodeTypes], edge_types: [edgeTypes] } = snap.snapshot.meta;
const NF = nf.length, EF = ef.length;
const nType = nf.indexOf('type'), nName = nf.indexOf('name'), nEdges = nf.indexOf('edge_count');
const eType = ef.indexOf('type'), eName = ef.indexOf('name_or_index'), eTo = ef.indexOf('to_node');
const count = nodes.length / NF;
const firstEdge = new Uint32Array(count + 1);
for (let i = 0, e = 0; i < count; i++) { firstEdge[i] = e; e += nodes[i * NF + nEdges] * EF; }
firstEdge[count] = edges.length;
// Strong edges only. A WeakMap's value is held by an "part of key … pair in WeakMap" edge that keeps
// it only while its key is reachable some other way: an ephemeron, not a root, and a shortest path
// through one points at the WeakMap instead of at whatever holds the key.
const ephemeron = (e) => edgeTypes[edges[e + eType]] === 'internal' && /part of key/.test(strings[edges[e + eName]] ?? '');
const parents = Array.from({ length: count }, () => []);
for (let i = 0; i < count; i++) {
    for (let e = firstEdge[i]; e < firstEdge[i + 1]; e += EF) {
        const type = edgeTypes[edges[e + eType]];
        if (type !== 'weak' && type !== 'shortcut' && !ephemeron(e)) parents[edges[e + eTo] / NF].push([i, e]);
    }
}
const name = (i) => strings[nodes[i * NF + nName]];
const typeOf = (i) => nodeTypes[nodes[i * NF + nType]];
const label = (e) => {
    const type = edgeTypes[edges[e + eType]];
    return type === 'element' || type === 'hidden' ? '[n]' : `${type}:${strings[edges[e + eName]]}`.replace(/internal:\d+$/, 'internal:n');
};
const targets = [];
for (let i = 0; i < count; i++) if (typeOf(i) === 'native' && name(i).startsWith(`<${tag} `)) targets.push(i);
console.log(`${tag}: ${targets.length} live elements in the snapshot`);
const chains = new Map();
for (const target of targets.slice(0, 40)) {
    const prev = new Map([[target, null]]);
    const queue = [target];
    let found = false;
    while (queue.length) {
        const n = queue.shift();
        if (n === 0) { found = true; break; }
        for (const [p, e] of parents[n]) if (!prev.has(p)) { prev.set(p, [n, e]); queue.push(p); }
    }
    if (!found) continue;
    const chain = [];
    for (let n = 0; n !== target;) { const [child, e] = prev.get(n); chain.push(`${typeOf(n)}:${name(n).slice(0, 60)}  --${label(e)}-->`); n = child; }
    chain.push(`${typeOf(target)}:${name(target).slice(0, 60)}`);
    const key = chain.join('\n    ');
    chains.set(key, (chains.get(key) ?? 0) + 1);
}
for (const [chain, n] of [...chains].sort((a, b) => b[1] - a[1]).slice(0, Number(pathsArg ?? 3))) console.log(`\n${n}× ${chain}`);
