// `@defer` in two phases (#281; docs/language/beta/template.md → «`@defer` — two phases»).
//
// The prefetch triggers load the code without rendering, the render triggers render — reusing the
// prefetched code, waiting for it in flight, or loading it again if the prefetch failed, which shows
// nothing. `when (expr)` fires the first time it is truthy and never un-fires. `@error`'s retry loads
// the code again. Here with a fake `loadFn` that counts its calls; the queue goes through its idle step.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { html } from '../src/renderer/template';
import { defer } from '../src/renderer/defer';
import { signal } from '../src/reactivity/signal';
import { resetLoadQueue } from '../src/renderer/load-queue';

/** Long enough for the prefetch queue's idle step and the load's microtasks. */
const settle = () => new Promise((r) => setTimeout(r, 20));
const frame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));

/** A fake load: each call answers with the next outcome (an Error rejects), and is counted. */
function fakeLoad(...outcomes: (unknown | Error)[]): { load: () => Promise<unknown>; calls: () => number } {
    let calls = 0;
    return {
        load: () => {
            const outcome = outcomes[Math.min(calls, outcomes.length - 1)];
            calls++;
            return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
        },
        calls: () => calls,
    };
}

/** Mount a deferred block; `renders` counts how often its body was built. */
function mountDefer(options: Parameters<typeof defer>[0], load: () => Promise<unknown>) {
    const box = document.createElement('div');
    document.body.appendChild(box);
    let renders = 0;
    box.appendChild(defer(options, load, () => { renders++; return html`<i class="body">body</i>`; }));
    return { box, renders: () => renders };
}

afterEach(() => {
    resetLoadQueue();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('@defer (…; prefetch …)', () => {
    it('prefetch loads the code and renders nothing; the render trigger renders with no second load', async () => {
        const show = signal(false);
        const fake = fakeLoad('module');
        const { box, renders } = mountDefer({ when: () => show(), prefetch: 'immediate', placeholder: () => html`<p class="ph"></p>` }, fake.load);
        await frame();
        await settle();
        expect(fake.calls(), 'the prefetch did not load the code').toBe(1);
        expect(box.querySelector('.body'), 'the prefetch rendered the body').toBeNull();
        expect(box.querySelector('.ph')).not.toBeNull();

        show.set(true);
        await settle();
        expect(box.querySelector('.body'), 'the render trigger did not render').not.toBeNull();
        expect(renders()).toBe(1);
        expect(fake.calls(), 'the render loaded the code a second time').toBe(1);
    });

    it('a prefetch that fails renders nothing and no @error; the render trigger loads again and renders', async () => {
        const show = signal(false);
        const fake = fakeLoad(new Error('offline'), 'module');
        const { box } = mountDefer({
            when: () => show(), prefetch: 'immediate',
            placeholder: () => html`<p class="ph"></p>`,
            error: () => html`<p class="error"></p>`,
        }, fake.load);
        await frame();
        await settle();
        expect(fake.calls()).toBe(1);
        expect(box.querySelector('.error'), 'a failed prefetch showed @error').toBeNull();
        expect(box.querySelector('.ph')).not.toBeNull();

        show.set(true);
        await settle();
        expect(fake.calls(), 'the render did not load again after the failed prefetch').toBe(2);
        expect(box.querySelector('.body')).not.toBeNull();
    });

    it('without prefetch, the code is loaded when the render trigger fires, as before', async () => {
        const show = signal(false);
        const fake = fakeLoad('module');
        const { box } = mountDefer({ when: () => show() }, fake.load);
        await frame();
        await settle();
        expect(fake.calls(), 'loaded before any trigger').toBe(0);
        show.set(true);
        await settle();
        expect(fake.calls()).toBe(1);
        expect(box.querySelector('.body')).not.toBeNull();
    });
});

describe('@defer (when (expr))', () => {
    it('true, false, true → one load, one mount, and the body stays', async () => {
        const flag = signal(false);
        const fake = fakeLoad('module');
        const { box, renders } = mountDefer({ when: () => flag() }, fake.load);
        await frame();
        flag.set(true);
        await settle();
        flag.set(false);
        await settle();
        flag.set(true);
        await settle();
        expect(fake.calls()).toBe(1);
        expect(renders()).toBe(1);
        expect(box.querySelector('.body'), 'the trigger un-fired and removed the block').not.toBeNull();
    });
});

describe('@error (err, retry)', () => {
    it('gives the branch the load error, and retry loads the code again', async () => {
        const fake = fakeLoad(new Error('chunk failed'), 'module');
        let retry: (() => void) | undefined;
        let seen: Error | undefined;
        const { box } = mountDefer({
            trigger: 'immediate',
            error: (e, again) => { seen = e; retry = again; return html`<p class="error"></p>`; },
        }, fake.load);
        await frame();
        await settle();
        expect(box.querySelector('.error')).not.toBeNull();
        expect(seen?.message).toBe('chunk failed');

        retry!();
        await settle();
        expect(fake.calls(), 'retry did not load the code again').toBe(2);
        expect(box.querySelector('.body')).not.toBeNull();
        expect(box.querySelector('.error')).toBeNull();
    });
});

describe('hover', () => {
    it('is not a trigger of the runtime any more: a hand-written defer() that says it is warned', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mountDefer({ trigger: 'hover' }, fakeLoad('m').load);
        await frame();
        expect(warn.mock.calls.map((c) => String(c[0])).some((m) => m.includes("'hover' is not a trigger"))).toBe(true);
    });
});
