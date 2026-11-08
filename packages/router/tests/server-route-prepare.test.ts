// A route prepared on the server before it renders (#160, part 6b-2): what a navigation runs before
// a page appears — the app's `onBeforeNavigate` hooks, awaited, and the route's guards — runs for the
// path a build generates, so the page is written with what it would have in the browser.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { html, component, setPermissions } from '@pdxui/core';
import { renderToString } from '@pdxui/core/server';

(globalThis as Record<string, unknown>).__pdx_route_table = {
    routes: [
        { path: '/', tag: 'sp-home' },
        { path: '/account', tag: 'sp-account', guard: 'account.view' },
        { path: '/private', tag: 'sp-home' },
    ],
};

import { onBeforeNavigate } from '../src/active';
import { serverRoute } from '../src/server';

let strings: Record<string, string> = {};

beforeAll(() => {
    component('sp-home', { render: () => html`<h1>${strings.title ?? ''}</h1>` });
    component('sp-account', { render: () => html`<h1>Account</h1>` });
});

const app = () => html`<pdx-router-outlet></pdx-router-outlet>`;
const off: (() => void)[] = [];

afterEach(() => {
    off.splice(0).forEach((f) => f());
    setPermissions([]);
    strings = {};
});

describe('a route prepared on the server', () => {
    it('awaits the app\'s before-navigation hooks, so the page renders with what they load', async () => {
        const seen: unknown[] = [];
        off.push(onBeforeNavigate(async (from, to, hop) => {
            seen.push([from, to, hop]);
            await new Promise((r) => setTimeout(r, 5));
            strings = { title: 'Welcome' };
            return true;
        }));
        expect(await serverRoute('/')).toEqual({ path: '/', route: '/', data: [] });
        expect(seen).toEqual([['', '/', { redirected: false }]]);
        expect(renderToString(app)).toContain('<h1><!--pdx-->Welcome<!--/pdx--></h1>');
    });

    it('renders nothing for a path a hook refuses, and says so', async () => {
        off.push(onBeforeNavigate((_from, to) => to !== '/private'));
        expect(await serverRoute('/private')).toEqual({ path: '/private', route: null, skipped: 'refused' });
        expect(renderToString(app)).toBe('<pdx-router-outlet></pdx-router-outlet>');
    });

    it('asks a guard the permissions the app has set, as the outlet does in the browser', async () => {
        expect(await serverRoute('/account')).toEqual({ path: '/account', route: null, skipped: 'guard' });
        expect(renderToString(app)).toBe('<pdx-router-outlet></pdx-router-outlet>');

        setPermissions(['account.view']);
        expect(await serverRoute('/account')).toEqual({ path: '/account', route: '/account', data: [] });
        expect(renderToString(app)).toContain('<h1>Account</h1>');
    });
});
