// Rendering a typed snippet (#489): what `@render row(it, i)` compiles to.
//
// A module of its own, beside ./snippet: a chunk carries it only when one of its components renders a
// snippet with `@render`. In ./snippet it went wherever `declaredSnippet`'s many readers took it,
// before the first paint of the showcase included (#1210).

import { effect, collectDisposers, onDispose, untracked } from '../reactivity/signal';
import { nodesBetween } from './helpers';
import type { Dispose } from '../utils/types';
import { isDeferring, deferredBlock } from './deferred-block';
import { snippetContent } from './snippet';

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
    // Rendered to a string or hydrating (#160): the call, for the code that writes the block.
    if (isDeferring()) return deferredBlock((v) => v.snippet(source, args, fallback));
    const frag = document.createDocumentFragment();
    const start = document.createComment('snippet');
    const end = document.createComment('/snippet');
    frag.appendChild(start);
    frag.appendChild(end);
    followSnippet(start, end, source, args, fallback, null);
    return frag;
}

/**
 * Keep the snippet `source()` returns, called with `args()`, between the markers. `adopted`: the content
 * already there, hydrated, and what disposes it; the first run then only follows what it reads.
 */
export function followSnippet(
    start: Comment,
    end: Comment,
    source: () => unknown,
    args: () => readonly unknown[],
    fallback: (() => Node | null) | null | undefined,
    adopted: { dispose: Dispose } | null,
): void {
    let childDispose: Dispose | null = adopted?.dispose ?? null;
    let keep = adopted !== null;

    effect(() => {
        const fn = source();
        const values = args();
        if (keep) { keep = false; return; }
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
}
