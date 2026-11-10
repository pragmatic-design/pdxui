// bindParts(el, sig) — a part the template renders more than once (#988): the signal holds the array
// of the rendered elements. The compiled and mounted half is
// packages/ui/tests/unit/part-rune-runtime.test.ts.

import { describe, it, expect, afterEach } from 'vitest';
import { bindParts } from '../src/index';
import { signal, collectDisposers, effect } from '../src/reactivity/signal';

afterEach(() => { document.body.innerHTML = ''; });

const flush = () => new Promise<void>((r) => queueMicrotask(r));

function li(text: string): HTMLLIElement {
    const el = document.createElement('li');
    el.textContent = text;
    return el;
}

describe('bindParts()', () => {
    it('an element bound is in the array in the same turn, before it is placed', () => {
        const sig = signal<Element[]>([]);
        const a = li('a'), b = li('b');
        collectDisposers(() => { bindParts(a, sig); bindParts(b, sig); });
        expect(sig()).toEqual([a, b]);
    });

    it('settles in document order once the elements are placed', async () => {
        const sig = signal<Element[]>([]);
        const ul = document.body.appendChild(document.createElement('ul'));
        const a = li('a'), b = li('b');
        // Bound b first, placed after a.
        collectDisposers(() => { bindParts(b, sig); bindParts(a, sig); });
        ul.append(a, b);
        await flush();
        expect(sig()).toEqual([a, b]);
    });

    it('an element leaves the array when its scope is disposed', async () => {
        const sig = signal<Element[]>([]);
        const ul = document.body.appendChild(document.createElement('ul'));
        const a = li('a'), b = li('b');
        collectDisposers(() => bindParts(a, sig));
        const [, disposeB] = collectDisposers(() => bindParts(b, sig));
        ul.append(a, b);
        await flush();
        disposeB();
        await flush();
        expect(sig()).toEqual([a]);
    });

    it('an array handed out is never changed under its reader', async () => {
        const sig = signal<Element[]>([]);
        const a = li('a'), b = li('b');
        collectDisposers(() => bindParts(a, sig));
        await flush();
        const first = sig();
        collectDisposers(() => bindParts(b, sig));
        expect(first).toEqual([a]);
        expect(sig()).toEqual([a, b]);
    });

    it('a settle that changes nothing notifies nobody', async () => {
        const sig = signal<Element[]>([]);
        const ul = document.body.appendChild(document.createElement('ul'));
        const a = li('a'), b = li('b');
        ul.append(a, b);
        let runs = 0;
        effect(() => { sig(); runs++; });
        collectDisposers(() => { bindParts(a, sig); bindParts(b, sig); });
        for (let i = 0; i < 4; i++) await flush();
        // Once at creation, once for the turn's array: the settle found it in order already.
        expect(runs).toBe(2);
        expect(sig()).toEqual([a, b]);
    });

    it('a value that is not a signal is ignored', () => {
        expect(() => collectDisposers(() => bindParts(li('a'), null))).not.toThrow();
    });
});
