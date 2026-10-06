// `@await (promise)` waits for the promise.
//
// A plain `when(() => x, body, loading)` is a truthiness switch — and a Promise object is always
// truthy, so the "resolved" branch would render at once and forever: while the promise is pending,
// and after it rejects. The skill documents `@await (promise) { … } @loading { … }`, and that has to
// keep `ok` out of the DOM when the promise rejects 100ms later.
//
// `awaitReady` is what the compiler wraps the condition in. For a promise (any thenable): pending
// → false, fulfilled → true, rejected → it THROWS the reason, which lands in the error boundary the
// compiler emits for `@error`. For anything else it is a truthiness test, so `@await (appReady)`
// with a boolean signal is a plain condition.

import { describe, it, expect, afterEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { when, awaitReady } from '../src/renderer/helpers';
import { errorBoundary } from '../src/renderer/error-boundary';

const node = (text: string) => {
    const el = document.createElement('span');
    el.textContent = text;
    return el;
};

const mount = (frag: DocumentFragment): HTMLElement => {
    const host = document.createElement('div');
    host.appendChild(frag);
    document.body.appendChild(host);
    return host;
};

/** Let the promise's reactions and the effects they trigger run. */
const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };

/** A promise the test resolves or rejects by hand. */
function deferred() {
    let resolve!: (v: unknown) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    promise.catch(() => {}); // the test observes the rejection through the boundary
    return { promise, resolve, reject };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('awaitReady with a promise', () => {
    it('is loading while the promise is pending', async () => {
        const d = deferred();
        const host = mount(when(() => awaitReady(d.promise), () => node('ok'), () => node('wait')));
        await settle();
        expect(host.textContent, 'the body rendered for a promise that has not settled').toBe('wait');
    });

    it('renders the body once the promise fulfils', async () => {
        const d = deferred();
        const host = mount(when(() => awaitReady(d.promise), () => node('ok'), () => node('wait')));
        d.resolve(42);
        await settle();
        expect(host.textContent).toBe('ok');
    });

    it('reaches the error branch when the promise rejects, with the reason', async () => {
        const d = deferred();
        const host = mount(errorBoundary(
            () => when(() => awaitReady(d.promise), () => node('ok'), () => node('wait')),
            (err) => node('failed: ' + err.message),
        ));
        d.reject(new Error('offline'));
        await settle();
        expect(host.textContent, 'a rejected promise still showed the body or the spinner').toBe('failed: offline');
    });

    it('turns a non-Error rejection into an Error the branch can read', async () => {
        const d = deferred();
        const host = mount(errorBoundary(
            () => when(() => awaitReady(d.promise), () => node('ok'), () => node('wait')),
            (err) => node('failed: ' + err.message),
        ));
        d.reject('timeout');
        await settle();
        expect(host.textContent).toBe('failed: timeout');
    });
});

describe('awaitReady with anything else — unchanged', () => {
    it('is the truthiness of a boolean condition, as @await (appReady) always was', async () => {
        // The control: the existing caller must behave exactly as before.
        const ready = signal(false);
        const host = mount(when(() => awaitReady(ready()), () => node('ok'), () => node('wait')));
        expect(host.textContent).toBe('wait');
        ready.set(true);
        await settle();
        expect(host.textContent).toBe('ok');
    });

    it('treats a non-thenable object as truthy, and null as not ready', () => {
        expect(awaitReady({ then: 'not a function' })).toBe(true);
        expect(awaitReady(null)).toBe(false);
        expect(awaitReady(0)).toBe(false);
    });
});
