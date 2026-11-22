// A component connected inside someone else's effect does not subscribe that effect (#1309).
//
// connectedCallback ran the component's setup, its render and its onMount callbacks with whatever effect
// was running around it. A parent that builds its children in an effect — pdx-form-template's list rows
// do — was then subscribed to every signal a child read while mounting: a change to the child's own state
// re-ran the parent, which rebuilt the child. pdx-number-input, moved to .pdx (#1210), reads its `:ref` in
// onMount, and the ref is set back to null when the child is removed: each rebuild removed the old child,
// woke the parent, and rebuilt again, with no end.

import { describe, it, expect, beforeEach } from 'vitest';
import { component, effect, signal, html, onMount } from '../src/index';

const settle = () => new Promise((r) => setTimeout(r, 0));
let seq = 0;

/** A component whose setup, render or onMount reads `source`, as `where` says. */
function defineReader(where: 'setup' | 'render' | 'mount', source: () => unknown): string {
    const tag = `mount-untracked-${where}-${++seq}`;
    component(tag, {
        setup() {
            if (where === 'setup') source();
            if (where === 'mount') onMount(() => { source(); });
            return {};
        },
        // The render reads `source` once, as a render does at mount, and binds it, as its template does.
        render: () => (where === 'render' ? (source(), html`<span>${() => String(source())}</span>`) : html`<span></span>`),
    });
    return tag;
}

describe('a component mounted inside an effect', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    for (const where of ['setup', 'render', 'mount'] as const) {
        it(`does not subscribe the effect to what its ${where} reads`, async () => {
            const read = signal(0);
            const tag = defineReader(where, read);
            const host = document.createElement('div');
            document.body.appendChild(host);
            let runs = 0;
            const dispose = effect(() => {
                runs++;
                host.replaceChildren(document.createElement(tag));
            });
            await settle();
            expect(runs, 'the effect ran once').toBe(1);
            read.set(1);
            await settle();
            expect(runs, `the child's ${where} read subscribed the effect that mounted it`).toBe(1);
            dispose();
        });
    }

    it('the control: the effect still follows what it reads itself', async () => {
        const read = signal(0);
        const tag = defineReader('setup', () => 0);
        const host = document.createElement('div');
        document.body.appendChild(host);
        let runs = 0;
        const dispose = effect(() => {
            runs++;
            read();
            host.replaceChildren(document.createElement(tag));
        });
        await settle();
        read.set(1);
        await settle();
        expect(runs).toBe(2);
        dispose();
    });

    it('the child still follows what it reads: its own render updates', async () => {
        const read = signal('a');
        const tag = defineReader('render', read);
        const host = document.createElement('div');
        document.body.appendChild(host);
        const dispose = effect(() => { host.replaceChildren(document.createElement(tag)); });
        await settle();
        read.set('b');
        await settle();
        expect(host.textContent).toBe('b');
        dispose();
    });
});
