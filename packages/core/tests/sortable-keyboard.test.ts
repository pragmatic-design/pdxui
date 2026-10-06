// `useSortable`'s keyboard reorder.
//
// It is the only implementation: `<pdx-sortable-list>` uses it rather than a keyboard path of its
// own. So this file is the specification of the component's keyboard behaviour, stated where the
// code lives.
import { describe, it, expect, beforeEach } from 'vitest';
import { useSortable } from '../src/component/sortable';

/** A list of four rows, each a `<li>` with a focusable handle — the component's shape. */
function list(): { el: HTMLElement; rows: HTMLElement[] } {
    const el = document.createElement('ul');
    const rows = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((label) => {
        const li = document.createElement('li');
        const handle = document.createElement('button');
        handle.className = 'handle';
        li.appendChild(handle);
        const body = document.createElement('span');
        body.textContent = label;
        li.appendChild(body);
        el.appendChild(li);
        return li;
    });
    document.body.appendChild(el);
    return { el, rows };
}

const labels = (el: HTMLElement): string[] =>
    [...el.children].map((li) => li.querySelector('span')?.textContent ?? '');

/** A keydown from a row's handle, the way a browser delivers it. */
function press(row: HTMLElement, key: string): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    row.querySelector('button')!.dispatchEvent(e);
    return e;
}

/**
 * What the live region holds, so an announcement is read rather than assumed.
 *
 * A frame, because `announce()` clears the region and writes on the next one — the clear is what
 * makes a screen reader read the same sentence twice, and without the wait this reads the clear.
 */
