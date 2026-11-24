// Projected children, as a boundary sees them (#1365).
//
// An error boundary clears everything between its markers when it shows its fallback, or renders its
// content again. A `<slot>` in that content was replaced by the host's own children when the host
// connected (component/slots.ts), and the projection runs once: a content rendered again brings a new
// `<slot>` that nothing fills, and the children are gone. So the boundary keeps, of the nodes it clears,
// those the projection placed, and puts them in the slots of its next content.
//
// Which nodes the projection placed is the component layer's to say: the boundary is a renderer, and
// asks through this resolver, set by the projection the first time it projects. With no component
// that projects, there is nothing to keep and the resolver stays unset.

/**
 * The host's own children the projection placed in `range`, the nodes between a boundary's markers
 * that start at `marker`: a node of the range, or one inside it (a slot inside an element of the content).
 */
export type ProjectedResolver = (marker: Node, range: Node[]) => Node[];

let resolver: ProjectedResolver | null = null;

/** Set by the slot projection (component/slots.ts) the first time it projects. */
export function setProjectedResolver(fn: ProjectedResolver): void {
    resolver = fn;
}

/** The projected children in `range` (see ProjectedResolver); none while no component has projected. */
export function projectedIn(marker: Node, range: Node[]): Node[] {
    return resolver === null ? [] : resolver(marker, range);
}

/** The slot a node asks for: its `slot` attribute, or null for the default slot. */
function slotOf(node: Node): string | null {
    return (node instanceof Element ? node.getAttribute('slot') : null) || null;
}

/**
 * `content` with `kept` in its `<slot>`s, as the projection places a host's children: a node with
 * `slot="name"` in the slot of that name, the others in the default slot, each slot replaced by its
 * nodes. A slot with no node keeps its own default content. The nodes no slot takes are dropped: the
 * content has no place for them.
 */
export function projectKept(content: Node, kept: Node[]): Node {
    // A content that is the slot itself has no parent to replace it in: a fragment gives it one.
    let root = content;
    if (content instanceof Element && content.localName === 'slot') {
        root = document.createDocumentFragment();
        root.appendChild(content);
    }
    if (!(root instanceof Element || root instanceof DocumentFragment)) return root;
    for (const slot of Array.from(root.querySelectorAll('slot'))) {
        const name = slot.getAttribute('name') || null;
        const nodes = kept.filter((n) => slotOf(n) === name);
        const parent = slot.parentNode;
        if (nodes.length === 0 || !parent) continue;
        for (const n of nodes) parent.insertBefore(n, slot);
        parent.removeChild(slot);
    }
    return root;
}
