// What a component's slot received, as the server wrote it (#160, part 4).
//
// The content a slot received is its parent's: the server brackets it, in the place of the `<slot>`,
// with `<!--pdx-slot:<host id>:<name>-->` … `<!--/pdx-slot-->`. Two walks meet there — the parent's,
// which binds those nodes, and the component's, which steps over them — in either order, as the
// components' definitions upgrade them. Each region is read once per host and kept, and its markers
// go when both sides have been through it.

/** The nodes a slot of a pre-rendered host received, between the server's markers. */
export interface Region {
    readonly open: Comment;
    readonly close: Comment;
    /** The parent's walk, which binds the nodes, has been through it. */
    parentDone: boolean;
    /** The component's walk, which steps over them, has been through it. */
    ownerDone: boolean;
    /**
     * The region's nodes, when a host that renders afresh took them out to project them: they are then
     * in its slots, each slot's in a run of their own, where the parent's walk finds them.
     */
    taken: Node[] | null;
}

const SLOT_PREFIX = 'pdx-slot:';
const SLOT_CLOSE = '/pdx-slot';

const regionsByHost = new WeakMap<Element, Map<string, Region>>();

/** Whether `host`'s regions have been read: it was pre-rendered, even once its mark is gone. */
export function hasRegions(host: Element): boolean {
    return regionsByHost.has(host);
}

/** The regions of a pre-rendered host, by slot name — `*` for the light DOM of one the server skipped. */
export function regionsOf(host: Element): Map<string, Region> {
    let regions = regionsByHost.get(host);
    if (regions) return regions;
    regions = new Map();
    const id = host.getAttribute('data-pdx-ssr');
    if (id !== null) {
        const prefix = `${SLOT_PREFIX}${id}:`;
        const walker = document.createTreeWalker(host, NodeFilter.SHOW_COMMENT);
        for (let c = walker.nextNode() as Comment | null; c; c = walker.nextNode() as Comment | null) {
            if (c.data.startsWith(prefix)) {
                regions.set(c.data.slice(prefix.length), { open: c, close: slotClose(c), parentDone: false, ownerDone: false, taken: null });
            }
        }
    }
    regionsByHost.set(host, regions);
    return regions;
}

/** Whether `node` opens a slot's region. */
export function isSlotOpen(node: Node | null): node is Comment {
    return node !== null && node.nodeType === 8 && (node as Comment).data.startsWith(SLOT_PREFIX);
}

/** The `<!--/pdx-slot-->` that closes `open`, past the regions of other hosts nested at its level. */
export function slotClose(open: Comment): Comment {
    let depth = 0;
    for (let n = open.nextSibling; n; n = n.nextSibling) {
        if (n.nodeType !== 8) continue;
        const data = (n as Comment).data;
        if (data.startsWith(SLOT_PREFIX)) depth++;
        else if (data === SLOT_CLOSE) {
            if (depth === 0) return n as Comment;
            depth--;
        }
    }
    throw new Error('hydration: a slot\'s region is not closed');
}

/** One side is done with `r`: when both are, its markers go. */
export function release(r: Region, side: 'parent' | 'owner'): void {
    if (side === 'parent') r.parentDone = true;
    else r.ownerDone = true;
    if (!r.parentDone || !r.ownerDone || !r.open.parentNode) return;
    r.open.remove();
    r.close.remove();
}

/**
 * The nodes of the host's regions, taken out with their markers: what a host that renders afresh
 * projects. The parent's walk, if it has not been through them yet, then finds them where its mount
 * projected them.
 */
export function takeRegions(host: Element): Node[] {
    const out: Node[] = [];
    for (const r of regionsOf(host).values()) {
        r.taken = regionNodes(r);
        out.push(...r.taken);
        r.open.remove();
        r.close.remove();
    }
    return out;
}

/** The nodes in a region, as they stand. */
export function regionNodes(r: Region): Node[] {
    const out: Node[] = [];
    for (let n = r.open.nextSibling; n && n !== r.close; n = n.nextSibling) out.push(n);
    return out;
}
