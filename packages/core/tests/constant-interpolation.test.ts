// bindInterpolation's `constant`: a value the compiler knows cannot change is written once, by the same
// rule as a reactive one, and creates no effect (#110).

import { describe, it, expect } from 'vitest';
import { bindInterpolation } from '../src/renderer/template';
import { signal, effect } from '../src/reactivity/signal';

function anchorIn(): { host: HTMLElement; anchor: Text } {
    const host = document.createElement('p');
    const anchor = document.createTextNode('');
    host.appendChild(anchor);
    return { host, anchor };
}

describe('bindInterpolation(anchor, value, true)', () => {
    it('writes the value once and does not follow a signal it reads', () => {
        const s = signal('a');
        const { host, anchor } = anchorIn();
        let reads = 0;
        bindInterpolation(anchor, () => { reads++; return s(); }, true);
        expect(host.textContent).toBe('a');
        s.set('b');
        expect(host.textContent, 'a constant binding followed the signal').toBe('a');
        expect(reads).toBe(1);
    });

    it('writes by the same rule as the reactive binding: null is empty text, an array is nodes', () => {
        const a = anchorIn();
        bindInterpolation(a.anchor, () => null, true);
        expect(a.host.textContent).toBe('');

        const b = anchorIn();
        const span = document.createElement('span');
        span.textContent = 'x';
        bindInterpolation(b.anchor, () => ['y', span], true);
        expect(b.host.innerHTML).toBe('y<span>x</span>');
    });

    it('reading inside it does not subscribe the effect it is rendered in', () => {
        const s = signal(1);
        let runs = 0;
        effect(() => {
            runs++;
            const { anchor } = anchorIn();
            bindInterpolation(anchor, () => s(), true);
        });
        s.set(2);
        expect(runs, 'the render around a constant binding re-ran on its signal').toBe(1);
    });

    it('the control: without it, the binding follows the signal', () => {
        const s = signal('a');
        const { host, anchor } = anchorIn();
        bindInterpolation(anchor, () => s());
        s.set('b');
        expect(host.textContent).toBe('b');
    });
});
