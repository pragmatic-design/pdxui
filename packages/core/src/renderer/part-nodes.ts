// Part nodes — the nodes a template part places after its template was rendered: a reactive part's
// redraw, the branch of a when/match, a list's items, a scoped slot, a deferred or dynamic block.
//
// A component's late-slot watcher (PdxElement._watchLateSlots) moves the children added to its host
// after mount into its empty <slot>: that is for foreign DOM, a framework or a parser appending late.
// Unmarked, it cannot tell those from the nodes its own template redraws on the host, and moves them
// too — into a hidden slot, and in Chromium a redraw that follows them freezes the page. A node a
// part placed is where its template wants it.
//
// Only that watcher asks, only about the nodes placed directly on its host, and only about those
// placed since its last batch of records. So a watching host collects exactly those, and the watcher
// empties the set at every batch; a node placed anywhere else is left as it was. Two marks were
// measured and dropped: a WeakSet of every node a part ever placed is a hash table V8 sizes to the
// nodes created between two full collections and never shrinks (a page mounted and destroyed 100
// times grew the heap 14–20%, #243, `packages/showcase/tests/scenario-memory.spec.ts`); a symbol
// property on every placed node cost select1k 0.3 ms, 1.30 → 1.65, under a 4x CPU throttle (#734).

const watched = new WeakMap<Node, Set<Node>>();
/** Hosts watching now: while none is, a placement does not even look a host up. */
let watching = 0;

/**
 * Start collecting the nodes parts place directly on `host`. The caller empties the set after each
 * batch of mutation records it reads, and stops with `unwatchPartNodes` when its observer does.
 */
export function watchPartNodes(host: Node): Set<Node> {
    let placed = watched.get(host);
    if (!placed) { placed = new Set(); watched.set(host, placed); watching++; }
    return placed;
}

/** Stop collecting for `host` (see watchPartNodes). */
export function unwatchPartNodes(host: Node): void {
    if (watched.delete(host)) watching--;
}

/** Insert `node` before `before` on behalf of a template part, and remember that a part placed it. */
export function placePartNode(parent: Node, node: Node, before: Node | null): void {
    if (watching !== 0) watched.get(parent)?.add(node);
    parent.insertBefore(node, before);
}

/**
 * Insert `nodes` before `before` in ONE operation — a fragment — each remembered as placed by a part.
 * A list appending a thousand rows does one insertion, not a thousand (#118).
 */
export function placePartNodes(parent: Node, nodes: readonly Node[], before: Node | null): void {
    if (nodes.length === 1) { placePartNode(parent, nodes[0], before); return; }
    const placed = watching !== 0 ? watched.get(parent) : undefined;
    const frag = (parent.ownerDocument ?? document).createDocumentFragment();
    for (const n of nodes) { placed?.add(n); frag.appendChild(n); }
    parent.insertBefore(frag, before);
}
