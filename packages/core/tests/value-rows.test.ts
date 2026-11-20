// Value rows (#1237): a `@for` row whose item is a value, every binding an effect. A new item for a kept
// key — an immutable update, `rows[i] = { ...rows[i], label }` — is written to the row's cell and its
// effects run again on it: the row keeps its nodes, as a reactive row does when its item signal is set.
// Building it again instead cost js-framework-benchmark's `update every 10th row` 2.4× its script time.

import { describe, it, expect } from 'vitest';
import { eachStatic } from '../src/renderer/helpers';
import { signal, collectDisposers, effect } from '../src/reactivity/signal';

interface Row { id: number; label: string }

/** A list of <li>, each row's text an effect over its item, as the compiler binds a value row. */
function mount(initial: Row[], extra?: (li: HTMLLIElement, item: () => Row) => void) {
    const items = signal(initial);
    let built = 0;
    const ul = document.createElement('ul');
    const [frag, dispose] = collectDisposers(() => eachStatic(() => items(), (r) => r.id, (item) => {
        built++;
        const li = document.createElement('li');
        effect(() => { li.textContent = item().label; });
        extra?.(li, item);
        return li;
    }));
    ul.appendChild(frag);
    const texts = () => [...ul.querySelectorAll('li')].map((li) => li.textContent);
    const nodes = () => [...ul.querySelectorAll('li')];
    return { items, texts, nodes, built: () => built, dispose };
}

const rows = (...labels: string[]) => labels.map((label, i) => ({ id: i + 1, label }));

describe('a value row given a new item for its key', () => {
    it('keeps its node and shows the new item: same keys, same positions', () => {
        const list = mount(rows('a', 'b', 'c'));
        const before = list.nodes();
        const next = list.items().slice();
        next[1] = { ...next[1], label: 'b !!!' };
        list.items.set(next);
        expect(list.texts()).toEqual(['a', 'b !!!', 'c']);
        expect(list.nodes(), 'the row was built again').toEqual(before);
        expect(list.built()).toBe(3);
    });

    it('on an append, and on a general reconcile', () => {
        const append = mount(rows('a', 'b'));
        const first = append.nodes()[0];
        append.items.set([{ id: 1, label: 'A' }, ...append.items().slice(1), { id: 3, label: 'c' }]);
        expect(append.texts()).toEqual(['A', 'b', 'c']);
        expect(append.nodes()[0]).toBe(first);
        expect(append.built()).toBe(3);

        const general = mount(rows('a', 'b'));
        const [one, two] = general.nodes();
        general.items.set([{ id: 2, label: 'B' }, { id: 1, label: 'a' }]);
        expect(general.texts()).toEqual(['B', 'a']);
        expect(general.nodes()).toEqual([two, one]);
        expect(general.built()).toBe(2);
    });

    it('a binding that reads a signal stays subscribed after the update, and goes with the row', () => {
        const selected = signal(1);
        let runs = 0;
        const list = mount(rows('a', 'b'), (li, item) => effect(() => { runs++; li.className = item().id === selected() ? 'danger' : ''; }));
        list.items.set([{ id: 1, label: 'A' }, list.items()[1]]);
        expect(list.nodes()[0].className).toBe('danger');
        selected.set(2);
        expect(list.nodes().map((li) => li.className)).toEqual(['', 'danger']);
        const before = runs;
        list.items.set([list.items()[0]]);
        selected.set(1);
        expect(runs - before, 'the removed row\'s binding still ran').toBe(1);
    });

    it('a row with an effect below its top is built again: running the row again would not reach it', () => {
        const items = signal(rows('a'));
        const ul = document.createElement('ul');
        const [frag] = collectDisposers(() => eachStatic(() => items(), (r) => r.id, (item) => {
            const li = document.createElement('li');
            // A block's effect: created inside another one, as `@if` creates its branch's.
            effect(() => { effect(() => { li.textContent = item().label; }); });
            return li;
        }));
        ul.appendChild(frag);
        const first = ul.querySelector('li');
        items.set([{ id: 1, label: 'A' }]);
        expect(ul.querySelector('li')!.textContent).toBe('A');
        expect(ul.querySelector('li'), 'a row its effects could not update kept its node').not.toBe(first);
    });
});
