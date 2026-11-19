// `@empty` of a list (#1233): rendered by the list itself, between its markers, while it has no row.
// A when() around the list was one more effect, two more markers and one more scope on every mount.
//
// What `@for … @empty` compiles to passes `listEmpty(() => …)` to the list; list.ts only calls its
// methods, so a list without `@empty` does not bring this code into a bundle.

import { collectDisposers, untracked } from '../reactivity/signal';
import { placePartNodes } from './part-nodes';

/** A list's `@empty`: shown in its own scope while the list has no row, removed and disposed when one comes. */
export class ListEmpty {
    private nodes: Node[] | null = null;
    private disposeScope: (() => void) | null = null;

    constructor(
        /** The content, as the server renders it too. */
        readonly render: () => Node,
    ) {}

    /** Show the content before `end`, built once in its own scope — not the list's driver's, which re-runs. */
    show(end: Node): void {
        if (this.nodes) return;
        const [node, dispose] = collectDisposers(() => untracked(this.render));
        this.nodes = node instanceof DocumentFragment ? Array.from(node.childNodes) : [node];
        this.disposeScope = dispose;
        const parent = end.parentNode;
        if (parent) placePartNodes(parent, this.nodes, end);
    }

    /** Remove the content, if it is shown, and dispose its scope. */
    hide(): void {
        if (!this.nodes) return;
        for (const node of this.nodes) node.parentNode?.removeChild(node);
        this.dispose();
    }

    /** Take over the content the server wrote, adopted in the scope `dispose` tears down (hydration, #160). */
    adopt(nodes: Node[], dispose: () => void): void {
        this.nodes = nodes;
        this.disposeScope = dispose;
    }

    /** Dispose the content's scope: the list is torn down, or the content left. */
    dispose(): void {
        this.disposeScope?.();
        this.disposeScope = null;
        this.nodes = null;
    }
}

/** The `@empty` a compiled `@for … @empty` hands its list: `render` shown while the list has no row. */
export function listEmpty(render: () => Node): ListEmpty {
    return new ListEmpty(render);
}
