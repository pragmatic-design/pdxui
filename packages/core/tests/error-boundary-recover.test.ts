// errorBoundary's `onRecover` (#1365): called when the content renders again after an error — a
// retry, an automatic retry, a `resetOn` change — so a state `onError` set can be cleared there.
// `pdx-error-boundary` clears its `error` state and its context's error with it; its TypeScript
// version did it in a content function of its own, which a template's `@try` has no place for.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { errorBoundary } from '../src/renderer/error-boundary';
import { onGlobalError, clearGlobalErrorHandlers } from '../src/component/global-error';
import { waitUntil } from './wait-until';

beforeEach(() => {
    document.body.innerHTML = '';
    clearGlobalErrorHandlers();
    onGlobalError(() => true);
});
afterEach(() => clearGlobalErrorHandlers());

/** A boundary whose content throws while `fail` is set, with a log of its callbacks. */
function boundary(fail: { value: boolean }, options: Parameters<typeof errorBoundary>[2] = {}) {
    const log: string[] = [];
    let retryFn: (() => void) | null = null;
    const host = document.createElement('div');
    host.appendChild(errorBoundary(
        () => { if (fail.value) throw new Error('boom'); return html`<p class="ok">ok</p>`; },
        (_e, retry) => { retryFn = retry; return html`<p class="fallback">down</p>`; },
        { ...options, onError: (_e, n) => log.push(`error ${n}`), onRecover: () => log.push('recover') },
    ));
    document.body.appendChild(host);
    return { host, log, retry: () => retryFn!() };
}

describe('errorBoundary onRecover', () => {
    it('is not called by the first render', () => {
        const { log } = boundary({ value: false });
        expect(log).toEqual([]);
    });

    it('is called when a Retry brings the content back, after onError', () => {
        const fail = { value: true };
        const { host, log, retry } = boundary(fail);
        fail.value = false;
        retry();
        expect(host.querySelector('.ok')).not.toBeNull();
        expect(log).toEqual(['error 1', 'recover']);
    });

    it('is not called by a Retry that fails again', () => {
        const fail = { value: true };
        const { log, retry } = boundary(fail);
        retry();
        expect(log).toEqual(['error 1', 'error 2']);
    });

    it('is called when an automatic retry brings the content back', async () => {
        const fail = { value: true };
        const { host, log } = boundary(fail, { autoRetry: true, retryDelay: 0, maxRetries: 3 });
        fail.value = false;
        await waitUntil(() => host.querySelector('.ok') !== null, 'the automatic retry rendered the content');
        expect(log).toEqual(['error 1', 'recover']);
    });

    it('is called when resetOn brings the content back', () => {
        const fail = { value: true };
        const key = signal(1);
        const { host, log } = boundary(fail, { resetOn: () => key() });
        fail.value = false;
        key.set(2);
        expect(host.querySelector('.ok')).not.toBeNull();
        expect(log).toEqual(['error 1', 'recover']);
    });
});
