// Part nodes — the nodes a template part places after its template was rendered: a reactive part's
// redraw, the branch of a when/match, a list's items, a scoped slot, a deferred or dynamic block.
//
// A component's late-slot watcher (PdxElement._watchLateSlots) moves the children added to its host
// after mount into its empty <slot>: that is for foreign DOM, a framework or a parser appending late.
// Unmarked, it cannot tell those from the nodes its own template redraws on the host, and moves them
// too — into a hidden slot, and in Chromium a redraw that follows them freezes the page. A node a
// part placed is where its template wants it.

const partNodes = new WeakSet<Node>();

/** Insert `node` before `before` on behalf of a template part, and remember that a part placed it. */
export function placePartNode(parent: Node, node: Node, before: Node | null): void {
    partNodes.add(node);
    parent.insertBefore(node, before);
}

/**
 * Insert `nodes` before `before` in ONE operation — a fragment — each remembered as placed by a part.
 * A list appending a thousand rows does one insertion, not a thousand (#118).
 */
export function placePartNodes(parent: Node, nodes: readonly Node[], before: Node | null): void {
    if (nodes.length === 1) { placePartNode(parent, nodes[0], before); return; }
    const frag = (parent.ownerDocument ?? document).createDocumentFragment();
    for (const n of nodes) { partNodes.add(n); frag.appendChild(n); }
    parent.insertBefore(frag, before);
}

/** Whether a template part placed `node` (see placePartNode). */
export function isPartNode(node: Node): boolean {
    return partNodes.has(node);
}
