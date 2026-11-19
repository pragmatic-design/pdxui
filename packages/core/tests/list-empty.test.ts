// `@empty` rendered by the list itself (#1233): what `@for … @empty` compiles to. Before, the list
// was built inside a when() that picked the rows or the empty body — one more effect, two more markers
// and one more scope on every mount, which made pdx-kbd mount 1.14–1.20× its TypeScript version.

import { describe, it, expect } from 'vitest';
import { eachRow, eachStatic, eachDestructured } from '../src/renderer/helpers';
import { signal, collectDisposers, effect } from '../src/reactivity/signal';

/** A list of <li>, with an `@empty` <li> that counts the runs of an effect it holds. */
function mount(helper: typeof eachRow | typeof eachStatic | typeof eachDestructured, initial: string[]) {
    const items = signal(initial);
    const tick = signal(0);
    let emptyRuns = 0;
    const ul = document.createElement('ul');
    const row = (item: unknown) => {
        const li = document.createElement('li');
        li.textContent = typeof item === 'function' ? String((item as () => string)()) : String(item);
        return li;
    };
    const empty = () => {
        const li = document.createElement('li');
        li.textContent = 'none';
        effect(() => { tick(); emptyRuns++; });
        return li;
    };
    const [frag, dispose] = collectDisposers(() => (helper as typeof eachRow)(() => items(), (k: string) => k, row as never, undefined, empty));
    ul.appendChild(frag);
    const texts = () => [...ul.querySelectorAll('li')].map((li) => li.textContent);
    return { items, tick, ul, texts, emptyRuns: () => emptyRuns, dispose };
}

for (const [name, helper] of [['eachRow', eachRow], ['eachStatic', eachStatic], ['eachDestructured', eachDestructured]] as const) {
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
