// watch() observes the sources it is given and nothing else. Created inside a running effect — a
// component mounted by another component's effect, which is how `$watch` in a component's script
// runs when an app builds the component in an effect — it read a getter source and ran an
// `immediate` callback in that outer effect, which then depended on them: the source written (a ref,
// set by the component's own render) re-ran the outer effect, which built the component again,
// forever. The site's props playground looped pdx-scheduler a hundred times.

import { describe, it, expect } from 'vitest';
import { signal, effect } from '../src/reactivity/signal';
import { watch } from '../src/reactivity/watch';

const flush = () => new Promise<void>((r) => queueMicrotask(r));

describe('watch() inside a running effect', () => {
    it('does not make that effect depend on a getter source', async () => {
        const source = signal(0);
        let outer = 0;
        const dispose = effect(() => {
            outer++;
            watch(() => source(), () => {});
        });
        source.set(1);
        await flush();
        dispose();
        expect(outer).toBe(1);
    });

    it('does not make that effect depend on what an immediate callback reads', async () => {
        const source = signal(0);
        const other = signal('a');
        let outer = 0;
        const dispose = effect(() => {
            outer++;
            watch(source, () => { other(); }, { immediate: true });
        });
        other.set('b');
        await flush();
        dispose();
        expect(outer).toBe(1);
    });
});

describe('watch() callback', () => {
    it('still fires on every change of its source', async () => {
        const source = signal(0);
        const calls: [number, number][] = [];
        const dispose = watch(() => source() * 10, (v, old) => { calls.push([v, old]); });
        source.set(1);
        await flush();
        source.set(2);
        await flush();
        dispose();
        expect(calls).toEqual([[10, 0], [20, 10]]);
    });
});
