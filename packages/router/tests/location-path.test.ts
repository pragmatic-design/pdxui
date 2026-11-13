// The router names its path as core's current location (#1023).
//
// `<pdx-app-shell>` reads `locationPath()` from core, because `@pdxui/ui` must not depend on the
// router. Loading the router is what connects the two: from then on core's path is the router's, so
// a navigation by `navigate()` — a `history.pushState`, which fires no event — reaches the shell.

import { describe, it, expect, beforeAll } from 'vitest';

customElements.define('pdx-lp-home', class extends HTMLElement {});
customElements.define('pdx-lp-tickets', class extends HTMLElement {});
(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-lp-home' },
    { path: '/tickets/:id', tag: 'pdx-lp-tickets' },
];

import { navigate } from '../src/runtime';
import { currentPath } from '../src/state';
import { locationPath, navigateTo, effect } from '@pdxui/core';
import '../src/outlet';

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeAll(async () => {
    history.replaceState(null, '', '/');
    document.body.appendChild(document.createElement('pdx-router-outlet'));
    await tick();
});

describe('core\'s location path, under the router', () => {
    it('is the router\'s path after a navigation, which fires no popstate', async () => {
        navigate('/tickets/42');
        await tick();
        expect(currentPath()).toBe('/tickets/42');
        expect(locationPath()).toBe('/tickets/42');
    });

    it('a reader re-runs on each navigation', async () => {
        const seen: string[] = [];
        const stop = effect(() => { seen.push(locationPath()); });
        navigate('/');
        await tick();
        navigate('/tickets/7');
        await tick();
        expect(seen).toEqual(['/tickets/42', '/', '/tickets/7']);
        stop();
    });

    it('navigateTo goes through the router: no page load, the path follows', async () => {
        expect(navigateTo('/tickets/9')).toBe(true);
        await tick();
        expect(currentPath()).toBe('/tickets/9');
        expect(locationPath()).toBe('/tickets/9');
    });
});
