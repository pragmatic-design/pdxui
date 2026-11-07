// Hydration (#160, part 4): the client takes over the nodes a page's static generation wrote, instead
// of building them again.
//
// The server wrote the markup by walking each template's tree (server/template-tree.ts) with its
// values (server/render-string.ts). This walks the same tree against the nodes that markup parsed
// into, and binds instead of printing: an element is the one the template names, its bound
// attributes are bound by the client's own code (`bindPlannedAttribute`), a value goes where the
// server bracketed it with `<!--pdx-->` … `<!--/pdx-->`, and those markers are removed, so the page
// ends as the client would have mounted it. A template inside a value was not built — while hydrating
// html`` returns it as a DeferredTemplate — and is adopted when its place is reached; a helper's block
// is a HydrationBlock that takes over its own markers, or is built and put in their place.
//
// The first difference from what the template says throws a HydrationMismatch: the component then
// renders as it would have without the server's markup (element.ts).

import { templateTree, type TreeNode } from '../server/template-tree';
import { isDeferredTemplate } from '../server/mode';
import { attributeBinding, PH_EXTRACT } from '../renderer/template-plan';
import { bindAdoptedValue, bindPlannedAttribute, html, interpolationText } from '../renderer/template';
import { isHydrationBlock, withHydration, withoutHydration, type Adopter, type HydrationBlock } from './mode';

/** The server's markup is not what the template renders: the component renders instead. */
export class HydrationMismatch extends Error {
    constructor(what: string) {
        super(`hydration: ${what}`);
        this.name = 'HydrationMismatch';
    }
}

const PART_OPEN = 'pdx';
const PART_CLOSE = '/pdx';
/** The comment a false `show()` puts in place of a top-level text (helpers.ts). */
const SHOW_PLACEHOLDER = 'show';

/**
 * Adopt `render()`'s result over the children of `container`, which must be exactly what the server
 * wrote for it. Throws a HydrationMismatch, having bound part of it, when they differ: the caller
 * disposes what was bound and renders afresh.
 */
export function hydrateChildren(container: Node, render: () => unknown): void {
    withHydration(() => {
        const next = adoptValue(render(), container, container.firstChild, null, null);
        if (next !== null) throw new HydrationMismatch(`markup left after the render: ${describe(next)}`);
    });
}

/** The walk a helper's block adopts its content with. */
const adopter: Adopter = {
    value: (value, parent, at, end, hidden) => adoptValue(value, parent, at, end, hidden ?? null),
    close: (start, open, close) => blockClose(start, open, close),
    expect: (at, data) => expectComment(at, data),
    fail: (what) => { throw new HydrationMismatch(what); },
    between: (content, parent, start, end) => {
        // Nothing — a false condition with no else, a case with no default — is no node at all.
        const rest = content == null ? start.nextSibling : adoptValue(content, parent, start.nextSibling, end, null);
        if (rest !== end) throw new HydrationMismatch(`the block <!--${start.data}--> has markup its content does not: ${describe(rest)}`);
    },
    build: (node) => withoutHydration(() => buildNode(node)),
};

/**
 * A value that is not a function, adopted from `at` on, in `parent`, before `end`: returns the node
 * after what it took. What the client's `toNodes` would put there, as the server wrote it. `hidden`:
 * the value is the top level of a false `show()`.
 */
function adoptValue(value: unknown, parent: Node, at: Node | null, end: Node | null, hidden: Map<Text, Comment> | null): Node | null {
    if (isDeferredTemplate(value)) return adoptNodes(templateTree(value.strings), value.values, parent, at, end, hidden);
    if (isHydrationBlock(value)) return adoptBlock(value, parent, at, end);
    if (Array.isArray(value)) {
        let next = at;
        for (const item of value) next = adoptValue(item, parent, next, end, hidden);
        return next;
    }
    if (value instanceof Node) {
        // A node the script built: the server could not write it, and the client puts it here.
        parent.insertBefore(value, at);
        return at;
    }
    return adoptText(interpolationText(value), parent, at, hidden);
}

