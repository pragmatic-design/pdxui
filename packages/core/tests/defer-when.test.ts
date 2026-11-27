// `@defer (when (x)) { … }` with nothing else is core's deferWhen, not defer() (#1287, item G).
//
// defer() carries every trigger, the prefetch phase, the permission, the placeholder, loading and error
// states and the hydration's take-over: about 2.7 KB gzip, which `pdx-statistic`'s icon behind
// `@defer (when (icon))` brought into every app with the library. A block whose only trigger is a
// `when` renders its body the first time the condition holds and never removes it: deferWhen is that,
// with the same rules as defer() for it — the code already there renders in the same task, a load
// still to come is an urgent one, and a load that fails renders nothing.

import { describe, it, expect, afterEach } from 'vitest';
import { signal, effect, collectDisposers } from '../src/reactivity/signal';
import { deferWhen } from '../src/renderer/defer-when';
import { deferCode } from '../src/renderer/defer-code';

afterEach(() => { document.body.innerHTML = ''; });

const body = () => { const p = document.createElement('p'); p.className = 'body'; p.textContent = 'shown'; return p; };
const mount = (frag: DocumentFragment) => { document.body.appendChild(frag); };

describe('deferWhen', () => {
    it('renders the body the first time the condition holds, and keeps it after', () => {
        const show = signal(false);
        mount(deferWhen(() => show(), null, body));
        expect(document.querySelector('.body')).toBeNull();
        show.set(true);
        expect(document.querySelector('.body')).not.toBeNull();
        show.set(false);
        expect(document.querySelector('.body'), 'a when does not un-fire').not.toBeNull();
    });

    it('code that has arrived renders in the same task; code still to load renders when it arrives', async () => {
        const arrived = deferCode(() => Promise.resolve('mod'));
        await arrived();
        const show = signal(false);
        mount(deferWhen(() => show(), arrived, body));
        show.set(true);
        expect(document.querySelector('.body'), 'arrived code waits for nothing').not.toBeNull();

        document.body.innerHTML = '';
        let resolve!: (v: unknown) => void;
        const later = deferCode(() => new Promise((r) => { resolve = r; }));
        mount(deferWhen(() => true, later, body));
        expect(document.querySelector('.body')).toBeNull();
        resolve('mod');
        await Promise.resolve(); await Promise.resolve();
        expect(document.querySelector('.body')).not.toBeNull();
    });

    it('a load that fails renders nothing', async () => {
        const failing = deferCode(() => Promise.reject(new Error('offline')));
        mount(deferWhen(() => true, failing, body));
        await new Promise((r) => setTimeout(r, 0));
        expect(document.querySelector('.body')).toBeNull();
    });

    it('the body belongs to the block: disposing the scope that made it removes its nodes and effects', () => {
        const show = signal(true);
        const text = signal('a');
        let runs = 0;
        const [frag, dispose] = collectDisposers(() => deferWhen(() => show(), null, () => {
            const p = document.createElement('p');
            p.className = 'body';
            // An effect of the body's own: it lives as long as the block.
            effect(() => { text(); runs++; });
            return p;
        }));
        mount(frag);
        expect(document.querySelector('.body')).not.toBeNull();
        expect(runs).toBe(1);
        dispose();
        expect(document.querySelector('.body')).toBeNull();
        text.set('b');
        expect(runs, 'the body\'s effect outlived its block').toBe(1);
    });
});
