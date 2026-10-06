// A lazy page's placeholder waits 300 ms before it is drawn, and is drawn on the design system's
// tokens, not inline styles.
//
// Shown the moment the navigation starts, it would be, on a slow machine, a «Loading...» frame
// between a blank page and the app; on a fast one, a flash for a chunk that arrives in 50 ms.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Never released: the chunk stays in flight for the whole file.
(globalThis as Record<string, unknown>).__lazyGate = new Promise<void>(() => {});

customElements.define('pdx-lp-home', class extends HTMLElement {});

(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-lp-home' },
    { path: '/lazy', tag: 'pdx-lazypage', lazy: true, file: '../tests/fixtures/lazy-page.ts' },
];

import { navigate } from '../src/runtime';
import '../src/outlet';

let placeholder: HTMLElement;

describe('the placeholder of a lazy page', () => {
    beforeAll(async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        history.replaceState(null, '', '/');
        document.body.appendChild(document.createElement('pdx-router-outlet'));
        await vi.advanceTimersByTimeAsync(0);
        navigate('/lazy');
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(0);
        placeholder = document.querySelector('pdx-router-outlet .pdx-route-loading')!;
    });

    afterAll(() => { vi.useRealTimers(); });

    it('is there, with its text, and no inline style', () => {
        expect(placeholder, 'no .pdx-route-loading in the outlet').not.toBeNull();
        expect(placeholder.textContent).toContain('Loading');
        expect(placeholder.getAttribute('style'), 'inline styles, not the design system').toBeNull();
        expect(placeholder.getAttribute('role')).toBe('status');
    });

    it('is not drawn before 300 ms', async () => {
        expect(placeholder.hidden, 'drawn the moment the navigation started').toBe(true);
        await vi.advanceTimersByTimeAsync(290);
        expect(placeholder.hidden).toBe(true);
    });

    it('and is drawn after them, the chunk still in flight', async () => {
        await vi.advanceTimersByTimeAsync(20);
        expect(placeholder.hidden).toBe(false);
    });

    it('its look is a stylesheet on the tokens', () => {
        const css = [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
        expect(css).toContain('.pdx-route-loading {');
        expect(css).toContain('var(--pdx-color-muted');
    });
});
