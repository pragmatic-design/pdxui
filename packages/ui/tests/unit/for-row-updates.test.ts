// A keyed @for row follows its item when the list is updated immutably.
//
// `@for (docs as doc; track doc.id)` with a progress bar per row: a replaced item keeps its key, so
// the row is reused — which is what keying is for — and its bindings must read the current item, not
// close over the object the row was created with. A dotted path rooted at the loop variable
// (`:value="doc.progress"`) is not a "simple access" to bind once as a constant: it follows the item.
//
// Compiled with the real compiler and run against the real core, as a component author would.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { tick, cleanup } from './helpers';

function load(filename: string, source: string, opts: object = {}): void {
    const { code } = compile(source, filename, [], undefined, opts);
    const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
    expect(body, `${filename} imports something besides @pdxui/core`).not.toMatch(/^import /m);
    new Function('__core', body)(core);
}

const BAR = `<template>
<b class="bar">{{ value }}</b>
</template>
<script setup>
@prop value: number = 0;
</script>`;

const LIST = (tag: string) => `<template>
<button class="finish" @click="finish()">finish</button>
<button class="swap" @click="swap()">swap</button>
<ul>
@for (docs as doc, i; track doc.id) {
  <li class="row"><span class="txt">{{ i }}:{{ doc.name }}={{ doc.progress }}</span><pdx-fr-bar :value="doc.progress"></pdx-fr-bar></li>
}
</ul>
</template>
<script setup>
let docs = $signal([{ id: 1, name: 'a', progress: 10 }, { id: 2, name: 'b', progress: 20 }]);
function finish() { docs = docs.map(d => ({ ...d, progress: 100 })); }
function swap() { docs = [docs[1], docs[0]]; }
</script>`.replace('pdx-fr-list', tag);

const PATHS = [
    { name: 'dev', file: 'fr-list.pdx', tag: 'pdx-fr-list', opts: {} },
    { name: 'build', file: 'fr-list-build.pdx', tag: 'pdx-fr-list-build', opts: { production: true } },
    { name: 'production inline', file: 'fr-list-inline.pdx', tag: 'pdx-fr-list-inline', opts: { production: true, inlineBindings: true } },
];

beforeAll(() => {
    load('fr-bar.pdx', BAR);
    for (const p of PATHS) load(p.file, LIST(p.tag), p.opts);
});
afterEach(() => cleanup());

for (const p of PATHS) {
    describe(`@for with track — ${p.name}`, () => {
        async function mount(): Promise<HTMLElement> {
            const el = document.createElement(p.tag);
            document.body.appendChild(el);
            await tick();
            return el;
        }
        const texts = (el: HTMLElement) => Array.from(el.querySelectorAll('.txt')).map(n => n.textContent);
        const bars = (el: HTMLElement) => Array.from(el.querySelectorAll('.bar')).map(n => n.textContent);

        it('a row whose item is replaced shows the new values, in the same node', async () => {
            const el = await mount();
            const before = Array.from(el.querySelectorAll('li.row'));
            expect(texts(el)).toEqual(['0:a=10', '1:b=20']);

            el.querySelector<HTMLButtonElement>('.finish')!.click();
            await tick();

            expect(texts(el), 'the row text froze at its first value').toEqual(['0:a=100', '1:b=100']);
            expect(Array.from(el.querySelectorAll('li.row')), 'keying lost: rows were recreated').toEqual(before);
        });

        it("a component prop bound to the row's field follows it", async () => {
            const el = await mount();
            expect(bars(el)).toEqual(['10', '20']);
            el.querySelector<HTMLButtonElement>('.finish')!.click();
            await tick();
            expect(bars(el), 'the progress bars stayed at their first value').toEqual(['100', '100']);
        });

        it('a moved row shows its new index', async () => {
            const el = await mount();
            el.querySelector<HTMLButtonElement>('.swap')!.click();
            await tick();
            expect(texts(el)).toEqual(['0:b=20', '1:a=10']);
        });
    });
}
