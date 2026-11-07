// Whether templates are being rendered to a string (#160). The one thing the client path reads of the
// server renderer: html`` checks it and, while it is set, returns a DeferredTemplate instead of building
// DOM; the helpers (`when`, `match`, `show`, the lists) return a ServerBlock. Everything else of the
// renderer lives in render-string.ts, which the client bundle never imports.

/**
 * A template not built: a DocumentFragment that holds nothing but the template's strings and values,
 * for the code that writes it later — renderToString as markup. It IS a DocumentFragment — the server
 * DOM's (dom-shim.ts) in Node, the page's in a test — so html`` returns what its type says, and the
 * code that called it hands it back to another template as it would a fragment.
 */
export type DeferredTemplate = DocumentFragment & {
    readonly strings: TemplateStringsArray;
    readonly values: readonly unknown[];
};

let depth = 0;

/** True while `renderToString` is running. */
export function isServerRender(): boolean {
    return depth > 0;
}

/** Run `fn` with templates rendering to strings. Nested calls keep the mode until the outermost ends. */
export function withServerRender<T>(fn: () => T): T {
    depth++;
    try {
        return fn();
    } finally {
        depth--;
    }
}

/**
 * The class, defined at the first server render: `DocumentFragment` exists by then (the server DOM
 * installs it), and not necessarily when this module is imported.
 */
let DeferredTemplateClass: (new (strings: TemplateStringsArray, values: readonly unknown[]) => DeferredTemplate) | null = null;

function requireFragment(): void {
    if (typeof DocumentFragment === 'undefined') {
        throw new Error('renderToString needs a DOM or the server DOM: call installServerDom() (core/server/dom-shim) before importing the app\'s modules');
    }
}

/** The DeferredTemplate html`` returns while templates are not built. */
export function deferredTemplate(strings: TemplateStringsArray, values: readonly unknown[]): DeferredTemplate {
    requireFragment();
    DeferredTemplateClass ??= class extends DocumentFragment {
        constructor(readonly strings: TemplateStringsArray, readonly values: readonly unknown[]) { super(); }
    };
    return new DeferredTemplateClass(strings, values);
}

/** Whether `value` is a DeferredTemplate. */
export function isDeferredTemplate(value: unknown): value is DeferredTemplate {
    return DeferredTemplateClass !== null && value instanceof DeferredTemplateClass;
}

/**
 * What a helper does to the top-level nodes of the content it places, as its client side does:
 * `item` marks a list row's elements `data-pdx-item` (list.ts, development only), `hidden` is a false
 * `show()` — its elements take `display: none` and its text becomes a `show` comment.
 */
export interface BlockMark {
    readonly item: boolean;
    readonly hidden: boolean;
}

/**
 * A helper's content rendered to a string — `when`, `match`, `show`, a list: the comments the client
 * brackets it with (`null` for none), and the parts it places between them, in order. `parts` is called
 * by the string renderer inside an ownership scope it disposes, so what the branch or the rows create
 * while they render does not outlive the render. Like a DeferredTemplate, it IS a DocumentFragment, which
 * is what the helpers return.
 */
export type ServerBlock = DocumentFragment & {
    readonly open: string | null;
    readonly close: string | null;
    readonly parts: () => readonly unknown[];
    readonly mark: BlockMark | null;
    /**
     * What renders between the markers instead when rendering the parts throws — an error
     * boundary's fallback, given the error. Without one the error goes on to the block around it.
     */
    readonly fallback: ((error: unknown) => readonly unknown[]) | null;
};

type Fallback = ((error: unknown) => readonly unknown[]) | null;

let ServerBlockClass: (new (open: string | null, close: string | null, parts: () => readonly unknown[], mark: BlockMark | null, fallback: Fallback) => ServerBlock) | null = null;

/** The ServerBlock a helper returns while the mode is set. */
export function serverBlock(open: string | null, close: string | null, parts: () => readonly unknown[], mark: BlockMark | null = null, fallback: Fallback = null): ServerBlock {
    requireFragment();
    ServerBlockClass ??= class extends DocumentFragment {
        constructor(
            readonly open: string | null,
            readonly close: string | null,
            readonly parts: () => readonly unknown[],
            readonly mark: BlockMark | null,
            readonly fallback: Fallback,
        ) { super(); }
    };
    return new ServerBlockClass(open, close, parts, mark, fallback);
}

/** Whether `value` is a ServerBlock. */
export function isServerBlock(value: unknown): value is ServerBlock {
    return ServerBlockClass !== null && value instanceof ServerBlockClass;
}

/**
 * An element a helper creates by its tag — `<component :is>`'s component, `defer`'s viewport
 * sentinel — rendered to a string (#160): its attributes, and the properties the client assigns it,
 * which a component receives as its parent's. A DocumentFragment, as the helpers return.
 */
export type ServerElement = DocumentFragment & {
    readonly tag: string;
    readonly attributes: Readonly<Record<string, string>>;
    readonly props: Readonly<Record<string, unknown>>;
};

let ServerElementClass: (new (tag: string, attributes: Readonly<Record<string, string>>, props: Readonly<Record<string, unknown>>) => ServerElement) | null = null;

/** The ServerElement a helper returns while the mode is set. */
export function serverElement(tag: string, attributes: Readonly<Record<string, string>> = {}, props: Readonly<Record<string, unknown>> = {}): ServerElement {
    requireFragment();
    ServerElementClass ??= class extends DocumentFragment {
        constructor(
            readonly tag: string,
            readonly attributes: Readonly<Record<string, string>>,
            readonly props: Readonly<Record<string, unknown>>,
        ) { super(); }
    };
    return new ServerElementClass(tag, attributes, props);
}

/** Whether `value` is a ServerElement. */
export function isServerElement(value: unknown): value is ServerElement {
    return ServerElementClass !== null && value instanceof ServerElementClass;
}
