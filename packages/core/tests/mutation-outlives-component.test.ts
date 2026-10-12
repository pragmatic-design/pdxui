// A write outlives its component (#267; beta spec, lifecycle.md, «The matrix», row «`@action` call in
// flight or queued» → destroyed; «Writes outlive their component; reads do not»; acceptance case 4).
//
// A user presses Save and navigates away before the answer arrives. The save must still land: the
// call runs to its end, `invalidate` drops what it made stale, `onSuccess` runs, and writing the
// mutation's signals — which nothing observes any more — raises nothing. A call queued behind it runs
// too. `mutation()` has no dispose path, so this is expected to hold; the test is what says it does.
// What the mutation's `state()` reads after the destroy is not asserted here: its computeds are
// disposed with the component and answer their last value (#342).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { html } from '../src/renderer/template';
import { component } from '../src/component/component';
import { onDestroy } from '../src/component/lifecycle';
import { mutation, type Mutation } from '../src/reactivity/mutation';
import { createCache, type Cache } from '../src/reactivity/cache';
import { waitUntil } from './wait-until';

let tagId = 0;

/** A transport that answers when the test says so, and counts the requests it received. */
function transport() {
    const requests: string[] = [];
    const answers: ((v: string) => void)[] = [];
    return {
        requests,
        fn: (input: string) => {
            requests.push(input);
            return new Promise<string>(resolve => answers.push(resolve));
        },
        answer: (i: number, value: string) => answers[i](value),
    };
}

/** A component whose setup owns the mutation and shows its state; returns it mounted. */
function mountSaver(cache: Cache, t: ReturnType<typeof transport>, succeeded: string[]) {
    const tag = `mutation-owner-${tagId++}`;
    const box: { save?: Mutation<string, string>; destroyed: boolean } = { destroyed: false };
    component(tag, {
        setup() {
            box.save = mutation<string, string>({
                fn: t.fn,
                invalidate: ['users'],
                onSuccess: (data) => { succeeded.push(data); },
                cache,
            });
            onDestroy(() => { box.destroyed = true; });
            return { save: box.save };
        },
        render: () => html`<span class="state">${() => box.save!.state()}</span>`,
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    return { el, box };
}

const settle = () => new Promise(r => setTimeout(r, 0));

describe('a mutation pending when its component is destroyed', () => {
    const rejections: unknown[] = [];
    const onRejection = (e: PromiseRejectionEvent | unknown) => { rejections.push(e); };

    beforeEach(() => {
        document.body.innerHTML = '';
        rejections.length = 0;
        process.on('unhandledRejection', onRejection);
    });
    afterEach(() => { process.off('unhandledRejection', onRejection); });

    function seededCache(): Cache {
        const cache = createCache();
        cache.set('users:list', ['ann'], { tags: ['users'] });
        cache.set('orders:list', ['o1'], { tags: ['orders'] });
        return cache;
    }

    it('runs to its end: one request, invalidate drops the tagged entry, onSuccess runs, nothing thrown', async () => {
        const cache = seededCache();
        const t = transport();
        const succeeded: string[] = [];
        const { el, box } = mountSaver(cache, t, succeeded);
        expect(el.querySelector('.state')?.textContent).toBe('idle');

        const call = box.save!.execute('bob');
        expect(el.querySelector('.state')?.textContent, 'control: the mounted component shows the call').toBe('pending');

        el.remove();
        await waitUntil(() => box.destroyed, 'the component to be destroyed');
        expect(cache.get('users:list'), 'invalidate ran before the answer').toBeDefined();

        t.answer(0, 'saved bob');
        await expect(call).resolves.toBe('saved bob');
        await settle();

        expect(t.requests, 'the request was not sent exactly once').toEqual(['bob']);
        expect(cache.get('users:list'), 'invalidate did not run after the component was gone').toBeUndefined();
        expect(cache.get('orders:list'), 'invalidate dropped an entry it does not name').toBeDefined();
        expect(succeeded).toEqual(['saved bob']);
        expect(rejections, 'an unhandled rejection').toEqual([]);
    });

    it('a call queued behind it runs too, after it, once each', async () => {
        const cache = seededCache();
        const t = transport();
        const succeeded: string[] = [];
        const { el, box } = mountSaver(cache, t, succeeded);

        const first = box.save!.execute('bob');
        const second = box.save!.execute('carl');
        expect(t.requests, 'the second call did not wait for the first').toEqual(['bob']);

        el.remove();
        await waitUntil(() => box.destroyed, 'the component to be destroyed');

        t.answer(0, 'saved bob');
        await expect(first).resolves.toBe('saved bob');
        await waitUntil(() => t.requests.length === 2, 'the queued call to start after the destroy');
        cache.set('users:list', ['ann', 'bob'], { tags: ['users'] });
        t.answer(1, 'saved carl');
        await expect(second).resolves.toBe('saved carl');
        await settle();

        expect(t.requests).toEqual(['bob', 'carl']);
        expect(succeeded).toEqual(['saved bob', 'saved carl']);
        expect(cache.get('users:list'), 'the queued call did not invalidate').toBeUndefined();
        expect(rejections, 'an unhandled rejection').toEqual([]);
    });
});