/**
 * `text`, which the server wrote as one text node or as the start of one it merged with what follows:
 * the node is split where the client has two. Empty text the server wrote as nothing, and the client
 * has an empty text node there, which is put in. Hidden, the server wrote the `show` comment that keeps
 * the text's place: the text is made, detached, and paired with it.
 */
function adoptText(text: string, parent: Node, at: Node | null, hidden: Map<Text, Comment> | null): Node | null {
    if (hidden) {
        const placeholder = expectComment(at, SHOW_PLACEHOLDER);
        hidden.set(document.createTextNode(text), placeholder);
        return placeholder.nextSibling;
    }
    if (text === '') {
        parent.insertBefore(document.createTextNode(''), at);
        return at;
    }
    if (!(at instanceof Text) || !at.data.startsWith(text)) {
        throw new HydrationMismatch(`expected the text ${JSON.stringify(text)}, found ${describe(at)}`);
    }
    if (at.data.length > text.length) at.splitText(text.length);
    return at.nextSibling;
}

/** A template's nodes, walked against the DOM from `at` on; `hidden` applies to these, not their children. */
function adoptNodes(list: readonly TreeNode[], values: readonly unknown[], parent: Node, at: Node | null, end: Node | null, hidden: Map<Text, Comment> | null): Node | null {
    let next = at;
    for (const n of list) {
        if (next === end && n.kind !== 'hole') throw new HydrationMismatch(`expected ${n.kind === 'element' ? `<${n.name}>` : n.kind}, found the end of its place`);
        if (n.kind === 'text') next = adoptText(decodeText(n.raw), parent, next, hidden);
        else if (n.kind === 'comment') {
            if (!(next instanceof Comment)) throw new HydrationMismatch(`expected a comment, found ${describe(next)}`);
            next = next.nextSibling;
        } else if (n.kind === 'hole') next = adoptHole(values[n.index], parent, next, hidden);
        else next = adoptElement(n, values, next);
    }
    return next;
}

type ElementNode = Extract<TreeNode, { kind: 'element' }>;

function adoptElement(n: ElementNode, values: readonly unknown[], node: Node | null): Node | null {
    if (!(node instanceof Element) || node.localName !== n.name) {
        throw new HydrationMismatch(`expected <${n.name}>, found ${describe(node)}`);
    }
    // The next node is taken before binding: a binding may replace the element's content, not the element.
    const next = node.nextSibling;
    let ownsChildren = true;
    for (const a of n.attributes) {
        if (a.value === null || !PH_EXTRACT.test(a.value)) continue;
        bindPlannedAttribute(node, attributeBinding([], a.name, a.value), values as unknown[]);
        // A binding that writes the content itself: what the template has inside is not rendered.
        if (/^:(textcontent|innertext|innerhtml)$/.test(a.name)) ownsChildren = false;
    }
    if (ownsChildren && !n.void && !n.name.includes('-')) {
        const rest = adoptNodes(n.children, values, node, node.firstChild, null, null);
        if (rest !== null) throw new HydrationMismatch(`<${n.name}> has markup the template does not: ${describe(rest)}`);
    }
    return next;
}

/** A value's place: the server's markers around what it wrote, which go once the value is adopted. */
function adoptHole(value: unknown, parent: Node, at: Node | null, hidden: Map<Text, Comment> | null): Node | null {
    const open = expectComment(at, PART_OPEN);
    const close = partClose(open);
    if (typeof value === 'function') {
        bindAdoptedValue(value as () => unknown, (result) => adoptRange(result, parent, open, close, hidden));
    } else {
        const rest = adoptValue(value, parent, open.nextSibling, close, hidden);
        if (rest !== close) throw new HydrationMismatch(`a value's place has markup the value does not: ${describe(rest)}`);
    }
    const next = close.nextSibling;
    parent.removeChild(open);
    parent.removeChild(close);
    return next;
}

