// A computed read after it was disposed answers the current value, as a plain getter (#342).
//
// Its scope's disposer, or `read.dispose()`, unsubscribed it and left `dirty` false: every later
// read returned the value it had at the dispose, for good. A mutation made in a component and kept
// past it read `state()` as 'pending' after its call had succeeded. Disposed, it must still answer —
// recomputing untracked on every read — and never come back as a subscriber of its sources.
import { describe, it, expect, beforeEach } from 'vitest';
import { signal, computed, collectDisposers, __pdx_debug } from '../src/index';
import { html } from '../src/renderer/template';
import { component } from '../src/component/component';
import { onDestroy } from '../src/component/lifecycle';
import { mutation, type Mutation } from '../src/reactivity/mutation';
import { waitUntil } from './wait-until';

beforeEach(() => {
    // The subscriber registry only fills at level 2.
    __pdx_debug.setLevel(2);
    __pdx_debug.clear();
});

describe('a computed after its dispose', () => {
    it('disposed by its scope, answers each new value of its source, and is not subscribed', () => {
        const source = signal(1, { name: 'src-scope' });
        const [doubled, dispose] = collectDisposers(() => computed(() => source() * 2, { name: 'doubled-scope' }));
        expect(doubled()).toBe(2);
        expect(__pdx_debug.subscribers(source), 'control: before the dispose it listens').toContain('doubled-scope');

        dispose();
        source.set(2);
        expect(doubled()).toBe(4);
        // A second change: the first read after the dispose must not freeze it again.
        source.set(3);
        expect(doubled()).toBe(6);
        expect(doubled.peek()).toBe(6);
        expect(__pdx_debug.subscribers(source), 'a read after the dispose subscribed it again').not.toContain('doubled-scope');
    });

    it('disposed by hand, the same', () => {
        const source = signal(1, { name: 'src-hand' });
        const doubled = computed(() => source() * 2, { name: 'doubled-hand' }) as ReturnType<typeof computed<number>> & { dispose: () => void };
        expect(doubled()).toBe(2);

        doubled.dispose();
        source.set(5);
        expect(doubled()).toBe(10);
        source.set(6);
        expect(doubled()).toBe(12);
        expect(__pdx_debug.subscribers(source)).not.toContain('doubled-hand');
    });
});

describe('a mutation kept past its component (#267)', () => {
    it('reads success and its data after the answer', async () => {
        const answers: ((v: string) => void)[] = [];
        const box: { save?: Mutation<string, string>; destroyed: boolean } = { destroyed: false };
        const tag = 'computed-dispose-mutation-owner';
        component(tag, {
            setup() {
                box.save = mutation<string, string>({ fn: () => new Promise<string>(r => answers.push(r)) });
                onDestroy(() => { box.destroyed = true; });
                return { save: box.save };
            },
            render: () => html`<span>${() => box.save!.state()}</span>`,
        });
        const el = document.createElement(tag);
        document.body.appendChild(el);

        const call = box.save!.execute('bob');
        expect(box.save!.state()).toBe('pending');
        el.remove();
        await waitUntil(() => box.destroyed, 'the component to be destroyed');

        answers[0]('saved bob');
        await call;
        expect(box.save!.state()).toBe('success');
        expect(box.save!.data()).toBe('saved bob');
        expect(box.save!.pending()).toBe(false);
    });
});
