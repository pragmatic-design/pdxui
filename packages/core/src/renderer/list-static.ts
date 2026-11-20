// Static rows (#1233) and value rows (#1237): what `@for` compiles to when the compiler proves a row
// reads its item as a value — never its index, never a two-way binding, no block inside. Such a row
// has no item signal: its getter answers the item it holds, and no scope is kept for it unless
// something in it registers one.
//
// A static row's bindings are written once; a kept key whose item is replaced is a row built again in
// its place, since nothing in it could update. A value row's bindings keep their effects — the ones
// that read a signal stay subscribed, the others are kept too (core's collectRowRuns) — and a new item
// for its key is written to the row's cell and those effects run again on it: the row's nodes stay, as
// a reactive row's do when its item signal is set. Measured on js-framework-benchmark's
// `update every 10th row`, which replaces each tenth object: building those rows again was 2.4× the
// script time of the item signal.
//
// The code lives here, carried by the renderer `staticRowRenderer` makes, and list.ts only asks a
// renderer for it: a list of reactive rows, which never calls this module, does not bring it into a
// bundle.

import { collectIfAny, collectRowRuns, untracked } from '../reactivity/signal';
import { createRow, rowIndex, type MappedItem, type RowCell, type RowRenderer } from './list';
import { placePartNodes } from './part-nodes';

/** The renderer of a list of static and value rows: getter rows, built, updated and built again as above. */
export function staticRowRenderer<T>(render: (item: () => T, index: () => number) => Node): RowRenderer<T> {
    const renderer: RowRenderer<T> = {
        mode: 'getters',
        render,
        static: {
            build: (item, i) => {
                const index = rowIndex(i);
                const cell: RowCell<T> = { item, runs: null };
                const get = () => cell.item;
                const [node, dispose] = collectIfAny(() => untracked(() => {
                    const [built, runs] = collectRowRuns(() => render(get, index));
                    if (runs !== null && runs.length > 0) cell.runs = runs;
                    return built;
                }));
                return [node, dispose, cell];
            },
            update: (m, item) => updateRow(m, item),
            rebuild: (m, item, i) => rebuildRow(renderer, m, item, i),
        },
    };
    return renderer;
}

/**
 * Give a value row its new item in place: the cell answers it, and the row's effects run again on it.
 * False for a row that cannot — a static one, with no effect, or one with a block inside.
 */
function updateRow<T>(m: MappedItem<T>, item: T): boolean {
    const cell = m.cell;
    if (!cell || cell.runs === null) return false;
    cell.item = item;
    m.item = item;
    const runs = cell.runs;
    for (let i = 0; i < runs.length; i++) runs[i]();
    return true;
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
