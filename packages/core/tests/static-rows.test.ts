// Static rows (#1233): a `@for` row whose content follows only from its item is built once from the
// item, with no item signal; nothing in it can update, so a kept key whose item is replaced is a row
// built again. What `eachStatic` does, against `eachRow`'s reactive rows as the control.

import { describe, it, expect } from 'vitest';
import { eachStatic, eachRow } from '../src/renderer/helpers';
import { signal, collectDisposers, effect } from '../src/reactivity/signal';

/** A list in a <ul>, each row an <li> whose text is written once from its item. */
function mount<T>(initial: T[], key: (item: T, i: number) => unknown, kind: 'static' | 'reactive' = 'static') {
    const items = signal(initial);
    let built = 0;
    const render = (item: () => T) => {
        built++;
        const li = document.createElement('li');
        li.textContent = String(item());
        return li;
    };
    const ul = document.createElement('ul');
    const [frag, dispose] = collectDisposers(() => (kind === 'static' ? eachStatic : eachRow)(() => items(), key, render));
    ul.appendChild(frag);
    const texts = () => [...ul.querySelectorAll('li')].map((li) => li.textContent);
    return { items, ul, texts, built: () => built, dispose };
}

describe('a static row', () => {
    it('is built once, from its item', () => {
        const list = mount(['a', 'b', 'c'], (k) => k);
        expect(list.texts()).toEqual(['a', 'b', 'c']);
        expect(list.built()).toBe(3);
    });

    it('a kept key with the same item keeps its node', () => {
        const list = mount(['a', 'b'], (k) => k);
        const first = list.ul.querySelector('li');
        list.items.set(['a', 'b', 'c']);
        expect(list.ul.querySelector('li'), 'the kept row was built again').toBe(first);
        expect(list.texts()).toEqual(['a', 'b', 'c']);
        expect(list.built()).toBe(3);
    });

    it('a kept key with a new item is a new row, with the new text: same keys, same positions', () => {
        const list = mount(['Ctrl', 'K'], (_k, i) => i);
        const first = list.ul.querySelector('li');
        list.items.set(['Cmd', 'K']);
        expect(list.texts()).toEqual(['Cmd', 'K']);
        expect(list.ul.querySelector('li'), 'a row that cannot update kept its node').not.toBe(first);
    });

    it('a kept key with a new item is a new row on an append and on a general reconcile too', () => {
        const append = mount(['a', 'b'], (_k, i) => i);
        append.items.set(['x', 'b', 'c']);
        expect(append.texts()).toEqual(['x', 'b', 'c']);
        const general = mount([{ id: 1, n: 'a' }, { id: 2, n: 'b' }], (r) => r.id);
        general.items.set([{ id: 2, n: 'B' }, { id: 1, n: 'a' }]);
        expect(general.texts().map((t) => t)).toEqual(['[object Object]', '[object Object]']);
        expect(general.built(), 'the moved row with a new item was not built again').toBe(4);
    });

    it('moves and removes rows as a reactive list does', () => {
        const list = mount(['a', 'b', 'c'], (k) => k);
        list.items.set(['c', 'a']);
        expect(list.texts()).toEqual(['c', 'a']);
        expect(list.built()).toBe(3);
    });

    it('a static row that registers something keeps its scope: removed, what it registered is disposed', () => {
        const tick = signal(0);
        let runs = 0;
        const items = signal(['a', 'b']);
        const [frag] = collectDisposers(() => eachStatic(() => items(), (k) => k, (item) => {
            const li = document.createElement('li');
            li.textContent = item();
            if (item() === 'b') effect(() => { tick(); runs++; });
            return li;
        }));
        document.createElement('ul').appendChild(frag);
        expect(runs).toBe(1);
        tick.set(1);
        expect(runs, 'the effect of the kept row').toBe(2);
        items.set(['a']);
        tick.set(2);
        expect(runs, 'the removed row\'s effect still ran').toBe(2);
    });

    it('the control: a reactive row keeps its node and updates it, through its item signal', () => {
        const list = mount(['Ctrl', 'K'], (_k, i) => i, 'reactive');
        const first = list.ul.querySelector('li');
        list.items.set(['Cmd', 'K']);
        // The reactive row keeps its node; its text was written while it was built, a snapshot here.
        expect(list.ul.querySelector('li')).toBe(first);
    });
});
