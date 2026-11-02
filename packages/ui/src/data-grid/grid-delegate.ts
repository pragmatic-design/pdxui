// The body's events, delegated (#292, library.md «Performance»): one listener per event type on the
// grid's body, whatever the number of rows, instead of a click, a drag and a checkbox listener on every
// row and a pointer listener on every text cell. A rendered element says what it is by being recorded
// here — a row with its data, a control with what it does — and the listener on the body finds the
// nearest recorded element on the event's path.
//
// WeakMaps, so a row or a button a re-render throws away takes its record with it.

import type { GridContext } from './grid-context';

/** What a rendered data row stands for. */
export interface RowRecord {
    row: Record<string, unknown>;
    /** Its index among the rows rendered with it — the page, or the group. */
    index: number;
    id: unknown;
    /** The rows rendered with it: a drop reports the id of the row it came from. */
    rows: Record<string, unknown>[];
}

const rowRecords = new WeakMap<Element, RowRecord>();
const clickActions = new WeakMap<Element, (e: MouseEvent) => void>();
const doubleClickActions = new WeakMap<Element, (e: MouseEvent) => void>();

/** Record a data row: a click on it is `pdx-row-click`, and it can be dragged when the grid reorders. */
export function recordRow(el: Element, record: RowRecord): void {
    rowRecords.set(el, record);
}

/** What a click on `el` does. The click goes no further: it is not a click on the row. */
export function onActivate(el: Element, fn: (e: MouseEvent) => void): void {
    clickActions.set(el, fn);
}

/** What a double click on `el` does. It goes no further either. */
export function onDoubleActivate(el: Element, fn: (e: MouseEvent) => void): void {
    doubleClickActions.set(el, fn);
}

/** The nearest data row of `node` inside `body`, and its record. */
function rowOf(body: Element, node: EventTarget | null): [HTMLElement, RowRecord] | null {
    for (let n = node as Element | null; n && n !== body; n = n.parentElement) {
        const record = rowRecords.get(n);
        if (record) return [n as HTMLElement, record];
    }
    return null;
}

// A per-grid identity token used by the row reorder: the drag's dataTransfer must identify the grid it
// came from, so a drop from another grid is refused.
let reorderSeq = 0;
const reorderTokens = new WeakMap<object, string>();
function reorderTokenFor(gc: object): string {
    let token = reorderTokens.get(gc);
    if (!token) {
        token = `pdx-dg-${++reorderSeq}`;
        reorderTokens.set(gc, token);
    }
    return token;
}

/** A text cell names its whole text in a `title` only when it is cut — measured as the pointer arrives. */
function fitTitle(el: HTMLElement): void {
    if (el.scrollWidth > el.clientWidth) el.title = el.textContent ?? '';
    else el.removeAttribute('title');
}

/**
 * Put the body's listeners on `body`, once per build. They live as long as the element: a rebuild makes
 * a new body, and the old one goes with its listeners.
 */
export function bindBody(gc: GridContext, body: HTMLElement): void {
    body.addEventListener('click', (e) => {
        const target = e.target as Element;
        for (let n: Element | null = target; n && n !== body; n = n.parentElement) {
            const act = clickActions.get(n);
            if (act) { e.stopPropagation(); act(e); return; }
            // The selection cell is its checkbox's hit area: a click beside the box toggles it, and never
            // reaches the row — there it would emit `pdx-row-click`, and the page would open the record.
            if (n.classList.contains('pdx-dg-checkbox')) {
                e.stopPropagation();
                const box = n.querySelector('input');
                if (box && target !== box) box.click();
                return;
            }
            const record = rowRecords.get(n);
            if (record) { gc.emit('pdx-row-click', { row: record.row, index: record.index, id: record.id }); return; }
        }
    });

    body.addEventListener('change', (e) => {
        const box = e.target as Element;
        if (!box.parentElement?.classList.contains('pdx-dg-checkbox')) return;
        const found = rowOf(body, box);
        if (!found) return;
        const [, record] = found;
        gc.emit('__toggle-select', { id: record.id, row: record.row, shiftKey: (e as unknown as { shiftKey?: boolean }).shiftKey ?? false });
    });

    body.addEventListener('dblclick', (e) => {
        for (let n = e.target as Element | null; n && n !== body; n = n.parentElement) {
            const act = doubleClickActions.get(n);
            if (act) { e.stopPropagation(); act(e); return; }
        }
    });

    body.addEventListener('pointerover', (e) => {
        const text = (e.target as Element).closest?.('.pdx-dg-td-text');
        if (text && body.contains(text)) fitTitle(text as HTMLElement);
    });

    // Drag to reorder (opt-in, `row-reorder`; non-virtual grids). Emits `pdx-row-reorder`
    // { from, to, fromId, toId }; the consumer reorders the data, the grid does not mutate the source.
    // from/to are indexes in the current page: with pagination, fromId/toId reorder the whole set.
    const reorderRow = (e: Event): [HTMLElement, RowRecord] | null => (gc.isRowReorder() ? rowOf(body, e.target) : null);
    body.addEventListener('dragstart', (e) => {
        const found = reorderRow(e);
        if (!found) return;
        const [el, record] = found;
        // The token names the grid: a drop from ANOTHER grid must not emit a reorder with an index that is not ours.
        e.dataTransfer?.setData('text/plain', JSON.stringify({ g: reorderTokenFor(gc), from: record.index }));
        el.classList.add('pdx-dg-row-dragging');
    });
    body.addEventListener('dragend', (e) => { reorderRow(e)?.[0].classList.remove('pdx-dg-row-dragging'); });
    body.addEventListener('dragover', (e) => {
        const found = reorderRow(e);
        if (!found) return;
        e.preventDefault();
        found[0].classList.add('pdx-dg-row-dragover');
    });
    body.addEventListener('dragleave', (e) => { reorderRow(e)?.[0].classList.remove('pdx-dg-row-dragover'); });
    body.addEventListener('drop', (e) => {
        const found = reorderRow(e);
        if (!found) return;
        const [el, record] = found;
        e.preventDefault();
        el.classList.remove('pdx-dg-row-dragover');
        let from = NaN;
        try {
            const payload = JSON.parse(e.dataTransfer?.getData('text/plain') ?? '');
            if (payload && payload.g === reorderTokenFor(gc)) from = Number(payload.from);
        } catch { /* a payload that is not ours (a drag from outside) → ignore it */ }
        if (!Number.isNaN(from) && from !== record.index) {
            const idField = gc.getIdField();
            gc.emit('pdx-row-reorder', { from, to: record.index, fromId: record.rows[from]?.[idField], toId: record.id });
        }
    });
}
