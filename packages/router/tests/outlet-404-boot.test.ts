// Router — boot order: a null route before the route table exists is NOT a 404.
//
// Seen live on pdxui.com: a hard load of an unknown URL painted the "404 — Page not
// found" block TWICE, one above the other, and both survived every later navigation.
//
// The outlet's effect runs synchronously inside connectedCallback, while the route table
// is registered one microtask later (autoInitRouter). So the first run always saw
// `currentRoute() === null` — "not resolved yet", which it rendered as "no such page" —
// and the run that followed the table's arrival appended a second one on top, because
// the error page appended instead of replacing.
//
// This file locks the boot sequence; outlet-404-cleanup.test.ts locks the replacement.

import { describe, it, expect } from 'vitest';

// Registered BEFORE the outlet connects, exactly as a compiled app does it.
(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-bootpage' },
];

class BootPage extends HTMLElement {}
customElements.define('pdx-bootpage', BootPage);

import '../src/outlet'; // registers <pdx-router-outlet>

const tick = () => new Promise(r => setTimeout(r, 0));
const errorPages = () => document.querySelectorAll('[role="alert"][aria-label="Page not found"]');

describe('router — 404 on a hard load', () => {
    it('renders exactly one 404 when the landing URL matches no route', async () => {
        history.replaceState(null, '', '/no-such-page');
        document.body.appendChild(document.createElement('pdx-router-outlet'));
        await tick();
        await tick();

        expect(errorPages().length).toBe(1);
    });
});
