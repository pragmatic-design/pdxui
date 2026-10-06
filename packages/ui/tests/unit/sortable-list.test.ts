// pdx-sortable-list — the reorder said out loud, and the array left alone.
//
// Two things this component exists to get right, and both are asserted here rather than assumed:
//
// 1. It does NOT mutate `items`. useSortable hands back (from, to); the component emits them and the
//    application writes the new value. That is the contract createFieldArray keeps — a component
//    that edits the array it was given stops the list being one source of truth.
// 2. The keyboard path is a first-class reorder, not a courtesy. `aria-grabbed` is deprecated in
//    WAI-ARIA 1.1, so the grab target is a real <button> with aria-roledescription, and the
//    announcements speak POSITION rather than index — "2 of 5", which is what a person can act on.
//
// The pointer drag is measured in the browser instead, where rects are real:
// packages/responsive/tests/integration/ui-components/sortable-list.spec.ts.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/sortable-list/pdx-sortable-list';

const ROWS = [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Bravo' },
    { id: 'c', label: 'Charlie' },
    { id: 'd', label: 'Delta' },
];

interface ReorderDetail { from: number; to: number; id: unknown }

/** Mount a list over a copy of ROWS and collect the reorders it emits. */
async function mount(items: unknown[] = ROWS.map((r) => ({ ...r }))): Promise<{
    el: HTMLElement; items: unknown[]; events: ReorderDetail[];
}> {
    const el = document.createElement('pdx-sortable-list');
    (el as unknown as { items: unknown[] }).items = items;
    const events: ReorderDetail[] = [];
    el.addEventListener('pdx-reorder', (e) => events.push((e as CustomEvent<ReorderDetail>).detail));
    document.body.appendChild(el);
    await tick(30);
    return { el, items, events };
}

const labels = (el: HTMLElement): string[] =>
    [...el.querySelectorAll('.pdx-sortable-body')].map((b) => b.textContent ?? '');

const handles = (el: HTMLElement): HTMLElement[] =>
    [...el.querySelectorAll<HTMLElement>('.pdx-sortable-handle')];

