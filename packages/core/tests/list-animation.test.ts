// A keyed list runs its transitions with the animation its options give, `animate` (#1246): the
// reconciler in list.ts imports none of transitions.ts, so a list with no transition does not carry it.
// The hand-written repeat() and each() give it themselves; what the compiler emits names it, and goes
// through mountList, which gives none.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { repeat, mountList } from '../src/renderer/list';
import { each } from '../src/renderer/helpers';
import { listAnimation } from '../src/renderer/transitions';

const hosts: HTMLElement[] = [];
afterEach(() => { for (const h of hosts.splice(0)) h.remove(); });

/** A list of `<li>` from `mount`, in a `<ul>`; `add` puts a row in, so its enter runs. */
function list(mount: (items: () => string[], render: (k: string) => Node) => Node) {
    const items = signal<string[]>([]);
    const ul = document.createElement('ul');
    document.body.appendChild(ul);
    hosts.push(ul);
    ul.appendChild(mount(() => items(), (k) => {
        const li = document.createElement('li');
        li.dataset.k = k;
        return li;
    }));
    return { add: (k: string) => items.set([k]), li: (k: string) => ul.querySelector<HTMLElement>(`li[data-k="${k}"]`)! };
}

describe('a keyed list and its animation (#1246)', () => {
    it('given transitions and listAnimation, a new row enters', () => {
        const l = list((items, render) => mountList(items, (k) => k, { mode: 'value', render }, { transitions: { enter: 'fade', animate: listAnimation } }));
        l.add('a');
        expect(l.li('a').classList.contains('pdx-fade')).toBe(true);
    });

    it('given transitions and no animation, it renders without them, and development says so', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const l = list((items, render) => mountList(items, (k) => k, { mode: 'value', render }, { transitions: { enter: 'fade' } }));
            l.add('a');
            expect(l.li('a').className).toBe('');
            expect(warn.mock.calls.some((c) => String(c[0]).includes('no animation'))).toBe(true);
        } finally {
            warn.mockRestore();
        }
    });

    it('the hand-written repeat() and each() give it themselves', () => {
        const viaRepeat = list((items, render) => repeat(items, (k) => k, render, { transitions: { enter: 'fade' } }));
        viaRepeat.add('a');
        expect(viaRepeat.li('a').classList.contains('pdx-fade')).toBe(true);
        const viaEach = list((items, render) => each(items, (k) => k, render, { enter: 'fade' }));
        viaEach.add('b');
        expect(viaEach.li('b').classList.contains('pdx-fade')).toBe(true);
    });
});
