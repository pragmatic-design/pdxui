// Tests for Error Boundary.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal, effect } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { errorBoundary } from '../src/renderer/error-boundary';

describe('errorBoundary()', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('renders content when no error', () => {
        const frag = errorBoundary(
            () => html`<div class="content">Hello</div>`,
            (err) => html`<div class="error">${err.message}</div>`
        );

        document.body.appendChild(frag);
        expect(document.querySelector('.content')?.textContent).toBe('Hello');
        expect(document.querySelector('.error')).toBeNull();
    });

    it('renders fallback when content throws synchronously', () => {
        const frag = errorBoundary(
            () => { throw new Error('boom'); },
            (err) => html`<div class="error">${err.message}</div>`
        );

        document.body.appendChild(frag);
        expect(document.querySelector('.error')?.textContent).toBe('boom');
    });

    it('fallback receives the error object', () => {
        const errorFn = vi.fn((err: Error) =>
            html`<div class="error">${err.message}</div>`
        );

        const frag = errorBoundary(
            () => { throw new Error('test-error'); },
            errorFn as any
        );

        document.body.appendChild(frag);
        expect(errorFn).toHaveBeenCalledOnce();
        expect(errorFn.mock.calls[0][0].message).toBe('test-error');
    });

    it('retry re-renders content', () => {
        let shouldFail = true;
        let retryFn: (() => void) | null = null;

        const frag = errorBoundary(
            () => {
                if (shouldFail) throw new Error('fail');
                return html`<div class="content">Success</div>`;
            },
            (err, retry) => {
                retryFn = retry;
                return html`<div class="error">${err.message}</div>`;
            }
        );

        document.body.appendChild(frag);
        expect(document.querySelector('.error')?.textContent).toBe('fail');
        expect(document.querySelector('.content')).toBeNull();

        // Fix the error and retry
        shouldFail = false;
        retryFn!();

        expect(document.querySelector('.content')?.textContent).toBe('Success');
        expect(document.querySelector('.error')).toBeNull();
    });

    it('handles non-Error throws (strings, numbers)', () => {
        const frag = errorBoundary(
            () => { throw 'string-error'; },
            (err) => html`<div class="error">${err.message}</div>`
        );

        document.body.appendChild(frag);
        expect(document.querySelector('.error')?.textContent).toBe('string-error');
    });

    it('handles fallback that also throws (minimal render)', () => {
        const frag = errorBoundary(
            () => { throw new Error('content-boom'); },
            () => { throw new Error('fallback-boom'); }
        );

        document.body.appendChild(frag);
        // Should render minimal text
        expect(document.body.textContent).toContain('content-boom');
    });

    it('catches effect errors via error handler stack', () => {
        const badSignal = signal(0);

        const frag = errorBoundary(
            () => {
                const div = document.createElement('div');
                div.className = 'content';
                // This effect will throw when badSignal changes
                effect(() => {
                    const val = badSignal();
                    if (val > 0) throw new Error('effect-boom');
                    div.textContent = `value: ${val}`;
                });
                return div;
            },
            (err, _retry) => {
                return html`<div class="error">${err.message}</div>`;
            }
        );

        document.body.appendChild(frag);
        expect(document.querySelector('.content')?.textContent).toBe('value: 0');

        // Trigger error in effect
        badSignal.set(1);
        expect(document.querySelector('.error')?.textContent).toBe('effect-boom');
    });
});
