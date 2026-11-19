// Static rows (#1233): what `@for` compiles to when the compiler proves a row's content follows only
// from its item. Each row is built once from its item — its getter answers the item it was built from,
// with no item signal — and no scope is kept for it unless something in it registers one. A kept key
// whose item is replaced is a row built again in its place, since nothing in it could update.
//
// The code lives here, carried by the renderer `staticRowRenderer` makes, and list.ts only asks a
// renderer for it: a list of reactive rows, which never calls this module, does not bring it into a
// bundle.

import { collectIfAny, untracked } from '../reactivity/signal';
import { createRow, rowIndex, type MappedItem, type RowRenderer } from './list';
import { placePartNodes } from './part-nodes';

/** The renderer of a list of static rows: getter rows, built and built again as above. */
export function staticRowRenderer<T>(render: (item: () => T, index: () => number) => Node): RowRenderer<T> {
    const renderer: RowRenderer<T> = {
        mode: 'getters',
        render,
        static: {
            build: (item, i) => {
                const index = rowIndex(i);
                return collectIfAny(() => untracked(() => render(() => item, index)));
            },
            rebuild: (m, item, i) => rebuildRow(renderer, m, item, i),
        },
    };
    return renderer;
}

/**
 * Build a static row again in the place of `m`, for its new item: the new nodes go where the old
 * ones were, and the old row's scope is disposed.
 */
function rebuildRow<T>(renderer: RowRenderer<T>, m: MappedItem<T>, item: T, i: number): MappedItem<T> {
    const next = createRow(renderer, m.key, item, i);
    const at = m.nodes[0];
    const parent = at?.parentNode;
    if (parent) {
        placePartNodes(parent, next.nodes, at);
        for (const n of m.nodes) n.parentNode?.removeChild(n);
    }
    m.dispose?.();
    return next;
}
