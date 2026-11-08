/**
 * What keeps a live instance of a tag: the shortest path from the GC roots to one, read from a heap
 * snapshot (#937).
 *
 * `scenario-component-retention.spec.ts` counts live instances; when a row counts one, it attaches this
 * path, so the failure says what held the instance, not only that something did. One row failed under the
 * gate's load and never again on its own, so the data has to come from the failing run itself.
 *
 * The path follows strong edges only: a weak edge does not keep its target alive, and the shortest path
 * through strong edges is the chain whose break frees the instance. Each line is one object, with the
 * edge that led to it.
 */
import type { Page } from '@playwright/test';

interface Snapshot {
    snapshot: { meta: { node_fields: string[]; node_types: [string[], ...unknown[]]; edge_fields: string[]; edge_types: [string[], ...unknown[]] } };
    nodes: number[];
    edges: number[];
    strings: string[];
}

/** A line per object from the GC roots to one live instance of `tag`; empty when none is alive. */
export async function retainerPath(page: Page, tag: string): Promise<string> {
    const cdp = await page.context().newCDPSession(page);
    try {
        await cdp.send('HeapProfiler.enable');
        await cdp.send('HeapProfiler.collectGarbage');
        // The snapshot first: heap ids are assigned by it (before one, `getHeapObjectId` answers 0), and
        // taken now it holds no reference of this session's, which the instance query below adds.
        const chunks: string[] = [];
        const onChunk = (event: { chunk: string }) => { chunks.push(event.chunk); };
        cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
        await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
        cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
        const { result: proto } = await cdp.send('Runtime.evaluate', { expression: `customElements.get(${JSON.stringify(tag)}).prototype` });
        const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.objectId! });
        const { result: first } = await cdp.send('Runtime.callFunctionOn', {
            objectId: objects.objectId!,
            functionDeclaration: 'function () { return this[0]; }',
        });
        if (!first.objectId) return '';
        const { heapSnapshotObjectId } = await cdp.send('HeapProfiler.getHeapObjectId', { objectId: first.objectId });
        return pathTo(JSON.parse(chunks.join('')) as Snapshot, Number(heapSnapshotObjectId));
    } finally {
        await cdp.detach();
    }
}

/** The shortest strong path from the snapshot's root to the node whose id is `id`, one line per hop. */
function pathTo(heap: Snapshot, id: number): string {
    const { node_fields, node_types, edge_fields, edge_types } = heap.snapshot.meta;
    const nodeSize = node_fields.length;
    const edgeSize = edge_fields.length;
    const nType = node_fields.indexOf('type');
    const nName = node_fields.indexOf('name');
    const nId = node_fields.indexOf('id');
    const nEdges = node_fields.indexOf('edge_count');
    const eType = edge_fields.indexOf('type');
    const eName = edge_fields.indexOf('name_or_index');
    const eTo = edge_fields.indexOf('to_node');
    const nodeTypes = node_types[0];
    const edgeTypes = edge_types[0];
    const weak = edgeTypes.indexOf('weak');
    const nodeCount = heap.nodes.length / nodeSize;

    // Where each node's edges start in `edges`.
    const firstEdge = new Uint32Array(nodeCount + 1);
    for (let n = 0; n < nodeCount; n++) firstEdge[n + 1] = firstEdge[n] + heap.nodes[n * nodeSize + nEdges] * edgeSize;

    let target = -1;
    for (let n = 0; n < nodeCount; n++) if (heap.nodes[n * nodeSize + nId] === id) { target = n; break; }
    if (target < 0) return `(the instance, heap id ${id}, is not in the snapshot)`;

    // Breadth first from the root (node 0), over strong edges: the first time the target is reached is
    // through a shortest chain. `via` keeps the edge each node was first reached by.
    const via = new Int32Array(nodeCount).fill(-1);
    const from = new Int32Array(nodeCount).fill(-1);
    const queue = new Uint32Array(nodeCount);
    let head = 0;
    let tail = 0;
    queue[tail++] = 0;
    from[0] = 0;
    while (head < tail && from[target] < 0) {
        const n = queue[head++];
        for (let e = firstEdge[n]; e < firstEdge[n + 1]; e += edgeSize) {
            if (heap.edges[e + eType] === weak) continue;
            const to = heap.edges[e + eTo] / nodeSize;
            if (from[to] >= 0) continue;
            from[to] = n;
            via[to] = e;
            queue[tail++] = to;
        }
    }
    if (from[target] < 0) return `(no strong path from the GC roots to the instance, heap id ${id})`;

    const describe = (n: number): string =>
        `${heap.strings[heap.nodes[n * nodeSize + nName]]} (${nodeTypes[heap.nodes[n * nodeSize + nType]]}, @${heap.nodes[n * nodeSize + nId]})`;
    const edgeName = (e: number): string => {
        const type = edgeTypes[heap.edges[e + eType]];
        const name = heap.edges[e + eName];
        return type === 'element' || type === 'hidden' ? `[${name}]` : `${type} ${JSON.stringify(heap.strings[name])}`;
    };
    const lines: string[] = [];
    for (let n = target; n !== 0; n = from[n]) lines.push(`--${edgeName(via[n])}--> ${describe(n)}`);
    lines.push(describe(0));
    return lines.reverse().join('\n');
}
