// What a .pdx compiled to hydrate calls (#160, part 4b). The compiler writes it into a module only when
// the app hydrates (compile option `hydrate`): a block's render then either builds its markup, as it
// always does, or takes over the nodes the server wrote for it, walking them with the same paths as the
// clone, a value's place — `<!--pdx-->` … `<!--/pdx-->` — counting as one node.
//
// Who adopts a compiled block hands it the range to walk (hydrate/adopt.ts): the host's children for a
// component's root, the content between a `when`'s markers for a branch, the run of a row. The block
// takes it with `hydrationRange()` and answers `adoptedRange(range)`, which says it took it up to
// `range.next`.

import { isHydrating } from './mode';
import { hasRegions, isSlotOpen, regionsOf, release, slotClose } from './regions';

/** Where a block's markup stands in the page, and — once its walk has run — the node after it. */
export interface HydrationRange {
    readonly parent: Node;
    readonly at: Node | null;
    /** The node after the block's markup: set by the block's walk. */
    next: Node | null;
}

let pending: HydrationRange | null = null;

/** Hand `range` to the compiled block `render()` is about to start (hydrate/adopt.ts). */
export function offerRange<T>(range: HydrationRange, render: () => T): T {
    const outer = pending;
    pending = range;
    try {
        return render();
    } finally {
        pending = outer;
    }
}

/**
 * The range a compiled block is to take over, or null when it builds its markup: outside a hydration,
 * or inside one where nothing handed it a range (a block the client renders afresh).
 */
export function hydrationRange(): HydrationRange | null {
    if (!isHydrating()) return null;
    const range = pending;
    pending = null;
    return range;
}

const PART_OPEN = 'pdx';
const PART_CLOSE = '/pdx';

function isPartOpen(node: Node | null): node is Comment {
    return node !== null && node.nodeType === 8 && (node as Comment).data === PART_OPEN;
}

/** The `<!--/pdx-->` that closes `open`, past the places nested in it. */
export function partClose(open: Comment): Comment {
    let depth = 0;
    for (let n = open.nextSibling; n; n = n.nextSibling) {
        if (n.nodeType !== 8) continue;
        const data = (n as Comment).data;
        if (data === PART_OPEN) depth++;
        else if (data === PART_CLOSE) {
            if (depth === 0) return n as Comment;
            depth--;
        }
    }
    throw new Error('hydration: a value\'s place is not closed');
}

/**
 * The node after `node` in the client's static markup: a value's place counts as one node, and so does
 * what a `<slot>` received, which the server wrote in the slot's place.
 */
export function skipNode(node: Node | null): Node | null {
    if (node === null) throw new Error('hydration: the markup ends before the template does');
    if (isPartOpen(node)) return partClose(node).nextSibling;
    if (isSlotOpen(node)) return slotClose(node).nextSibling;
    return node.nextSibling;
}

/**
 * A child the template gives the component `host`: where its slot put it in the server's markup — the
 * `inGroup`-th node of the region of slot `slot`, or the `inAll`-th of the light DOM of a component the
 * server could not render. A host that is not a pre-rendered component has its children in place.
 */
export function projectedNode(host: Element, slot: string, inGroup: number, inAll: number): Node | null {
    let node: Node | null;
    let steps: number;
    if (!hasRegions(host) && !host.hasAttribute('data-pdx-ssr')) {
        node = host.firstChild;
        steps = inAll;
    } else {
        const regions = regionsOf(host);
        const light = regions.get('*');
        const region = light ?? regions.get(slot);
        if (!region) throw new Error(`hydration: <${host.localName}> has no slot "${slot}" in its markup`);
        release(region, 'parent');
        node = region.open.nextSibling;
        steps = light ? inAll : inGroup;
    }
    for (let k = 0; k < steps; k++) node = skipNode(node);
    return node;
}

/** `node`, which must be the element `tag`: what the walk reaches is what the template binds. */
export function checkNode(node: Node | null, tag: string): Element {
    if (node === null || node.nodeType !== 1 || (node as Element).localName !== tag) {
        throw new Error(`hydration: expected <${tag}>, found ${node === null ? 'nothing' : node.nodeName}`);
    }
    return node as Element;
}

/**
 * An interpolation's place, `open`, as the text node the client binds: the text the server wrote, or
 * an empty one where it wrote none. The markers go. A place that holds more than a text — a template
 * the value returned — is emptied: the binding renders it, as a mount does.
 */
export function partText(open: Node | null): Text {
    if (!isPartOpen(open)) throw new Error('hydration: expected a value\'s place');
    const close = partClose(open);
    const parent = open.parentNode!;
    let text: Text | null = null;
    const only = open.nextSibling;
    if (only && only.nodeType === 3 && only.nextSibling === close) text = only as Text;
    else for (let n: Node | null = open.nextSibling; n && n !== close;) { const after: Node | null = n.nextSibling; parent.removeChild(n); n = after; }
    if (!text) {
        text = document.createTextNode('');
        parent.insertBefore(text, close);
    }
    parent.removeChild(open);
    parent.removeChild(close);
    return text;
}

/**
 * What a compiled block that took over its range answers: a DocumentFragment, as a block returns, that
 * says the block's markup ended before `range.next`.
 */
export type AdoptedRange = DocumentFragment & { readonly range: HydrationRange };

let AdoptedRangeClass: (new (range: HydrationRange) => AdoptedRange) | null = null;

/** A compiled block's answer once it has taken over `range`. */
export function adoptedRange(range: HydrationRange): AdoptedRange {
    AdoptedRangeClass ??= class extends DocumentFragment {
        constructor(readonly range: HydrationRange) { super(); }
    };
    return new AdoptedRangeClass(range);
}

/** Whether `value` is an AdoptedRange. */
export function isAdoptedRange(value: unknown): value is AdoptedRange {
    return AdoptedRangeClass !== null && value instanceof AdoptedRangeClass;
}

/**
 * Put a block where its anchor `marker` is: in a mount, in its place; while hydrating, `marker` is the
 * open of the value's place the server wrote, and the block takes over what is in it (hydrate/adopt.ts).
 */
export function placePart(marker: ChildNode, block: Node): void {
    if (adoptPart && isPartOpen(marker) && isHydrating()) adoptPart(marker, block);
    else marker.replaceWith(block);
}

let adoptPart: ((open: Comment, value: unknown) => void) | null = null;

/** Install how a value's place adopts its value (hydrate/adopt.ts). */
export function installPartAdoption(adopt: (open: Comment, value: unknown) => void): void {
    adoptPart = adopt;
}
