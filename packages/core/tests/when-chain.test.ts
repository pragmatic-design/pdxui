// whenChain(): an `@if` / `@else if` / `@else` chain as one branch (#685). The chain rendered as nested
// when() calls, one per `@else if`, each with its own effect and two markers: in a `@for` row that is
// one chain, that was most of the row. This holds the one-branch form to what the nested form does.

import { describe, it, expect, beforeEach } from 'vitest';
import { signal, effect, collectDisposers } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { whenChain } from '../src/renderer/when-chain';

const kinds = (s: () => string) => () => (s() === 'a' ? 0 : s() === 'b' ? 1 : 2);

describe('whenChain(): one branch for an @if chain', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('renders the branch the selector picks, and swaps when the pick changes', () => {
        const kind = signal('a');
        document.body.appendChild(whenChain(kinds(kind), [
            () => html`<i class="a"></i>`,
            () => html`<i class="b"></i>`,
            () => html`<i class="c"></i>`,
        ]));
        expect(document.body.querySelectorAll('i').length).toBe(1);
        expect(document.querySelector('.a')).not.toBeNull();
        kind.set('b');
        expect(document.querySelectorAll('i').length).toBe(1);
        expect(document.querySelector('.b')).not.toBeNull();
        kind.set('z');
        expect(document.querySelectorAll('i').length).toBe(1);
        expect(document.querySelector('.c')).not.toBeNull();
    });

    it('renders nothing for a chain with no @else when no condition holds', () => {
        const kind = signal('z');
        document.body.appendChild(whenChain(() => (kind() === 'a' ? 0 : -1), [() => html`<i class="a"></i>`]));
        expect(document.querySelector('i')).toBeNull();
        kind.set('a');
        expect(document.querySelector('.a')).not.toBeNull();
        kind.set('y');
        expect(document.querySelector('i')).toBeNull();
    });

    it('keeps the branch it has when the pick is the same, and disposes the one it replaces', () => {
        const kind = signal('a');
        const tick = signal(0);
        let runs = 0;
        document.body.appendChild(whenChain(() => { tick(); return kinds(kind)(); }, [
            () => { effect(() => { tick(); runs++; }); return html`<i class="a"></i>`; },
            () => html`<i class="b"></i>`,
            () => html`<i class="c"></i>`,
        ]));
        const first = document.querySelector('.a');
        tick.set(1);
        expect(document.querySelector('.a'), 'the same pick rebuilds nothing').toBe(first);
        expect(runs).toBe(2);
        kind.set('b');
        tick.set(2);
        expect(runs, 'the replaced branch\'s effect is disposed').toBe(2);
    });

    it('disposes the shown branch with the scope it was created in', () => {
        const kind = signal('a');
        const tick = signal(0);
        let runs = 0;
        const [frag, dispose] = collectDisposers(() => whenChain(kinds(kind), [
            () => { effect(() => { tick(); runs++; }); return html`<i class="a"></i>`; },
            () => html`<i class="b"></i>`,
            () => html`<i class="c"></i>`,
        ]));
        document.body.appendChild(frag);
        dispose();
        tick.set(1);
        expect(runs).toBe(1);
        kind.set('b');
        expect(document.querySelector('.b'), 'a disposed chain no longer swaps').toBeNull();
    });
});
