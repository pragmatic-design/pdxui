// A `@for` that receives more than LIST_SLICE_THRESHOLD new rows at once renders them in slices
// (#242): a first slice of LIST_FIRST_SLICE rows in the same task, so the first rows are in the next
// frame, and the rest through `processInSlices` after that frame, yielding to input between slices.
// A list under a transition, and a hand-written `repeat`, keep the single pass.
//
// The time a later slice takes is read from performance.now(), which these tests drive: every row
// costs 1 ms, so each later slice is one chunk.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { repeatRows, repeat, LIST_SLICE_THRESHOLD } from '../src/renderer/list';
import { LIST_FIRST_SLICE } from '../src/renderer/list-slices';
import { signal, effect, collectDisposers } from '../src/reactivity/signal';
import { yieldToBrowser } from '../src/utils/slices';
import { waitUntil } from './wait-until';
import { each, eachDestructured } from '../src/renderer/helpers';

interface Row { id: number; label: string }
const rows = (from: number, n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: from + i, label: `r${from + i}` }));

/** The rows of the first slice. */
const FIRST = LIST_FIRST_SLICE;

let now = 0;
beforeEach(() => {
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

/** A `@for`-shaped list (`repeatRows`) in a <ul>, counting the rows it creates and the scopes alive. */
function mount(initial: Row[], transitions?: Parameters<typeof repeatRows>[3]) {
    const items = signal(initial);
    const created = new Map<number, number>();
    let live = 0;
    const ul = document.createElement('ul');
    const [frag, dispose] = collectDisposers(() => repeatRows(() => items(), (r) => r.id, (r) => {
        now += 1;
        const id = r().id;
        created.set(id, (created.get(id) ?? 0) + 1);
        live++;
        effect(() => () => { live--; });
        const li = document.createElement('li');
        effect(() => { li.textContent = r().label; });
        return li;
    }, transitions));
    ul.appendChild(frag);
    document.body.appendChild(ul);
    const labels = () => [...ul.querySelectorAll('li')].map((li) => li.textContent);
    return { items, ul, created, live: () => live, labels, dispose };
}

/**
 * Let `n` turns of the channel the slices yield through go by. A slice still scheduled runs at the
 * first of them: after a few, one that did not run was stopped.
 */
async function turns(n: number): Promise<void> {
    for (let i = 0; i < n; i++) await yieldToBrowser();
}

const settled = (ul: HTMLElement, n: number) => waitUntil(() => ul.querySelectorAll('li').length === n, `${n} rows`, 1000);

describe('a @for that receives many rows at once', () => {
    it('renders the first slice in the same task and every row once the slices settle, in order', async () => {
        const list = mount([]);
        list.items.set(rows(1, 2000));
        // The list's effect runs in the write's flush; the first slice is there before any task.
        await Promise.resolve();
        const first = list.ul.querySelectorAll('li').length;
        expect(first, 'rows in the same task').toBe(FIRST);
        expect(list.labels().slice(0, 3)).toEqual(['r1', 'r2', 'r3']);
        await settled(list.ul, 2000);
        expect(list.labels()).toEqual(rows(1, 2000).map((r) => r.label));
        expect([...list.created.values()].every((n) => n === 1), 'a row was created twice').toBe(true);
        expect(list.live()).toBe(2000);
        list.dispose();
        list.ul.remove();
    });

    it('slices an append to rows already there, and keeps the old rows', async () => {
        const list = mount(rows(1, 10));
        const old = list.ul.querySelector('li');
        list.items.set([...list.items(), ...rows(11, 1500)]);
        await Promise.resolve();
        expect(list.ul.querySelectorAll('li').length).toBe(10 + FIRST);
        await settled(list.ul, 1510);
        expect(list.ul.querySelector('li'), 'an old row was re-created').toBe(old);
        expect(list.labels()).toEqual(rows(1, 1510).map((r) => r.label));
        list.dispose();
        list.ul.remove();
    });

    it('renders the initial list of a component in slices too, the first slice before it is placed', async () => {
        const list = mount(rows(1, 1200));
        expect(list.ul.querySelectorAll('li').length).toBe(FIRST);
        await settled(list.ul, 1200);
        expect(list.labels()).toEqual(rows(1, 1200).map((r) => r.label));
        list.dispose();
        list.ul.remove();
    });

    it('slices a list replaced by one with no row in common: the old rows go, the new arrive in order', async () => {
        const list = mount(rows(1, 300));
        list.items.set(rows(1001, 2000));
        await Promise.resolve();
        expect(list.ul.querySelectorAll('li').length).toBe(FIRST);
        expect(list.labels()[0]).toBe('r1001');
        await settled(list.ul, 2000);
        expect(list.labels()).toEqual(rows(1001, 2000).map((r) => r.label));
        expect(list.live(), 'the old rows\' scopes').toBe(2000);
        list.dispose();
        list.ul.remove();
    });

    it('the control: a change that keeps some rows and adds many between them takes a single pass', async () => {
        const list = mount(rows(1, 2));
        list.items.set([...rows(1, 1), ...rows(100, 1200), ...rows(2, 1)]);
        await Promise.resolve();
        expect(list.ul.querySelectorAll('li').length).toBe(1202);
        list.dispose();
        list.ul.remove();
    });

    it('a new list while slices are pending replaces them: the right rows, none created twice', async () => {
        const list = mount([]);
        list.items.set(rows(1, 3000));
        await Promise.resolve();
        // Keep the first 1 000, drop the rest, add five at the front.
        list.items.set([...rows(5001, 5), ...rows(1, 1000)]);
        await settled(list.ul, 1005);
        // Nothing pending is left to add more.
        await turns(5);
        expect(list.ul.querySelectorAll('li').length).toBe(1005);
        expect(list.labels()).toEqual([...rows(5001, 5), ...rows(1, 1000)].map((r) => r.label));
        expect([...list.created.entries()].filter(([, n]) => n > 1), 'rows created twice').toEqual([]);
        expect(list.live()).toBe(1005);
        list.dispose();
        list.ul.remove();
    });

    it('the same rows written again while slices are pending finish the list, none created twice', async () => {
        const list = mount([]);
        const all = rows(1, 2000);
        list.items.set(all);
        await Promise.resolve();
        // New objects under the same keys: the same list, re-written.
        list.items.set(all.map((r) => ({ ...r, label: r.label + '!' })));
        await settled(list.ul, 2000);
        expect(list.labels()).toEqual(all.map((r) => r.label + '!'));
        expect([...list.created.values()].every((n) => n === 1)).toBe(true);
        list.dispose();
        list.ul.remove();
    });

    it('tearing the list down mid-slices disposes every row made and makes no more', async () => {
        const list = mount([]);
        list.items.set(rows(1, 3000));
        await Promise.resolve();
        const made = list.created.size;
        expect(made).toBeLessThan(3000);
        list.dispose();
        await turns(5);
        expect(list.created.size, 'rows made after teardown').toBe(made);
        expect(list.live(), 'row scopes left undisposed').toBe(0);
        list.ul.remove();
    });
});

describe('what keeps the single pass', () => {
    it(`a change that adds ${LIST_SLICE_THRESHOLD} rows or fewer`, async () => {
        const list = mount([]);
        list.items.set(rows(1, LIST_SLICE_THRESHOLD));
        await Promise.resolve();
        expect(list.ul.querySelectorAll('li').length).toBe(LIST_SLICE_THRESHOLD);
        list.dispose();
        list.ul.remove();
    });

    it('a list with an enter transition: its timing is the transition\'s', async () => {
        const list = mount([], { transitions: { enter: 'fade' } });
        list.items.set(rows(1, 1200));
        await Promise.resolve();
        expect(list.ul.querySelectorAll('li').length).toBe(1200);
        list.dispose();
        list.ul.remove();
    });

    it('a hand-written repeat(), whose caller reads the DOM right after', async () => {
        const items = signal<number[]>([]);
        const ul = document.createElement('ul');
        const [frag, dispose] = collectDisposers(() => repeat(() => items(), (n) => n, (n) => {
            const li = document.createElement('li'); li.textContent = String(n); return li;
        }));
        ul.appendChild(frag);
        items.set(Array.from({ length: 1200 }, (_, i) => i));
        await Promise.resolve();
        expect(ul.querySelectorAll('li').length).toBe(1200);
        dispose();
    });
});

// A destructured `@for` — `@for (rows as { id, label }; track id)` — compiles to the value-mode list,
// which the slices did not reach: the two forms of one block behaved differently (#398).
describe('a destructured @for receives many rows at once', () => {
    /** A list of value-mode rows in a <ul>, built by `build`. */
    function valueList(build: typeof each) {
        const items = signal<Row[]>([]);
        const ul = document.createElement('ul');
        const [frag, dispose] = collectDisposers(() => build(() => items(), 'id', ({ label }) => {
            now += 1;
            const li = document.createElement('li'); li.textContent = label; return li;
        }));
        ul.appendChild(frag);
        document.body.appendChild(ul);
        return { items, ul, dispose: () => { dispose(); ul.remove(); } };
    }

    it('renders the first slice in the same task and all of them once the slices settle', async () => {
        const list = valueList(eachDestructured);
        list.items.set(rows(1, 2000));
        await Promise.resolve();
        expect(list.ul.querySelectorAll('li').length, 'rows in the same task').toBe(FIRST);
        await settled(list.ul, 2000);
        expect([...list.ul.querySelectorAll('li')].map((li) => li.textContent)).toEqual(rows(1, 2000).map((r) => r.label));
        list.dispose();
    });

    it('control — a hand-written each() renders all of them at once', async () => {
        const list = valueList(each);
        list.items.set(rows(1, 2000));
        await Promise.resolve();
        expect(list.ul.querySelectorAll('li').length).toBe(2000);
        list.dispose();
    });
});
