// Router R1 — AX: focus management + announcement on navigation, 404 semantics.
// Runs in its own file so the outlet's one-shot autoInitRouter sees our routes
// (vitest isolates module state per test file).

import { describe, it, expect, beforeAll } from 'vitest';

// Register routes BEFORE the outlet connects (autoInitRouter reads these on connect).
(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-axpage' },
    { path: '/two', tag: 'pdx-axpage' },
];

class AxPage extends HTMLElement {}
customElements.define('pdx-axpage', AxPage);

import { navigate } from '../src/runtime';
import '../src/outlet'; // registers <pdx-router-outlet>

const tick = () => new Promise(r => setTimeout(r, 0));

describe('router R1 — AX', () => {
    beforeAll(async () => {
        history.replaceState(null, '', '/');
        const outlet = document.createElement('pdx-router-outlet');
        document.body.appendChild(outlet); // connect → autoInitRouter + initial render
        await tick();
    });

    it('moves focus to the new page on navigation', async () => {
        navigate('/two');
        await tick();
        const active = document.activeElement;
        expect(active).toBeInstanceOf(AxPage);
        expect((active as HTMLElement).getAttribute('tabindex')).toBe('-1');
    });

    it('announces the navigation via an aria-live region', async () => {
        navigate('/');
        await tick();
        await Promise.resolve(); // flush the announce microtask
        const live = document.querySelector('[aria-live]');
        expect(live).toBeTruthy();
        expect((live as HTMLElement).textContent).toBeTruthy();
    });

    it('renders a 404 with role="alert" and focuses it', async () => {
        navigate('/does-not-exist');
        await tick();
        const alert = document.querySelector('[role="alert"]');
        expect(alert).toBeTruthy();
        expect((alert as HTMLElement).getAttribute('aria-label')).toBe('Page not found');
        expect(document.activeElement).toBe(alert);
    });
});
