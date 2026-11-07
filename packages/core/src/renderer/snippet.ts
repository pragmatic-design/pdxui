// Rendering a typed snippet (#489): what `@render row(it, i)` compiles to.
//
// A snippet is a function the component calls, not content projected into it: the parent's
// `@snippet row(u, i) { … }` (or a script, `el.row = (item, i) => node`) gives the function, and the
// component renders it where its template says, with the arguments it chooses. One rendered inside an
// `@if` that becomes true later renders like anything else there.

import { effect, collectDisposers, onDispose, untracked } from '../reactivity/signal';
import { nodesBetween } from './helpers';
import type { Dispose } from '../utils/types';
import type { SlotFunction } from './slot';
import { isDeferring, deferredBlock } from './deferred-block';

/**
 * The parent's snippet for the declared slot `name`, as the `SlotFunction` the component calls with a
 * scope object, the arguments taken from it by `args` (#492). Undefined when the parent gave none.
 * Every component of the library reads its snippets with it. Read where the component draws, so a
 * snippet set after mount is the one drawn.
 */
export function declaredSnippet(
    ctx: object,
    name: string,
    args: (scope: Record<string, unknown>) => readonly unknown[],
): SlotFunction | undefined {
    const c = ctx as Record<string, unknown>;
    const declared = typeof c[name] === 'function' ? (c[name] as () => unknown)() : undefined;
    if (typeof declared !== 'function') return undefined;
    const snippet = declared as (...a: readonly unknown[]) => Node | null | undefined;
    return (scope) => snippet(...args(scope)) ?? document.createDocumentFragment();
}

/** What a snippet renders: `fn` called with `values` when it is a function, else the fallback or nothing. */
export function snippetContent(fn: unknown, values: readonly unknown[], fallback: (() => Node | null) | null | undefined): Node | null | undefined {
    return typeof fn === 'function'
        ? (fn as (...a: readonly unknown[]) => Node | null | undefined)(...values)
        : (fallback?.() ?? null);
}

/**
 * Render the snippet `source()` returns, called with `args()`, between two markers: again whenever the
 * function or an argument changes, and `fallback` (the optional slot's `@else`) or nothing while there
 * is no function. The snippet's own effects and bindings belong to this render, not to the code that
 * wrote the snippet: they are disposed when it renders again and when the block around it goes.
 */
export function renderSnippet(
    source: () => unknown,
    args: () => readonly unknown[],
    fallback?: (() => Node | null) | null,
): DocumentFragment {
    // On the server (#160): the snippet called with its arguments now, or the fallback. A value that
    // is not a fragment renders nothing, as the client places only a node.
    // Rendered to a string or hydrating (#160): the call, for the code that writes the block.
    if (isDeferring()) return deferredBlock((v) => v.snippet(source, args, fallback));
    const frag = document.createDocumentFragment();
    const start = document.createComment('snippet');
    const end = document.createComment('/snippet');
    frag.appendChild(start);
    frag.appendChild(end);

    let childDispose: Dispose | null = null;

    effect(() => {
        const fn = source();
        const values = args();
        const parent = end.parentNode;
        if (!parent) return;
        for (const node of nodesBetween(start, end)) parent.removeChild(node);
        childDispose?.();
        // Rendered untracked: what the snippet reads belongs to its own bindings, and must not make
        // this effect render the whole snippet again.
        const [content, dispose] = collectDisposers(() => untracked(() => snippetContent(fn, values, fallback)));
        childDispose = dispose;
        if (content instanceof Node) parent.insertBefore(content, end);
    });

    onDispose(() => { childDispose?.(); childDispose = null; });

    return frag;
}
