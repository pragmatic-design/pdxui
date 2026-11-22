// A typed snippet (#489): the parent's function, as a component reads it and as it renders.
//
// A snippet is a function the component calls, not content projected into it: the parent's
// `@snippet row(u, i) { … }` (or a script, `el.row = (item, i) => node`) gives the function, and the
// component renders it where its template says, with the arguments it chooses. One rendered inside an
// `@if` that becomes true later renders like anything else there.

import type { SlotFunction } from './slot';

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

// What `@render row(it, i)` compiles to is `renderSnippet`, in ./render-snippet: a module of its own,
// so the components that read a snippet without rendering one through `@render` do not carry it.
