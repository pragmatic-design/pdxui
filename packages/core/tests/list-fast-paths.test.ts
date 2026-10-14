// The keyed list's fast paths for its two commonest bulk changes (#118): clearing it, and appending
// to it. Measured in DOM calls the list makes on its parent — insertBefore, removeChild, appendChild,
// a textContent write, a Range deletion — which a per-row path makes 1,000 of, and a bulk one a
// handful. Counted at the top level only: what happy-dom does inside one call is one call, as it is
// in a browser (happy-dom's MutationObserver reports a record per node even for one fragment, so its
// records cannot be the measure).

import { describe, it, expect } from 'vitest';
import { repeatRows, repeat, LIST_SLICE_THRESHOLD } from '../src/renderer/list';
import { signal, effect, collectDisposers } from '../src/reactivity/signal';
import { waitUntil } from './wait-until';

const tick = () => new Promise((r) => setTimeout(r, 0));

interface Row { id: number; label: string }
const rows = (from: number, n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: from + i, label: `r${from + i}` }));

/** A list of <li>, mounted alone in a <ul> or among other nodes, and the rows' live scopes. */
function mount(alone: boolean, initial: Row[]) {
    const items = signal(initial);
    let live = 0;
    const ul = document.createElement('ul');
    if (!alone) ul.appendChild(document.createElement('header'));
    const [frag] = collectDisposers(() => repeatRows(() => items(), (r) => r.id, (r) => {
        live++;
        effect(() => () => { live--; });
        const li = document.createElement('li');
        effect(() => { li.textContent = r().label; });
        return li;
    }));
    ul.appendChild(frag);
    if (!alone) ul.appendChild(document.createElement('footer'));
    document.body.appendChild(ul);
    return { items, ul, live: () => live };
}

/**
 * The DOM calls `act` makes on `parent` — after the effects it schedules have run — top level only.
 * Each patched method counts when called on `parent` (or, for a Range, when its container is
 * `parent`) and no other counted call is in progress.
 */
async function records(parent: Node, act: () => void): Promise<string[]> {
    const calls: string[] = [];
    let depth = 0;
    const restore: (() => void)[] = [];
    const wrap = <O extends object>(owner: O, name: string, isOurs: (self: unknown) => boolean) => {
        const original = (owner as Record<string, (...a: unknown[]) => unknown>)[name];
        (owner as Record<string, unknown>)[name] = function (this: unknown, ...args: unknown[]) {
            if (depth === 0 && isOurs(this)) calls.push(name);
            depth++;
            try { return original.apply(this, args); } finally { depth--; }
        };
        restore.push(() => { (owner as Record<string, unknown>)[name] = original; });
    };
    for (const m of ['insertBefore', 'removeChild', 'appendChild']) wrap(Node.prototype, m, (self) => self === parent);
    wrap(Range.prototype, 'deleteContents', (self) => (self as Range).commonAncestorContainer === parent);
    // The setter on whichever prototype of `parent` defines it: happy-dom defines it for elements below
    // Node.prototype.
    let owner: object | null = parent;
    while (owner && !Object.getOwnPropertyDescriptor(owner, 'textContent')) owner = Object.getPrototypeOf(owner);
    const textOwner = owner!;
    const text = Object.getOwnPropertyDescriptor(textOwner, 'textContent')!;
    Object.defineProperty(textOwner, 'textContent', {
        ...text,
        set(this: Node, v: string) {
            if (depth === 0 && this === parent) calls.push('textContent');
            depth++;
            try { text.set!.call(this, v); } finally { depth--; }
        },
    });
    restore.push(() => Object.defineProperty(textOwner, 'textContent', text));
    try {
        act();
        await tick();
    } finally {
        for (const r of restore) r();
    }
    return calls;
}

