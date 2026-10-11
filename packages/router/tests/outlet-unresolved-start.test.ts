// Until the first navigation has resolved, the outlet shows nothing — not a 404.
//
// The outlet starts the router from a microtask and then reads `currentRoute()`. The first
// navigation awaits the app's `onBeforeNavigate` hooks, and an app's hook is often async (the
// showcase fetches the route's strings in one), so at that moment the route can still be null. Read
// as a 404, that null drew an error page and focused it — and focusing the root outlet's first screen
// is what lets the start-up splash go: a cold load faded the splash onto an empty shell while the
// page's chunk was still in flight. The splash itself is measured in a browser, by the showcase's
// `splash.spec.ts`; core's splash state is the page's and this suite's setup has already settled it.
//
// A null route with no navigation error is "not resolved yet": a 404 sets '404', a refusal '403'.

import { describe, it, expect, beforeAll } from 'vitest';
import { setPermissions } from '@pdxui/core';

customElements.define('pdx-us-home', class extends HTMLElement {});

(globalThis as Record<string, unknown>).__pdx_routes = [{ path: '/', tag: 'pdx-us-home' }];

import { onBeforeNavigate } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise((r) => setTimeout(r, 0));

let release!: () => void;
const gate = new Promise<void>((r) => { release = r; });

let outlet: HTMLElement;

beforeAll(async () => {
    setPermissions([]);
    history.replaceState(null, '', '/');
    // The app's hook, as the showcase writes it: the navigation waits for something to arrive.
    onBeforeNavigate(async () => { await gate; return true; });

    outlet = document.createElement('pdx-router-outlet');
    document.body.appendChild(outlet);
    await tick();
    await tick();
});

describe('an outlet whose first navigation has not resolved yet', () => {
    it('draws no error page for the route it does not have yet', () => {
        expect(outlet.querySelector('[role="alert"]'), 'a 404 for a navigation still in progress').toBeNull();
        expect(outlet.textContent ?? '').not.toContain('404');
    });

    it('moves no focus — there is no first screen yet', () => {
        expect(outlet.querySelector('[tabindex="-1"]'), 'something was focused as the first screen').toBeNull();
    });

    it('renders the page once the navigation resolves', async () => {
        release();
        await tick();
        await tick();
        expect(outlet.querySelector('pdx-us-home'), 'the page never arrived').not.toBeNull();
        expect(outlet.querySelector('[role="alert"]'), 'control: no error page on the way').toBeNull();
    });
});