/** A keydown on a handle, the way a browser delivers it: from the handle, bubbling. */
function press(handle: HTMLElement, key: string): void {
    handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

beforeEach(cleanup);

describe('pdx-sortable-list renders', () => {
    it('one row per item, in order, each with a handle', async () => {
        const { el } = await mount();
        expect(labels(el)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
        expect(handles(el)).toHaveLength(4);
    });

    it('the list is a list and the rows are its items', async () => {
        const { el } = await mount();
        expect(el.querySelector('ul')?.getAttribute('role')).toBe('list');
        expect(el.querySelectorAll('li.pdx-sortable-item')).toHaveLength(4);
    });
});

describe('pdx-sortable-list is accessible without a pointer', () => {
    it('the handle is a button that says it is draggable, and never aria-grabbed', async () => {
        const { el } = await mount();
        const h = handles(el)[0];
        expect(h.tagName).toBe('BUTTON');
        expect(h.getAttribute('type'), 'a button inside a form would submit it').toBe('button');
        expect(h.getAttribute('aria-roledescription')).toBe('draggable');
        expect(h.getAttribute('aria-label')).toBe('Reorder Alpha');
        expect(h.hasAttribute('aria-grabbed'), 'aria-grabbed is deprecated in WAI-ARIA 1.1').toBe(false);
    });

    it('every handle points at instructions that exist and are off-screen', async () => {
        const { el } = await mount();
        const described = handles(el).map((h) => h.getAttribute('aria-describedby'));
        expect(new Set(described).size, 'the handles point at different help texts').toBe(1);

        const help = el.querySelector(`#${CSS.escape(described[0]!)}`);
        expect(help, 'aria-describedby resolves to nothing').not.toBeNull();
        expect(help!.className).toContain('pdx-sr-only');
        expect(help!.textContent).toMatch(/Space or Enter/);
        expect(help!.textContent).toMatch(/Escape/);
    });

    it('costs one Tab stop: exactly one handle is tabbable', async () => {
        const { el } = await mount();
        const tabbable = handles(el).filter((h) => h.getAttribute('tabindex') === '0');
        expect(tabbable, 'a list of four rows should not be four Tab stops').toHaveLength(1);
    });
});

describe('pdx-sortable-list reorders from the keyboard', () => {
    it('Space lifts, an arrow moves the row, Space drops and emits the indices', async () => {
        const { el, events } = await mount();
        const h = handles(el)[0];

        press(h, ' ');
        expect(el.querySelectorAll('.pdx-sortable-item-lifted'), 'Space did not lift the row').toHaveLength(1);

        press(h, 'ArrowDown');
        press(h, 'ArrowDown');
        expect(labels(el), 'the row did not move while lifted').toEqual(['Bravo', 'Charlie', 'Alpha', 'Delta']);

        press(h, ' ');
        expect(events).toEqual([{ from: 0, to: 2, id: 'a' }]);
        expect(el.querySelectorAll('.pdx-sortable-item-lifted'), 'the row is still lifted after the drop').toHaveLength(0);
    });

    it('does not mutate the array it was given', async () => {
        const { el, items } = await mount();
        const before = JSON.stringify(items);
        const h = handles(el)[0];
        press(h, ' ');
        press(h, 'ArrowDown');
        press(h, ' ');
        expect(JSON.stringify(items), 'the component rewrote the caller\'s array').toBe(before);
    });

    it('Escape puts the row back and emits nothing', async () => {
        const { el, events } = await mount();
        const h = handles(el)[0];
        press(h, ' ');
        press(h, 'ArrowDown');
        expect(labels(el)).toEqual(['Bravo', 'Alpha', 'Charlie', 'Delta']);

        press(h, 'Escape');
        expect(labels(el), 'Escape left the row where the arrows had put it').toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
        expect(events).toEqual([]);
    });

    it('will not move a row past the end of the list', async () => {
        const { el, events } = await mount();
        const h = handles(el)[3];
        press(h, ' ');
        press(h, 'ArrowDown');
        press(h, ' ');
        expect(labels(el)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
        expect(events, 'a row was reordered past the end of the list').toEqual([]);
    });

    it('an arrow with nothing lifted moves the focus, not the row', async () => {
        const { el, events } = await mount();
        press(handles(el)[0], 'ArrowDown');
        expect(labels(el)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
        expect(events).toEqual([]);
        expect(handles(el)[1].getAttribute('tabindex'), 'the roving tabindex did not follow the arrow').toBe('0');
    });

    it('the horizontal axis listens to the horizontal arrows', async () => {
        const el = document.createElement('pdx-sortable-list');
        (el as unknown as { items: unknown[]; axis: string }).items = ROWS.map((r) => ({ ...r }));
        el.setAttribute('axis', 'horizontal');
        const events: ReorderDetail[] = [];
        el.addEventListener('pdx-reorder', (e) => events.push((e as CustomEvent<ReorderDetail>).detail));
        document.body.appendChild(el);
        await tick(30);

        const h = handles(el)[0];
        press(h, ' ');
        press(h, 'ArrowRight');
        press(h, ' ');
        expect(events).toEqual([{ from: 0, to: 1, id: 'a' }]);
    });

    it('a disabled list does not lift', async () => {
        const el = document.createElement('pdx-sortable-list');
        (el as unknown as { items: unknown[] }).items = ROWS.map((r) => ({ ...r }));
        el.setAttribute('disabled', '');
        document.body.appendChild(el);
        await tick(30);

        press(handles(el)[0], ' ');
        expect(el.querySelectorAll('.pdx-sortable-item-lifted')).toHaveLength(0);
        expect(handles(el)[0].getAttribute('aria-disabled')).toBe('true');
    });
});

describe('pdx-sortable-list announces what it did', () => {
    /** The announcer appends its live region to the body; read what landed in it. */
    function announced(): string[] {
        return [...document.querySelectorAll('[aria-live]')].map((r) => r.textContent ?? '').filter(Boolean);
    }

    it('speaks the position, not the index', async () => {
        const { el } = await mount();
        const h = handles(el)[0];

        press(h, ' ');
        await tick(20);
        expect(announced().join(' '), 'the lift was not announced by position').toMatch(/Position 1 of 4/);

        press(h, 'ArrowDown');
        await tick(20);
        expect(announced().join(' ')).toMatch(/Position 2 of 4/);
    });
});

describe('pdx-sortable-list keeps the focus across the rebuild', () => {
    it('after the application applies the reorder, the moved row still has the focus', async () => {
        const { el, events } = await mount();
        handles(el)[0].focus();
        press(handles(el)[0], ' ');
        press(handles(el)[0], 'ArrowDown');
        press(handles(el)[0], ' ');

        // What the application does with the event: write the new order back.
        const { from, to } = events[0];
        const next = ROWS.map((r) => ({ ...r }));
        next.splice(to, 0, ...next.splice(from, 1));
        (el as unknown as { items: unknown[] }).items = next;
        await tick(30);

        expect(labels(el)).toEqual(['Bravo', 'Alpha', 'Charlie', 'Delta']);
        const focused = document.activeElement as HTMLElement | null;
        expect(focused?.getAttribute('aria-label'), 'the focus was lost when the rows were rebuilt').toBe('Reorder Alpha');
    });
});

describe('pdx-sortable-list renders what the caller gives it', () => {
    it('falls back to the index when the items have no label field', async () => {
        const { el } = await mount([{ id: 1 }, { id: 2 }]);
        expect(labels(el)).toEqual(['1', '2']);
    });

    it('takes plain strings', async () => {
        const { el } = await mount(['one', 'two']);
        expect(labels(el)).toEqual(['one', 'two']);
        expect(handles(el)[0].getAttribute('aria-label')).toBe('Reorder one');
    });

    it('reports the id of the row that moved, not its index', async () => {
        const { el, events } = await mount();
        const h = handles(el)[2];
        press(h, ' ');
        press(h, 'ArrowUp');
        press(h, ' ');
        expect(events).toEqual([{ from: 2, to: 1, id: 'c' }]);
    });
});

describe('pdx-sortable-list cleans up', () => {
    it('a removed list leaves no listener that still fires', async () => {
        const { el, events } = await mount();
        const h = handles(el)[0];
        el.remove();
        await tick(20);
        press(h, ' ');
        press(h, 'ArrowDown');
        press(h, ' ');
        expect(events, 'a detached list still reordered').toEqual([]);
    });

    it('does not warn about the unimplemented group option', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            await mount();
            expect(warn.mock.calls.flat().join(' ')).not.toMatch(/group/);
        } finally { warn.mockRestore(); }
    });
});
