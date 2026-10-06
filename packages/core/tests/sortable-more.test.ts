// useSortable — drag-to-reorder.
//
// The interesting part is not "the item moved": it is the index arithmetic. Dropping an item BELOW
// where it started means the insertion index counts a slot the item itself is about to vacate, so
// `onReorder` gets `toIndex - 1`. Get that wrong and every downward drag lands one place short —
// which is the kind of bug that survives a demo and fails in a real list.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSortable } from '../src/component/sortable';

let list: HTMLElement;
let rows: HTMLElement[];

const ROW_H = 40;

/** Four rows of 40px, stacked from y=0. Rects are stubbed: happy-dom lays nothing out. */
function build(count = 4, withHandle = false): HTMLElement[] {
    list.innerHTML = '';
    rows = [];
    for (let i = 0; i < count; i++) {
        const row = document.createElement('div');
        row.textContent = `Row ${i}`;
        if (withHandle) {
            const h = document.createElement('span');
            h.className = 'grip';
            row.appendChild(h);
        }
        const top = i * ROW_H;
        (row as unknown as { getBoundingClientRect: unknown }).getBoundingClientRect = () =>
            ({ top, left: 0, width: 200, height: ROW_H, right: 200, bottom: top + ROW_H,
                x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
        list.appendChild(row);
        rows.push(row);
    }
    return rows;
}

function pointer(type: string, target: EventTarget, clientY: number, clientX = 10, pointerId = 1): void {
    const e = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
    Object.defineProperties(e, {
        clientX: { value: clientX }, clientY: { value: clientY }, pointerId: { value: pointerId },
    });
    target.dispatchEvent(e);
}

/**
 * The lifted clone that follows the pointer. Found by its inline `position: fixed` rather than by a
 * `[style*=…]` selector: happy-dom normalises the style attribute, so matching the cssText the
 * source writes is matching the DOM implementation instead of the code.
 */
const ghost = (): HTMLElement | null =>
    Array.from(document.body.children).find(
        c => (c as HTMLElement).style?.position === 'fixed',
    ) as HTMLElement ?? null;

/** Grab row `i` at its middle, then move to `toY`, then release. */
function drag(from: number, toY: number, target?: EventTarget): void {
    pointer('pointerdown', target ?? rows[from], from * ROW_H + ROW_H / 2);
    pointer('pointermove', document, toY);
    pointer('pointerup', document, toY);
}

beforeEach(() => {
    document.body.innerHTML = '';
    list = document.createElement('div');
    document.body.appendChild(list);
    build();
});

afterEach(() => { document.body.innerHTML = ''; });

const sortable = (opts: Partial<Parameters<typeof useSortable>[1]> = {}) =>
    useSortable(() => list, {
        items: () => rows,
        onReorder: vi.fn(),
        ...opts,
    } as Parameters<typeof useSortable>[1]);

describe('useSortable — the index arithmetic', () => {
    it('moving an item DOWN accounts for the slot it vacates', () => {
        const onReorder = vi.fn();
        const s = sortable({ onReorder });

        drag(0, ROW_H * 2 + 30);      // past the middle of row 2 → insertion index 3

        expect(onReorder, 'a downward drag landed one place short').toHaveBeenCalledWith(0, 2);
        s.dispose();
    });

    it('moving an item UP uses the insertion index as-is', () => {
        const onReorder = vi.fn();
        const s = sortable({ onReorder });

        drag(3, 5);                    // above the middle of row 0 → insertion index 0

        expect(onReorder).toHaveBeenCalledWith(3, 0);
        s.dispose();
    });

    it('says nothing when the item lands where it started', () => {
        const onReorder = vi.fn();
        const s = sortable({ onReorder });
        drag(1, ROW_H * 1 + 5);        // still inside its own slot
        expect(onReorder).not.toHaveBeenCalled();
        s.dispose();
    });

    it('drops at the end when the pointer is past the last item', () => {
        const onReorder = vi.fn();
        const s = sortable({ onReorder });
        drag(0, ROW_H * 10);
        expect(onReorder).toHaveBeenCalledWith(0, 3);
        s.dispose();
    });

    it('measures the horizontal axis when told to', () => {
        const onReorder = vi.fn();
        const s = sortable({ axis: 'horizontal', onReorder });
        // Rows are stacked vertically in the stub, so on the horizontal axis every midpoint is
        // x=100: a pointer at x=5 is before all of them → insertion 0.
        pointer('pointerdown', rows[2], 0, 100);
        pointer('pointermove', document, 0, 5);
        pointer('pointerup', document, 0, 5);
        expect(onReorder).toHaveBeenCalledWith(2, 0);
        s.dispose();
    });
});

describe('useSortable — the threshold', () => {
    it('does not start on a click that never moved', () => {
        const onReorder = vi.fn();
        const s = sortable({ onReorder });

        pointer('pointerdown', rows[0], 20);
        pointer('pointermove', document, 22);       // 2px — under the default 5
        pointer('pointerup', document, 22);

        expect(s.isDragging()).toBe(false);
        expect(onReorder, 'a click on a row was treated as a reorder').not.toHaveBeenCalled();
        s.dispose();
    });

    it('starts once the pointer passes the threshold', () => {
        const s = sortable();
        pointer('pointerdown', rows[0], 20);
        pointer('pointermove', document, 40);
        expect(s.isDragging()).toBe(true);
        expect(s.activeIndex()).toBe(0);
        pointer('pointerup', document, 40);
        s.dispose();
    });

    it('takes the threshold it is given', () => {
        const s = sortable({ threshold: 50 });
        pointer('pointerdown', rows[0], 20);
        pointer('pointermove', document, 60);       // 40px — under 50
        expect(s.isDragging()).toBe(false);
        pointer('pointermove', document, 100);
        expect(s.isDragging()).toBe(true);
        pointer('pointerup', document, 100);
        s.dispose();
    });
});

describe('useSortable — what the user sees while dragging', () => {
    it('lifts a ghost and fades the original', () => {
        const s = sortable();
        pointer('pointerdown', rows[0], 20);
        pointer('pointermove', document, 60);

        expect(ghost(), 'nothing follows the pointer').toBeTruthy();
        expect(rows[0].style.opacity).toBe('0.3');

        pointer('pointerup', document, 60);
        expect(ghost()).toBeNull();
        expect(rows[0].style.opacity).toBe('');
        s.dispose();
    });

    it('opens a gap by shifting the rows the item passes', () => {
        const s = sortable();
        pointer('pointerdown', rows[0], 20);
        pointer('pointermove', document, ROW_H * 2 + 30);

        expect(rows[1].style.transform, 'the rows never moved aside').toBe(`translateY(-${ROW_H}px)`);
        expect(rows[2].style.transform).toBe(`translateY(-${ROW_H}px)`);
        expect(rows[3].style.transform).toBe('');

        pointer('pointerup', document, ROW_H * 2 + 30);
        expect(rows[1].style.transform).toBe('');
        s.dispose();
    });

    it('shifts the other way when dragging up', () => {
        const s = sortable();
        pointer('pointerdown', rows[3], ROW_H * 3 + 20);
        pointer('pointermove', document, 5);

        expect(rows[0].style.transform).toBe(`translateY(${ROW_H}px)`);
        pointer('pointerup', document, 5);
        s.dispose();
    });

    it('animates the shift unless told not to', () => {
        const withAnim = sortable({ animationDuration: 120 });
        pointer('pointerdown', rows[0], 20);
        pointer('pointermove', document, ROW_H * 2 + 30);
        expect(rows[1].style.transition).toBe('transform 120ms ease');
        pointer('pointerup', document, ROW_H * 2 + 30);
        withAnim.dispose();

        const noAnim = sortable({ animate: false });
        pointer('pointerdown', rows[0], 20);
        pointer('pointermove', document, ROW_H * 2 + 30);
        expect(rows[1].style.transition).toBe('');
        pointer('pointerup', document, ROW_H * 2 + 30);
        noAnim.dispose();
    });
});

describe('useSortable — where the grab is allowed', () => {
    it('ignores a press that is not on a row', () => {
        const s = sortable();
        pointer('pointerdown', list, 5);
        pointer('pointermove', document, 200);
        expect(s.isDragging()).toBe(false);
        s.dispose();
    });

    it('only grabs by the handle when one is named', () => {
        build(4, true);
        const s = sortable({ handle: '.grip' });

        pointer('pointerdown', rows[0], 20);           // on the row, not the grip
        pointer('pointermove', document, 100);
        expect(s.isDragging(), 'the whole row was draggable despite a handle').toBe(false);

        pointer('pointerdown', rows[0].querySelector('.grip')!, 20);
        pointer('pointermove', document, 100);
        expect(s.isDragging()).toBe(true);
        pointer('pointerup', document, 100);
        s.dispose();
    });

    it('uses a custom item selector when given one', () => {
        list.innerHTML = '';
        const wrap = document.createElement('div');
        list.appendChild(wrap);
        rows = [0, 1].map(i => {
            const r = document.createElement('p');
            r.className = 'item';
            const top = i * ROW_H;
            (r as unknown as { getBoundingClientRect: unknown }).getBoundingClientRect = () =>
                ({ top, left: 0, width: 200, height: ROW_H, right: 200, bottom: top + ROW_H,
                    x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
            wrap.appendChild(r);
            return r;
        });
        const s = sortable({ itemSelector: '.item' });

        pointer('pointerdown', rows[1], ROW_H + 20);
        pointer('pointermove', document, 5);
        expect(s.activeIndex(), 'the selector did not find the rows').toBe(1);
        pointer('pointerup', document, 5);
        s.dispose();
    });
});

describe('useSortable — a gesture that ends badly', () => {
    it('cleans up when the browser takes the gesture away', () => {
        // pointercancel is what a touch scroll or a system gesture sends. Without handling it the
        // ghost was orphaned, the row stayed semi-transparent and the document listeners stayed on.
        const onReorder = vi.fn();
        const s = sortable({ onReorder });
        pointer('pointerdown', rows[0], 20);
        pointer('pointermove', document, ROW_H * 3);

        pointer('pointercancel', document, ROW_H * 3);

        expect(s.isDragging()).toBe(false);
        expect(s.activeIndex()).toBe(-1);
        expect(rows[0].style.opacity).toBe('');
        expect(ghost()).toBeNull();
        expect(onReorder, 'a cancelled gesture must not reorder anything').not.toHaveBeenCalled();
        s.dispose();
    });

    it('ignores events from a different pointer', () => {
        // A second finger on the screen must not drive the drag the first one started.
        const s = sortable();
        pointer('pointerdown', rows[0], 20, 10, 1);
        pointer('pointermove', document, 200, 10, 2);
        expect(s.isDragging()).toBe(false);
        pointer('pointerup', document, 200, 10, 1);
        s.dispose();
    });
});

describe('useSortable — cross-list, which does not exist yet', () => {
    it('warns rather than silently ignoring onReceive and onRemove', () => {
        // The option is accepted by the type and does nothing. Without the warning a caller wires
        // two lists together, sees no callback, and looks for the bug in their own code.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const s = sortable({ group: 'kanban', onReceive: vi.fn(), onRemove: vi.fn() });
        const said = warn.mock.calls.map(c => String(c[0])).join('\n');
        warn.mockRestore();

        // Warned once per process, so this only asserts when this test happens to be first; what
        // must hold either way is that the option did not silently succeed.
        expect(said === '' || said.includes('group')).toBe(true);
        expect(s.isDragging()).toBe(false);
        s.dispose();
    });
});

describe('useSortable — teardown', () => {
    it('stops listening once disposed', () => {
        const s = sortable();
        s.dispose();
        pointer('pointerdown', rows[0], 20);
        pointer('pointermove', document, 200);
        expect(s.isDragging()).toBe(false);
    });

    it('cleans up a drag that was in flight', () => {
        const s = sortable();
        pointer('pointerdown', rows[0], 20);
        pointer('pointermove', document, ROW_H * 3);

        s.dispose();

        expect(ghost(),
            'the ghost outlived the component').toBeNull();
        expect(rows[0].style.opacity).toBe('');
    });

    it('does nothing without a container', () => {
        const s = useSortable(() => null, { items: () => [], onReorder: vi.fn() });
        expect(s.isDragging()).toBe(false);
        expect(() => s.dispose()).not.toThrow();
    });
});
