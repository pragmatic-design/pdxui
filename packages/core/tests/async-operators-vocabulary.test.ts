// The signal operators speak the beta's async vocabulary (#1169): data(), error(), state(), pending(),
// as resources, useQuery, mutations and loaders do (docs/language/data.md, "The async vocabulary").
// A refresh keeps the settled state with pending() true; error() is cleared only by a success. The
// alpha names, loading() and status(), stay one release, deprecated, computed from the new state.

import { describe, it, expect } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { switchSignal, exhaustSignal, concatSignal, retrySignal } from '../src/reactivity/async-operators';
import { fromPromise } from '../src/reactivity/from-promise';
import { waitUntil } from './wait-until';

/** A promise the test settles by hand. */
function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

describe('switchSignal speaks the vocabulary', () => {
    it('a first load is pending with no data, then success with the data', async () => {
        const first = deferred<string>();
        const r = switchSignal(() => 'q', () => first.promise);
        expect(r.state()).toBe('pending');
        expect(r.pending()).toBe(true);
        expect(r.data()).toBeUndefined();
        first.resolve('one');
        await waitUntil(() => r.state() === 'success', 'the first load to settle');
        expect(r.data()).toBe('one');
        expect(r()).toBe('one');
        expect(r.pending()).toBe(false);
        r.dispose();
    });

    it('a refresh keeps success and the data, with pending() true', async () => {
        const answers = [deferred<string>(), deferred<string>()];
        let call = 0;
        const query = signal('a');
        const r = switchSignal(() => query(), () => answers[call++].promise);
        answers[0].resolve('A');
        await waitUntil(() => r.state() === 'success', 'the first load to settle');
        query.set('b');
        expect(r.state()).toBe('success');
        expect(r.pending()).toBe(true);
        expect(r.data()).toBe('A');
        answers[1].resolve('B');
        await waitUntil(() => r.data() === 'B', 'the refresh to settle');
        expect(r.pending()).toBe(false);
        r.dispose();
    });

    it('error() survives the next request and is cleared only by a success', async () => {
        const answers = [deferred<string>(), deferred<string>()];
        let call = 0;
        const query = signal('a');
        const r = switchSignal(() => query(), () => answers[call++].promise);
        answers[0].reject(new Error('down'));
        await waitUntil(() => r.state() === 'error', 'the failure to reach the signal');
        expect(r.error()).toBeInstanceOf(Error);
        query.set('b');
        // resource()'s rule: with no data yet a request is 'pending'; with data it keeps the state.
        expect(r.pending()).toBe(true);
        expect(r.state()).toBe('pending');
        expect(r.error()).toBeInstanceOf(Error);
        answers[1].resolve('B');
        await waitUntil(() => r.state() === 'success', 'the retry to succeed');
        expect(r.error()).toBeNull();
        r.dispose();
    });

    it('the alpha names still answer, from the new state', async () => {
        const first = deferred<string>();
        const r = switchSignal(() => 'q', () => first.promise);
        expect(r.loading()).toBe(true);
        expect(r.status()).toBe('loading');
        first.resolve('one');
        await waitUntil(() => r.state() === 'success', 'the first load to settle');
        expect(r.loading()).toBe(false);
        expect(r.status()).toBe('success');
        r.dispose();
    });
});

describe('the other operators speak it too', () => {
    it('exhaustSignal', async () => {
        const first = deferred<number>();
        const r = exhaustSignal(() => 0, () => first.promise);
        expect(r.state()).toBe('pending');
        first.resolve(1);
        await waitUntil(() => r.state() === 'success', 'exhaustSignal to settle');
        expect(r.data()).toBe(1);
        expect(r.pending()).toBe(false);
        r.dispose();
    });

    it('concatSignal', async () => {
        const first = deferred<number>();
        const r = concatSignal(() => 0, () => first.promise);
        expect(r.state()).toBe('pending');
        first.resolve(2);
        await waitUntil(() => r.state() === 'success', 'concatSignal to settle');
        expect(r.data()).toBe(2);
        expect(r.pending()).toBe(false);
        r.dispose();
    });

    it('retrySignal, failing every attempt: error, with nothing pending', async () => {
        const r = retrySignal(() => Promise.reject(new Error('no')), { maxRetries: 1, delayMs: 1 });
        expect(r.state()).toBe('pending');
        await waitUntil(() => r.state() === 'error', 'retrySignal to give up');
        expect(r.error()).toBeInstanceOf(Error);
        expect(r.pending()).toBe(false);
        expect(r.data()).toBeUndefined();
        r.dispose();
    });
});

describe('fromPromise speaks the vocabulary', () => {
    it('starts pending, settles to success with the data', async () => {
        const p = deferred<string>();
        const r = fromPromise(p.promise);
        expect(r.state()).toBe('pending');
        expect(r.pending()).toBe(true);
        expect(r.data()).toBeUndefined();
        p.resolve('x');
        await waitUntil(() => r.state() === 'success', 'the promise to resolve');
        expect(r.data()).toBe('x');
        expect(r.pending()).toBe(false);
        expect(r.loading()).toBe(false);
    });

    it('a rejection is error, with error() the reason', async () => {
        const r = fromPromise(Promise.reject(new Error('gone')));
        await waitUntil(() => r.state() === 'error', 'the rejection to reach the signal');
        expect(r.error()).toBeInstanceOf(Error);
        expect(r.pending()).toBe(false);
        expect(r.status()).toBe('error');
    });
});
