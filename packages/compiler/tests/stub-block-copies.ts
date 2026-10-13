// What the inline render needs of a document beyond creating nodes, for the tests that run it against
// stub nodes rather than a DOM (#109).
//
// Each block's static markup is built once into a <template>'s content and copied into the page with
// `document.importNode`, by core's `staticBlock`; the render then reaches the nodes it binds by
// `firstChild`/`nextSibling`, and puts a dynamic block in place of its marker with `replaceWith`. A
// stub document that only creates nodes has none of that. This adds it, over any stub whose nodes
// keep their children in `children`.

/** A stub node: whatever the test's own stub is, with its children in `children`. */
type StubNode = object;

const kids = (n: StubNode): StubNode[] => ((n as { children?: StubNode[] }).children ?? []);

/** Give `n` and everything under it a parent and the navigation the walk reads. */
function attach(n: StubNode, parent: StubNode | null): void {
    Object.defineProperties(n, {
        parentNode: { value: parent, configurable: true, writable: true },
        firstChild: { get: () => kids(n)[0] ?? null, configurable: true },
        nextSibling: {
            get: () => {
                const p = (n as { parentNode: StubNode | null }).parentNode;
                if (!p) return null;
                const siblings = kids(p);
                return siblings[siblings.indexOf(n) + 1] ?? null;
            },
            configurable: true,
        },
        replaceWith: {
            value: (x: StubNode) => {
                const p = (n as { parentNode: StubNode }).parentNode;
                kids(p).splice(kids(p).indexOf(n), 1, x);
                attach(x, p);
            },
            configurable: true,
        },
        remove: {
            value: () => {
                const p = (n as { parentNode: StubNode }).parentNode;
                kids(p).splice(kids(p).indexOf(n), 1);
            },
            configurable: true,
        },
    });
    for (const c of kids(n)) attach(c, n);
}

/**
 * `document` with a <template> to build a block's markup in, and `importNode` to copy it — `clone`
 * copies ONE node, without its children; the copy gets copies of them.
 */
export function withBlockCopies<D extends { createDocumentFragment(): StubNode; createElement?(tag: string): StubNode }>(
    document: D,
    clone: (n: StubNode) => StubNode,
): D {
    const deep = (n: StubNode): StubNode => {
        const copy = clone(n);
        (copy as { children: StubNode[] }).children = kids(n).map(deep);
        return copy;
    };
    const doc: D = {
        ...document,
        createElement: (tag: string) => (tag === 'template'
            ? { content: Object.assign(document.createDocumentFragment(), { ownerDocument: doc }) }
            : document.createElement!(tag)),
        importNode: (n: StubNode) => {
            const copy = deep(n);
            attach(copy, null);
            return copy;
        },
    };
    return doc;
}

/**
 * core's `staticBlock` (renderer/dom.ts) over a stub document from {@link withBlockCopies}: the
 * same steps — build once into a template's content, copy with importNode — on the stub's nodes,
 * because core's reads the global `document`, which these tests replace only inside the module.
 */
export function stubStaticBlock(document: { createElement(tag: string): unknown; importNode?(n: unknown, deep: boolean): unknown }) {
    return (build: (frag: StubNode, d: unknown) => void) => {
        let content: StubNode | null = null;
        return () => {
            if (!content) {
                content = (document.createElement('template') as { content: StubNode }).content;
                build(content, (content as { ownerDocument: unknown }).ownerDocument);
            }
            return document.importNode!(content, true);
        };
    };
}
