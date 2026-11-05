// The top-down call tree of a saved profile, from a function:
//
//   node tools/perf/tree.mjs <profile> <root> [minMs] [depth]
//
// <root> is a function's name, or `name:line` to pick one of several with that name. The tree starts
// at every outermost call of it (one nested inside another call of it is counted inside that one), and
// merges the calls of one function under one parent into a row: its total milliseconds, its self
// milliseconds, and its key. Rows under <minMs> (5) are left out, and the tree stops at <depth> (8).
// This is the reading #685 found its cost by, where the self-time list pointed elsewhere.
import { functionKey, isFunction, readProfile } from './lib.mjs';

const [file, rootName, minArg, depthArg] = process.argv.slice(2);
if (!file || !rootName) {
    console.error('usage: tree.mjs <profile> <root> [minMs] [depth]');
    process.exit(2);
}
const min = Number(minArg ?? 5);
const maxDepth = Number(depthArg ?? 8);
const { profile, byId, parent, selfMs } = readProfile(file);

const totals = new Map();
const total = (n) => {
    let ms = totals.get(n.id);
    if (ms === undefined) {
        ms = (selfMs.get(n.id) ?? 0) + (n.children ?? []).reduce((a, c) => a + total(byId.get(c)), 0);
        totals.set(n.id, ms);
    }
    return ms;
};

/** Group nodes by function: { ms, self, nodes } per key. */
function merge(nodes) {
    const groups = new Map();
    for (const n of nodes) {
        const k = functionKey(n);
        const g = groups.get(k) ?? { ms: 0, self: 0, nodes: [] };
        g.ms += total(n);
        g.self += selfMs.get(n.id) ?? 0;
        g.nodes.push(n);
        groups.set(k, g);
    }
    return groups;
}

function print(groups, depth) {
    for (const [k, g] of [...groups].sort((a, b) => b[1].ms - a[1].ms)) {
        if (g.ms < min) continue;
        console.log(`${'  '.repeat(depth)}${g.ms.toFixed(1)} (self ${g.self.toFixed(1)})  ${k}`);
        if (depth < maxDepth) print(merge(g.nodes.flatMap((n) => (n.children ?? []).map((c) => byId.get(c)))), depth + 1);
    }
}

const roots = profile.nodes.filter((n) => {
    if (!isFunction(n, rootName)) return false;
    for (let p = parent.get(n.id); p !== undefined; p = parent.get(p)) if (isFunction(byId.get(p), rootName)) return false;
    return true;
});
if (roots.length === 0) {
    console.error(`no call of ${rootName} in ${file}`);
    process.exit(1);
}
print(merge(roots), 0);
