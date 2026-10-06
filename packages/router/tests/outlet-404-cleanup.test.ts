// Router — the error page is a page like any other: it REPLACES what is showing.
//
// Seen live on pdxui.com: landing on an unknown URL rendered the 404 block twice, and
// every later navigation kept both of them stacked above the real page. `_showErrorPage`
// appended without clearing, and the single `activeElement` slot could only ever reclaim
// the last one it wrote.

import { describe, it, expect, beforeAll } from 'vitest';

// Registered BEFORE the outlet connects — autoInitRouter reads these on connect.
(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-cleanuppage' },
];

class CleanupPage extends HTMLElement {}
customElements.define('pdx-cleanuppage', CleanupPage);

import { navigate } from '../src/runtime';
import '../src/outlet'; // registers <pdx-router-outlet>

const tick = () => new Promise(r => setTimeout(r, 0));
const errorPages = () => document.querySelectorAll('[role="alert"][aria-label="Page not found"]');

describe('router — error page cleanup', () => {
    beforeAll(async () => {
        history.replaceState(null, '', '/');
        document.body.appendChild(document.createElement('pdx-router-outlet'));
        await tick();
    });

    it('renders exactly one 404, however many unmatched navigations happen', async () => {
        navigate('/nope');
        await tick();
        expect(errorPages().length).toBe(1);

        navigate('/nope-either');
        await tick();
        expect(errorPages().length).toBe(1);
    });

    it('removes the 404 when a real route follows it', async () => {
        navigate('/nope');
        await tick();
        expect(errorPages().length).toBe(1);

        navigate('/');
        await tick();
        expect(errorPages().length).toBe(0);
        expect(document.querySelector('pdx-cleanuppage')).toBeTruthy();
    });
});
