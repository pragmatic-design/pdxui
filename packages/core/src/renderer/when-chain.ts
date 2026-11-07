// An `@if` / `@else if` / `@else` chain as one branch (#685).
//
// The compiler wrote a chain as nested when() calls, one per `@else if`: each link a fragment, two
// markers, an effect and an ownership scope. In a `@for` row that is one chain — a value list whose
// rows are an option, a separator or an empty line — that was most of what the row cost: measured on
// the pilot's filter popover, the value list mounted 11% faster with the chain as one branch.
//
// What it does is when()'s, for a chain with no transition (the compiler keeps when() for one that has
// any): the selector returns the index of the first condition that holds, or the `@else`'s, or -1
// for none; the branch is rebuilt only when that index changes, and its effects are disposed with it.

import { effect, collectDisposers, onDispose } from '../reactivity/signal';
import { placePartNode } from './part-nodes';
import { isServerRender, serverBlock } from '../server/mode';
import { isHydrating, hydrationBlock } from '../hydrate/mode';
import type { Dispose } from '../utils/types';

/**
 * Render the branch `select()` picks — `branches[select()]`, or nothing for an index without one —
 * between two markers, and rebuild it only when the pick changes. What a transition-less
 * `@if` / `@else if` / `@else` chain compiles to.
 */
export function whenChain(
    select: () => number,
    branches: ReadonlyArray<(() => Node | DocumentFragment | null) | null>,
): DocumentFragment {
    // On the server: the branch picked now, between the markers when() uses too (#160).
    if (isServerRender()) return serverBlock('when', '/when', () => { const branch = branches[select()]; return branch ? [branch()] : []; });
    if (isHydrating()) {
        return hydrationBlock(['when', '/when'], () => whenChain(select, branches),
            (a, parent, at) => a.blocks.chain(a, parent, at, select, branches));
    }
    const frag = document.createDocumentFragment();
    const start = document.createComment('when');
    const end = document.createComment('/when');
    frag.appendChild(start);
    frag.appendChild(end);
    followChain(start, end, select, branches, null);
    return frag;
}

/** Keep the branch `select()` picks between the markers; `adopted`: the one already there, hydrated. */
export function followChain(
    start: Comment,
    end: Comment,
    select: () => number,
    branches: ReadonlyArray<(() => Node | DocumentFragment | null) | null>,
    adopted: { index: number; dispose: Dispose } | null,
): void {
    let childDispose: Dispose | null = adopted?.dispose ?? null;
    // The index rendered; `undefined` is nothing rendered yet, so the first run always renders.
    let prev: number | undefined = adopted?.index;

    effect(() => {
        const index = select();
        if (index === prev) return;
        prev = index;
        const parent = end.parentNode;
        if (!parent) return;

        childDispose?.();
        childDispose = null;
        // Everything between the markers, not a snapshot: a nested list's rows were placed later.
        for (let n = start.nextSibling; n && n !== end; n = start.nextSibling) parent.removeChild(n);

        const branch = branches[index];
        if (!branch) return;
        const [content, dispose] = collectDisposers(branch);
        childDispose = dispose;
        if (!content) return;
        if (content instanceof DocumentFragment) {
            for (let n = content.firstChild; n; n = content.firstChild) placePartNode(parent, n, end);
        } else {
            placePartNode(parent, content, end);
        }
    });

    onDispose(() => { childDispose?.(); childDispose = null; });
}
