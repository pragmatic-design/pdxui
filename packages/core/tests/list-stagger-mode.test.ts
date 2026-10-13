// `@for … @transition(…) @stagger(n) @mode(…)` — the list reconciler applies stagger and mode (#207).
//
// The compiler hands `{ enter, exit, stagger, mode }` to the list since #85, and the reconciler read
// only `enter`, `exit` and `move`: every row entered at once, and enters ran alongside exits.
//
// What is measured is what the reconciler asks of each row — its `transition-delay`, and when it
// leaves the enter's from-state — with `transitionend` dispatched by hand. That a browser animates a
// row whose classes and delay are these is CSS's part, not the reconciler's.

import { describe, it, expect } from 'vitest';
import * as core from '../src/index';
import { signal } from '../src/reactivity/signal';
import { repeat } from '../src/renderer/list';
import { compile } from '../../compiler/src/plugin';

const settle = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0)); };

/** A list of `<li>` mounted in a `<ul>`, one per key, with the given transition options. */
function mount(keys: string[], transitions: Record<string, unknown>) {
    const items = signal(keys);
    const ul = document.createElement('ul');
    document.body.appendChild(ul);
    ul.appendChild(repeat(() => items(), (k) => k, (k) => {
        const li = document.createElement('li');
        li.dataset.k = k;
        return li;
    }, { transitions }));
    const li = (k: string) => ul.querySelector<HTMLElement>(`li[data-k="${k}"]`);
    return { items, ul, li };
}

const end = (el: HTMLElement | null) => el?.dispatchEvent(new Event('transitionend'));

describe('a list with @stagger', () => {
    it('delays the enter of the n-th inserted row by n × stagger, and clears it after', async () => {
        const { items, li } = mount([], { enter: 'fade', stagger: 50 });
        items.set(['a', 'b', 'c']);
        expect(['a', 'b', 'c'].map((k) => li(k)!.style.transitionDelay)).toEqual(['', '50ms', '100ms']);
        for (const k of ['a', 'b', 'c']) end(li(k));
        await settle();
        expect(['a', 'b', 'c'].map((k) => li(k)!.style.transitionDelay)).toEqual(['', '', '']);
    });

    it('counts only the rows that arrive, not the ones already there', () => {
        const { items, li } = mount(['a'], { enter: 'fade', stagger: 50 });
        items.set(['a', 'b', 'c']);
        expect(['b', 'c'].map((k) => li(k)!.style.transitionDelay)).toEqual(['', '50ms']);
    });
});

describe("a list with @mode('out-in')", () => {
    it('holds an arriving row in its from-state until the leaving rows are gone', async () => {
        const { items, li } = mount(['a'], { enter: 'fade', exit: 'fade', mode: 'out-in' });
        const leaving = li('a')!;
        items.set(['b']);
        const arriving = li('b')!;
        expect(leaving.classList.contains('pdx-exit-active'), 'the exit did not start').toBe(true);
        expect(arriving.classList.contains('pdx-enter-from'), 'the enter is not held').toBe(true);
        expect(arriving.classList.contains('pdx-enter-active'), 'the enter started with the exit').toBe(false);
        end(leaving);
        await settle();
        expect(leaving.isConnected).toBe(false);
        expect(arriving.classList.contains('pdx-enter-active'), 'the enter never started').toBe(true);
    });

    it("control — without a mode, enter and exit run together", () => {
        const { items, li } = mount(['a'], { enter: 'fade', exit: 'fade' });
        items.set(['b']);
        expect(li('b')!.classList.contains('pdx-enter-active')).toBe(true);
    });
});

describe('@for … @transition @stagger, compiled', () => {
    for (const inline of [false, true]) {
        it(`reaches the reconciler (${inline ? 'inline path' : 'template path'})`, async () => {
            const name = `forstagger${inline ? 'i' : 't'}`;
            const src = "<template><ul>@for (items as it; track it) @transition('fade') @stagger(40) { <li>{{ it }}</li> }</ul>"
                + "<button @click=\"items = ['a', 'b', 'c']\">go</button></template>\n<script setup>\nlet items = $signal([]);\n</script>\n";
            const { code } = compile(src, `${name}.pdx`, [], undefined, inline ? { production: true, inlineBindings: true } : { inlineBindings: false });
            const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
            new Function('__core', body)(core);
            const el = document.createElement(`pdx-${name}`);
            document.body.appendChild(el);
            await settle();
            el.querySelector('button')!.click();
            await settle();
            expect([...el.querySelectorAll('li')].map((li) => li.style.transitionDelay)).toEqual(['', '40ms', '80ms']);
        });
    }
});

describe("a list with @mode('in-out')", () => {
    it('keeps the leaving rows until the arriving ones have entered', async () => {
        const { items, li } = mount(['a'], { enter: 'fade', exit: 'fade', mode: 'in-out' });
        const leaving = li('a')!;
        items.set(['b']);
        const arriving = li('b')!;
        expect(arriving.classList.contains('pdx-enter-active')).toBe(true);
        expect(leaving.classList.contains('pdx-exit-active'), 'the exit started with the enter').toBe(false);
        end(arriving);
        await settle();
        expect(leaving.classList.contains('pdx-exit-active'), 'the exit never started').toBe(true);
    });
});