async function announced(): Promise<string> {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    return [...document.querySelectorAll('[aria-live]')].map((r) => r.textContent ?? '').join(' ');
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('useSortable, from the keyboard', () => {
    it('Space lifts, an arrow moves, Space drops, and the indices are the ones that moved', () => {
        const { el, rows } = list();
        const moves: [number, number][] = [];
        const s = useSortable(() => el, {
            items: () => [1, 2, 3, 4],
            onReorder: (from, to) => moves.push([from, to]),
            a11y: { preview: 'reorder' },
        });

        press(rows[0], ' ');
        press(rows[0], 'ArrowDown');
        press(rows[0], 'ArrowDown');
        expect(labels(el), 'the row did not move while lifted')
            .toEqual(['Bravo', 'Charlie', 'Alpha', 'Delta']);

        press(rows[0], ' ');
        expect(moves).toEqual([[0, 2]]);
        s.dispose();
    });

    it('Enter lifts too, and it used to be swallowed', () => {
        // It was refused for a lift and its default prevented anyway, so on a button handle Enter
        // did nothing at all — while the instructions this composable prints have always said
        // "Space or Enter to lift".
        const { el, rows } = list();
        const moves: [number, number][] = [];
        const s = useSortable(() => el, {
            items: () => [1, 2, 3, 4],
            onReorder: (from, to) => moves.push([from, to]),
            a11y: { preview: 'reorder' },
        });

        press(rows[0], 'Enter');
        press(rows[0], 'ArrowDown');
        press(rows[0], 'Enter');
        expect(moves, 'Enter lifted nothing').toEqual([[0, 1]]);
        s.dispose();
    });

    it('Escape puts the row back and reorders nothing', () => {
        const { el, rows } = list();
        const moves: [number, number][] = [];
        const s = useSortable(() => el, {
            items: () => [1, 2, 3, 4],
            onReorder: (from, to) => moves.push([from, to]),
            a11y: { preview: 'reorder' },
        });

        press(rows[0], ' ');
        press(rows[0], 'ArrowDown');
        expect(labels(el)).toEqual(['Bravo', 'Alpha', 'Charlie', 'Delta']);

        press(rows[0], 'Escape');
        expect(labels(el), 'Escape left the row where the arrows had put it')
            .toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
        expect(moves).toEqual([]);
        s.dispose();
    });

    it('will not carry a row past either end', () => {
        const { el, rows } = list();
        const moves: [number, number][] = [];
        const s = useSortable(() => el, {
            items: () => [1, 2, 3, 4],
            onReorder: (from, to) => moves.push([from, to]),
            a11y: { preview: 'reorder' },
        });

        press(rows[3], ' ');
        press(rows[3], 'ArrowDown');
        press(rows[3], ' ');
        expect(labels(el)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
        expect(moves, 'a row was carried past the end').toEqual([]);
        s.dispose();
    });

    it('an arrow with nothing lifted is left alone, for the cursor to use', () => {
        // The control for the `stopImmediatePropagation` below: it must NOT fire when there is no
        // lift, or a roving tabindex on the same container would stop working entirely.
        const { el, rows } = list();
        const s = useSortable(() => el, {
            items: () => [1, 2, 3, 4], onReorder: () => {}, a11y: { preview: 'reorder' },
        });

        const e = press(rows[0], 'ArrowDown');
        expect(e.defaultPrevented, 'the arrow was taken while nothing was lifted').toBe(false);
        expect(labels(el)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
        s.dispose();
    });

    it('and a LIFTED arrow is stopped for every other listener on the container', () => {
        // `<pdx-sortable-list>` puts a roving tabindex on the same element, and its keydown
        // listener sits there too — where plain `stopPropagation` never reaches it. While a row
        // is lifted the arrows belong to the row.
        const { el, rows } = list();
        const s = useSortable(() => el, {
            items: () => [1, 2, 3, 4], onReorder: () => {}, a11y: { preview: 'reorder' },
        });
        // AFTER the composable, which is where `<pdx-sortable-list>` puts its roving tabindex —
        // and it has to be: `stopImmediatePropagation` reaches the listeners registered after it
        // on the same element, never the ones already there. A consumer that listens first keeps
        // hearing the arrows, which is worth knowing and is why this line is not at the top.
        const alsoHeard: string[] = [];
        el.addEventListener('keydown', (e) => alsoHeard.push(e.key));

        press(rows[0], 'ArrowDown');
        expect(alsoHeard, 'the neighbour did not hear an arrow it should have').toEqual(['ArrowDown']);

        press(rows[0], ' ');
        press(rows[0], 'ArrowDown');
        expect(alsoHeard, 'the neighbour moved the focus while a row was lifted')
            .toEqual(['ArrowDown', ' ']);
        s.dispose();
    });
});

describe('useSortable, what the lift looks like', () => {
    it('transform is the default: the rows shift and the DOM does not move', () => {
        const { el, rows } = list();
        // happy-dom measures everything as zero, and a shift of zero is written as no transform
        // at all — so the rows are given a height, the way `sortable-more.test.ts` does.
        for (const row of rows) {
            row.getBoundingClientRect = () => ({ height: 40, width: 200, top: 0, left: 0,
                right: 200, bottom: 40, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
        }
        const s = useSortable(() => el, { items: () => [1, 2, 3, 4], onReorder: () => {}, a11y: {} });

        press(rows[0], ' ');
        press(rows[0], 'ArrowDown');
        expect(labels(el), 'the default preview moved the nodes')
            .toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
        expect(rows[1].style.transform, 'nothing shifted aside').toBe('translateY(-40px)');
        expect(rows[0].style.transform, 'the lifted row did not follow the arrow').toBe('translateY(40px)');
        s.dispose();
    });

    it('the lifted class is carried by the row, and follows it', () => {
        const { el, rows } = list();
        const s = useSortable(() => el, {
            items: () => [1, 2, 3, 4], onReorder: () => {},
            a11y: { preview: 'reorder', liftedClass: 'lifted' },
        });

        press(rows[0], ' ');
        expect(el.querySelectorAll('.lifted'), 'Space did not mark the row').toHaveLength(1);
        press(rows[0], 'ArrowDown');
        expect(rows[0].classList.contains('lifted'), 'the class stayed behind at the old index').toBe(true);

        press(rows[0], ' ');
        expect(el.querySelectorAll('.lifted'), 'the row is still marked after the drop').toHaveLength(0);
        s.dispose();
    });

    it('and no class is added when none was asked for', () => {
        const { el, rows } = list();
        const s = useSortable(() => el, {
            items: () => [1, 2, 3, 4], onReorder: () => {}, a11y: { preview: 'reorder' },
        });
        press(rows[0], ' ');
        expect(rows[0].className, 'a class nobody asked for').toBe('');
        s.dispose();
    });
});

describe('useSortable, when the list is disabled', () => {
    it('does not lift', () => {
        const { el, rows } = list();
        const moves: unknown[] = [];
        const s = useSortable(() => el, {
            items: () => [1, 2, 3, 4], onReorder: (f, t) => moves.push([f, t]),
            disabled: () => true, a11y: { preview: 'reorder', liftedClass: 'lifted' },
        });

        press(rows[0], ' ');
        press(rows[0], 'ArrowDown');
        press(rows[0], ' ');
        expect(el.querySelectorAll('.lifted')).toHaveLength(0);
        expect(labels(el)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
        expect(moves).toEqual([]);
        s.dispose();
    });

    it('and answers the getter every time, rather than once at setup', () => {
        // The control, and the reason it is a function: `disabled` is a prop, and an option read
        // once would keep the answer it was given when the list was built.
        const { el, rows } = list();
        let off = true;
        const moves: unknown[] = [];
        const s = useSortable(() => el, {
            items: () => [1, 2, 3, 4], onReorder: (f, t) => moves.push([f, t]),
            disabled: () => off, a11y: { preview: 'reorder' },
        });

        press(rows[0], ' ');
        expect(moves).toEqual([]);

        off = false;
        press(rows[0], ' ');
        press(rows[0], 'ArrowDown');
        press(rows[0], ' ');
        expect(moves, 'the list stayed disabled after the prop said otherwise').toEqual([[0, 1]]);
        s.dispose();
    });
});

describe('useSortable, what it says', () => {
    it('announces the position, not the index, at every step', async () => {
        const { el, rows } = list();
        const s = useSortable(() => el, {
            items: () => [1, 2, 3, 4], onReorder: () => {}, a11y: { preview: 'reorder' },
        });

        press(rows[0], ' ');
        expect(await announced(), 'the lift was not announced by position').toMatch(/Position 1 of 4/);
        press(rows[0], 'ArrowDown');
        expect(await announced()).toMatch(/Position 2 of 4/);
        press(rows[0], ' ');
        expect(await announced()).toMatch(/dropped/i);
        s.dispose();
    });

    it('takes the caller\'s own sentences and its own idea of a label', async () => {
        // The seam `<pdx-sortable-list>` uses: `@pdxui/core` has no dictionary, so an app that
        // localises passes the strings, and a list whose rows are more than text passes the label.
        const { el, rows } = list();
        const s = useSortable(() => el, {
            items: () => [1, 2, 3, 4], onReorder: () => {},
            a11y: {
                preview: 'reorder',
                label: (index) => `riga ${index + 1}`,
                messages: { lifted: '{label} sollevata. Posizione {position} di {total}.' },
            },
        });

        press(rows[0], ' ');
        expect(await announced()).toContain('riga 1 sollevata. Posizione 1 di 4.');
        s.dispose();
    });

    it('says nothing at all when a11y is off', async () => {
        // The half `<pdx-sortable-list>` used to rely on, and the board still does.
        const { el, rows } = list();
        const moves: unknown[] = [];
        const s = useSortable(() => el, {
            items: () => [1, 2, 3, 4], onReorder: (f, t) => moves.push([f, t]), a11y: false,
        });

        press(rows[0], ' ');
        press(rows[0], 'ArrowDown');
        press(rows[0], ' ');
        expect(await announced()).toBe('');
        expect(moves, 'a11y: false still reordered from the keyboard').toEqual([]);
        s.dispose();
    });
});

describe('useSortable, when the list changes under a lift', () => {
    it('drops the lift rather than moving a row that is gone', () => {
        // The consumer re-rendered — `<pdx-sortable-list>` does exactly this when the application
        // applies a reorder — so the indices the lift was holding describe nodes that no longer
        // exist. Acting on them would move the wrong row.
        const { el, rows } = list();
        const moves: unknown[] = [];
        const s = useSortable(() => el, {
            items: () => [1, 2, 3, 4], onReorder: (f, t) => moves.push([f, t]),
            a11y: { preview: 'reorder', liftedClass: 'lifted' },
        });

        press(rows[0], ' ');
        expect(el.querySelectorAll('.lifted')).toHaveLength(1);

        // The rebuild: same four labels, all new nodes.
        const fresh = list();
        el.replaceChildren(...fresh.rows);
        fresh.el.remove();

        press(fresh.rows[2], 'ArrowUp');
        expect(labels(el), 'an arrow moved a row against a stale lift')
            .toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
        expect(moves).toEqual([]);
        s.dispose();
    });
});

describe('useSortable, teardown', () => {
    it('a disposed list hears no more keys', () => {
        const { el, rows } = list();
        const moves: unknown[] = [];
        const s = useSortable(() => el, {
            items: () => [1, 2, 3, 4], onReorder: (f, t) => moves.push([f, t]),
            a11y: { preview: 'reorder' },
        });
        s.dispose();

        press(rows[0], ' ');
        press(rows[0], 'ArrowDown');
        press(rows[0], ' ');
        expect(moves, 'a disposed list still reordered').toEqual([]);
        expect(labels(el)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    });

    it('and the control: it heard them before', () => {
        const { el, rows } = list();
        const moves: unknown[] = [];
        const s = useSortable(() => el, {
            items: () => [1, 2, 3, 4], onReorder: (f, t) => moves.push([f, t]),
            a11y: { preview: 'reorder' },
        });
        press(rows[0], ' ');
        press(rows[0], 'ArrowDown');
        press(rows[0], ' ');
        expect(moves).toEqual([[0, 1]]);
        s.dispose();
    });
});
