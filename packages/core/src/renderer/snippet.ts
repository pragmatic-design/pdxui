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

/**
 * The template a component draws an entry with, as the `SlotFunction` it calls with a scope object
 * (#491): the parent's snippet when it gave one — the slot declared `slot<(…) => Node>()`, called
 * with the arguments `args` takes from the scope — or else the alpha scoped slot (`<slot name="x"
 * let:…>`), called with the scope as it is. Undefined when the parent gave neither. Read where the
 * component draws, so a snippet set after mount is the one drawn.
 *
 * `slotName` is the alpha slot's name when the snippet's differs: a slot that shares its name with a
 * prop is renamed on the snippet side only (#595, `pdx-pagination`'s `page` is the snippet `item`).
 */
export function snippetOrSlot(
    ctx: object,
    name: string,
    args: (scope: Record<string, unknown>) => readonly unknown[],
    slotName: string = name,
): SlotFunction | undefined {
    const c = ctx as Record<string, unknown> & { __slots?: Record<string, SlotFunction | undefined> };
    const declared = typeof c[name] === 'function' ? (c[name] as () => unknown)() : undefined;
    if (typeof declared === 'function') {
        const snippet = declared as (...a: readonly unknown[]) => Node | null | undefined;
        return (scope) => snippet(...args(scope)) ?? document.createDocumentFragment();
    }
    return c.__slots?.[slotName];
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
        const [content, dispose] = collectDisposers(() => untracked(() =>
            typeof fn === 'function'
                ? (fn as (...a: readonly unknown[]) => Node | null | undefined)(...values)
                : (fallback?.() ?? null)));
        childDispose = dispose;
        if (content instanceof Node) parent.insertBefore(content, end);
    });

    onDispose(() => { childDispose?.(); childDispose = null; });

    return frag;
}