describe('clearing a list', () => {
    it('removes 1,000 rows in one bulk operation when the list is its parent\'s only content', async () => {
        const list = mount(true, rows(1, 1000));
        // 1,000 rows are more than one task renders (#242): the rest arrives in slices.
        await waitUntil(() => list.ul.querySelectorAll('li').length === 1000, '1,000 rows', 1000);
        const changes = await records(list.ul, () => list.items.set([]));
        expect(list.ul.querySelectorAll('li')).toHaveLength(0);
        expect(changes.length, 'DOM calls for clearing 1,000 rows').toBeLessThanOrEqual(3);
        expect(list.live(), 'row scopes left undisposed').toBe(0);
        list.ul.remove();
    });

    it('and between its markers when other nodes share the parent: those stay', async () => {
        // 300 rows: happy-dom's Range deletion is slow (2 s for 1,000), a browser's is not.
        const list = mount(false, rows(1, 300));
        await tick();
        const changes = await records(list.ul, () => list.items.set([]));
        expect(list.ul.querySelectorAll('li')).toHaveLength(0);
        expect(list.ul.querySelector('header')).not.toBeNull();
        expect(list.ul.querySelector('footer')).not.toBeNull();
        expect(changes.length).toBeLessThanOrEqual(3);
        expect(list.live()).toBe(0);
        list.ul.remove();
    });

    it('a cleared list fills again where it was', async () => {
        const list = mount(false, rows(1, 3));
        await tick();
        list.items.set([]);
        await tick();
        list.items.set(rows(10, 2));
        await tick();
        expect([...list.ul.children].map(c => c.tagName.toLowerCase() + (c.textContent ? ':' + c.textContent : '')))
            .toEqual(['header', 'li:r10', 'li:r11', 'footer']);
        list.ul.remove();
    });
});

describe('appending to a list', () => {
    // As many rows as one task renders: above that the list slices them (#242, list-slices.test.ts),
    // one insertion per chunk.
    it(`inserts ${LIST_SLICE_THRESHOLD} new rows in one operation and keeps the old ones`, async () => {
        const n = LIST_SLICE_THRESHOLD;
        const list = mount(true, rows(1, n));
        await tick();
        const first = list.ul.querySelector('li');
        const changes = await records(list.ul, () => list.items.set([...list.items(), ...rows(n + 1, n)]));
        expect(list.ul.querySelectorAll('li')).toHaveLength(2 * n);
        expect(list.ul.querySelector('li'), 'an old row was re-created').toBe(first);
        expect(list.ul.querySelectorAll('li')[2 * n - 1].textContent).toBe(`r${2 * n}`);
        expect(changes.length, `DOM calls for appending ${n} rows`).toBeLessThanOrEqual(2);
        expect(list.live()).toBe(2 * n);
        list.ul.remove();
    });

    it('an old row given a new object under the same key shows the new object', async () => {
        const list = mount(true, rows(1, 2));
        await tick();
        list.items.set([{ id: 1, label: 'changed' }, { id: 2, label: 'r2' }, ...rows(3, 1)]);
        await tick();
        expect([...list.ul.querySelectorAll('li')].map(li => li.textContent)).toEqual(['changed', 'r2', 'r3']);
        list.ul.remove();
    });

    it('the control: a list that is not a prefix still reconciles as before', async () => {
        const list = mount(true, rows(1, 3));
        await tick();
        list.items.set([...rows(3, 1), ...rows(1, 2), ...rows(9, 1)]);
        await tick();
        expect([...list.ul.querySelectorAll('li')].map(li => li.textContent)).toEqual(['r3', 'r1', 'r2', 'r9']);
        list.ul.remove();
    });
});

describe('value mode (repeat) takes the same paths', () => {
    it('clear and append', async () => {
        const items = signal([1, 2, 3]);
        const ul = document.createElement('ul');
        const [frag] = collectDisposers(() => repeat(() => items(), (n) => n, (n) => {
            const li = document.createElement('li'); li.textContent = String(n); return li;
        }));
        ul.appendChild(frag);
        document.body.appendChild(ul);
        await tick();
        items.set([1, 2, 3, 4, 5]);
        await tick();
        expect(ul.textContent).toBe('12345');
        items.set([]);
        await tick();
        expect(ul.textContent).toBe('');
        items.set([7]);
        await tick();
        expect(ul.textContent).toBe('7');
        ul.remove();
    });
});
