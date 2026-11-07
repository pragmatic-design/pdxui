// Whether templates are being rendered to a string (#160). The one thing the client path reads of the
// server renderer: html`` checks it and, while it is set, returns a ServerFragment instead of building
// DOM. Everything else of the renderer lives in render-string.ts, which the client bundle never
// imports.

/**
 * A template rendered to a string: a DocumentFragment that holds nothing but the template's strings
 * and values. It IS a DocumentFragment — the server DOM's (dom-shim.ts) in Node, the page's in a test —
 * so html`` returns what its type says, and the code that called it hands it back to another template
 * or to renderToString as it would a fragment.
 */
export type ServerFragment = DocumentFragment & {
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
let ServerFragmentClass: (new (strings: TemplateStringsArray, values: readonly unknown[]) => ServerFragment) | null = null;

/** The ServerFragment html`` returns while the mode is set. */
export function serverFragment(strings: TemplateStringsArray, values: readonly unknown[]): ServerFragment {
    if (typeof DocumentFragment === 'undefined') {
        throw new Error('renderToString needs a DOM or the server DOM: call installServerDom() (core/server/dom-shim) before importing the app\'s modules');
    }
    ServerFragmentClass ??= class extends DocumentFragment {
        constructor(readonly strings: TemplateStringsArray, readonly values: readonly unknown[]) { super(); }
    };
    return new ServerFragmentClass(strings, values);
}

/** Whether `value` is a ServerFragment. */
export function isServerFragment(value: unknown): value is ServerFragment {
    return ServerFragmentClass !== null && value instanceof ServerFragmentClass;
}