/** The first result of a reactive value, adopted between its markers: the nodes that stand there. */
function adoptRange(result: unknown, parent: Node, open: Comment, close: Comment, hidden: Map<Text, Comment> | null): Node[] {
    const rest = adoptValue(result, parent, open.nextSibling, close, hidden);
    if (rest !== close) throw new HydrationMismatch(`a value's place has markup the value does not: ${describe(rest)}`);
    const nodes: Node[] = [];
    for (let n = open.nextSibling; n && n !== close; n = n.nextSibling) nodes.push(n);
    return nodes;
}

/** The `<!--/pdx-->` that closes `open`, past the places nested in it. */
function partClose(open: Comment): Comment {
    let depth = 0;
    for (let n = open.nextSibling; n; n = n.nextSibling) {
        if (!(n instanceof Comment)) continue;
        if (n.data === PART_OPEN) depth++;
        else if (n.data === PART_CLOSE) {
            if (depth === 0) return n;
            depth--;
        }
    }
    throw new HydrationMismatch('a value\'s place is not closed');
}

/**
 * A helper's block: it takes over its own markers when it can; otherwise it is built as the client
 * builds it and put where the server's copy was.
 */
function adoptBlock(b: HydrationBlock, parent: Node, at: Node | null, end: Node | null): Node | null {
    if (b.adopt) return b.adopt(adopter, parent, at, end);
    const [open, close] = b.markers;
    const start = expectComment(at, open);
    const last = close === null ? start : blockClose(start, open, close);
    const next = last.nextSibling;
    const built = withoutHydration(() => b.build(adopter));
    for (let n: Node | null = start; n && n !== next;) {
        const following: Node | null = n.nextSibling;
        parent.removeChild(n);
        n = following;
    }
    parent.insertBefore(built, next);
    return next;
}

/** The comment that closes a block opened by `start`, past blocks of the same kind nested in it. */
function blockClose(start: Comment, open: string, close: string): Comment {
    let depth = 0;
    for (let n = start.nextSibling; n; n = n.nextSibling) {
        if (!(n instanceof Comment)) continue;
        if (n.data === open) depth++;
        else if (n.data === close) {
            if (depth === 0) return n;
            depth--;
        }
    }
    throw new HydrationMismatch(`the block <!--${open}--> is not closed`);
}

function expectComment(at: Node | null, data: string): Comment {
    if (!(at instanceof Comment) || at.data !== data) throw new HydrationMismatch(`expected <!--${data}-->, found ${describe(at)}`);
    return at;
}

/**
 * A value made while hydrating, built as the client builds it: a template with its values built, a
 * block by its own call. What a block that cannot adopt is handed when it is built.
 */
function build(value: unknown): unknown {
    if (value instanceof Node) return buildNode(value);
    if (Array.isArray(value)) return value.map(build);
    return value;
}

function buildNode(node: Node): Node {
    if (isDeferredTemplate(node)) return html(node.strings, ...node.values.map(build));
    if (isHydrationBlock(node)) return node.build(adopter);
    return node;
}

/** A template's static text as the parser reads it: its character references decoded, once each. */
const decoded = new Map<string, string>();
function decodeText(raw: string): string {
    if (!raw.includes('&')) return raw;
    let text = decoded.get(raw);
    if (text === undefined) {
        const area = document.createElement('textarea');
        area.innerHTML = raw;
        text = area.value;
        decoded.set(raw, text);
    }
    return text;
}

function describe(node: Node | null): string {
    if (node === null) return 'nothing';
    if (node instanceof Element) return `<${node.localName}>`;
    if (node instanceof Comment) return `<!--${node.data}-->`;
    if (node instanceof Text) return `the text ${JSON.stringify(node.data.slice(0, 40))}`;
    return node.nodeName;
}
