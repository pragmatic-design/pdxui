// `@empty` rendered by the list itself (#1233): what `@for … @empty` compiles to. Before, the list
// was built inside a when() that picked the rows or the empty body — one more effect, two more markers
// and one more scope on every mount, which made pdx-kbd mount 1.14–1.20× its TypeScript version.

import { describe, it, expect } from 'vitest';
import { eachRow, eachStatic, eachDestructured } from '../src/renderer/helpers';
import { listEmpty, type ListEmpty } from '../src/renderer/list-empty';
import { signal, collectDisposers, effect } from '../src/reactivity/signal';

/** An <li> of `text`. */
function li(text: string): HTMLLIElement {
    const el = document.createElement('li');
    el.textContent = text;
    return el;
}

type List = (items: () => string[], empty: ListEmpty) => DocumentFragment;

/** Each helper `@for` compiles to, called as the compiler calls it. */
const HELPERS: [string, List][] = [
    ['eachRow', (items, empty) => eachRow(items, (k) => k, (item) => li(item()), undefined, empty)],
    ['eachStatic', (items, empty) => eachStatic(items, (k) => k, (item) => li(item()), undefined, empty)],
    ['eachDestructured', (items, empty) => eachDestructured(items, (k) => k, (item) => li(item), undefined, empty)],
];

/** A list of <li>, with an `@empty` <li> that counts the runs of an effect it holds. */
function mount(helper: List, initial: string[]) {
    const items = signal(initial);
    const tick = signal(0);
    let emptyRuns = 0;
    const ul = document.createElement('ul');
    const empty = () => {
        effect(() => { tick(); emptyRuns++; });
        return li('none');
    };
    const [frag, dispose] = collectDisposers(() => helper(() => items(), listEmpty(empty)));
    ul.appendChild(frag);
    const texts = () => [...ul.querySelectorAll('li')].map((el) => el.textContent);
    return { items, tick, ul, texts, emptyRuns: () => emptyRuns, dispose };
}

for (const [name, helper] of HELPERS) {
    describe(`${name} with @empty`, () => {
        it('shows @empty while there is nothing, then the rows, then @empty again', () => {
            const list = mount(helper, []);
            expect(list.texts()).toEqual(['none']);
            list.items.set(['a', 'b']);
            expect(list.texts()).toEqual(['a', 'b']);
            list.items.set([]);
            expect(list.texts()).toEqual(['none']);
            list.items.set(['c']);
            expect(list.texts()).toEqual(['c']);
        });

        it('a hidden @empty is disposed: its effect stops', () => {
            const list = mount(helper, []);
            expect(list.emptyRuns()).toBe(1);
            list.items.set(['a']);
            list.tick.set(1);
            expect(list.emptyRuns(), 'the hidden @empty still ran').toBe(1);
        });

        it('the list disposed disposes the @empty it shows', () => {
            const list = mount(helper, []);
            list.dispose();
            list.tick.set(1);
            expect(list.emptyRuns()).toBe(1);
        });

        it('rows to rows does not build @empty', () => {
            const list = mount(helper, ['a']);
            list.items.set(['b', 'a']);
            expect(list.texts()).toEqual(['b', 'a']);
            expect(list.emptyRuns()).toBe(0);
        });
    });
}
