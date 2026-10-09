// A drag over a SIBLING list opens the gap once, and does not reopen it on every move.
//
// A sibling column flickers under a slow drag if `openForeignGap` runs on every `pointermove`:
// clearing the shifted cards' transform, reading their rects — a forced layout that commits the
// cleared state — and writing the transform back with a transition animates the gap open from
// closed on every pixel. The rects are stubbed here (happy-dom lays nothing out), so what
// is measured is what the code WRITES: a card inside the gap must never be written back to none
// while the pointer stays in its slot.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSortable } from '../src/component/sortable';

const ROW_H = 40;
const LIST_W = 200;

/** A list of `count` rows of 40px at `left`, rects stubbed; the container's rect too. */
function column(left: number, count = 4): { list: HTMLElement; rows: HTMLElement[] } {
    const list = document.createElement('div');
    const rows: HTMLElement[] = [];
    for (let i = 0; i < count; i++) {
        const row = document.createElement('div');
        row.textContent = `Row ${i}`;
        const top = i * ROW_H;
        (row as unknown as { getBoundingClientRect: unknown }).getBoundingClientRect = () =>
            ({ top, left, width: LIST_W, height: ROW_H, right: left + LIST_W, bottom: top + ROW_H,
                x: left, y: top, toJSON: () => ({}) }) as DOMRect;
        list.appendChild(row);
        rows.push(row);
    }
    (list as unknown as { getBoundingClientRect: unknown }).getBoundingClientRect = () =>
        ({ top: 0, left, width: LIST_W, height: count * ROW_H, right: left + LIST_W, bottom: count * ROW_H,
            x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(list);
    return { list, rows };
}

function pointer(type: string, target: EventTarget, clientX: number, clientY: number): void {
    const e = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
    Object.defineProperties(e, { clientX: { value: clientX }, clientY: { value: clientY }, pointerId: { value: 1 } });
    target.dispatchEvent(e);
}

/** Every value written to `el.style.transform`, in order. happy-dom's style is a Proxy that turns
 *  `style.transform = v` into `setProperty('transform', v)` and refuses `defineProperty` on a CSS
 *  property, so the writes are recorded where they land. */
function recordTransforms(el: HTMLElement): string[] {
    const writes: string[] = [];
    const style = el.style;
    const setProperty = style.setProperty.bind(style);
    style.setProperty = (property: string, value: string | null, priority?: string) => {
        if (property === 'transform') writes.push(value ?? '');
        setProperty(property, value, priority);
    };
    return writes;
}

let a: ReturnType<typeof column>;
let b: ReturnType<typeof column>;
const disposers: (() => void)[] = [];

beforeEach(() => {
    document.body.innerHTML = '';
    a = column(0);
    b = column(300);
    for (const col of [a, b]) {
        const s = useSortable(() => col.list, {
            group: 'pdxui-690',
            items: () => col.rows,
            onReorder: vi.fn(),
            onReceive: vi.fn(),
            onRemove: vi.fn(),
            a11y: false,
        });
        disposers.push(s.dispose);
    }
});

afterEach(() => {
    pointer('pointerup', document, 0, 0);
    while (disposers.length) disposers.pop()!();
    document.body.innerHTML = '';
});

describe('useSortable — the gap in a sibling list', () => {
    it('moving slowly inside one slot writes the shifted card once, and never back to none', () => {
        const third = recordTransforms(b.rows[2]);
        pointer('pointerdown', a.rows[0], 10, 20);
        // Over B, below the middle of its second row (60) and above the third's (100): index 2,
        // so the third and fourth rows make room.
        for (const y of [61, 62, 63, 64, 65]) pointer('pointermove', document, 310, y);

        expect(third, `the gap closed and reopened on the moves: ${JSON.stringify(third)}`).toEqual([`translateY(${ROW_H}px)`]);
    });

    it('control — crossing a card\'s middle moves the gap', () => {
        const third = recordTransforms(b.rows[2]);
        const fourth = recordTransforms(b.rows[3]);
        pointer('pointerdown', a.rows[0], 10, 20);
        pointer('pointermove', document, 310, 61);   // index 2: rows 2 and 3 shifted
        pointer('pointermove', document, 310, 101);  // index 3: row 2 goes back, row 3 stays

        expect(third.at(-1)).toBe('');
        expect(fourth.at(-1)).toBe(`translateY(${ROW_H}px)`);
    });

    it('after a cancelled drag, the next one over the same list opens its gap again', () => {
        const third = recordTransforms(b.rows[2]);
        pointer('pointerdown', a.rows[0], 10, 20);
        pointer('pointermove', document, 310, 61);
        pointer('pointercancel', document, 310, 61);
        expect(third.at(-1), 'the cancel left the gap open').toBe('');

        pointer('pointerdown', a.rows[0], 10, 20);
        pointer('pointermove', document, 310, 61);
        expect(third.at(-1), 'the second drag opened no gap').toBe(`translateY(${ROW_H}px)`);
    });

    it('control — leaving the sibling list closes its gap', () => {
        const third = recordTransforms(b.rows[2]);
        pointer('pointerdown', a.rows[0], 10, 20);
        pointer('pointermove', document, 310, 61);
        pointer('pointermove', document, 250, 61);   // between the two lists

        expect(third.at(-1)).toBe('');
    });
});
