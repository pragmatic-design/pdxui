// The outlet rendered to a string for a URL (#160, part 5a): the tree the browser's outlet builds —
// layouts, each with the host its page goes into, then the page with its params — with the outlet
// marked by the route it rendered. A route the server cannot answer for renders nothing, and says why.

import { describe, it, expect, beforeAll } from 'vitest';
import { html, component, prop } from '@pdxui/core';
import { renderToString } from '@pdxui/core/server';

(globalThis as Record<string, unknown>).__pdx_route_table = {
    routes: [
        { path: '/', tag: 'sr-home', layouts: ['sr-shell'] },
        { path: '/admin/users', tag: 'sr-users', layouts: ['sr-shell', 'sr-admin'] },
        { path: '/owners/:id', tag: 'sr-owner', hasOutlet: true },
        { path: '/owners/:id/pets', tag: 'sr-pets' },
        { path: '/secret', tag: 'sr-home', guard: 'admin' },
        { path: '/old', tag: 'sr-home', redirect: '/' },
    ],
    pageModules: {},
};

import { serverRoute } from '../src/server';

beforeAll(() => {
    component('sr-shell', { render: () => html`<header>Shell</header><main><slot></slot></main>` });
    component('sr-admin', { render: () => html`<nav>Admin</nav><slot></slot>` });
    component('sr-home', { render: () => html`<h1>Home</h1>` });
    component('sr-users', { render: () => html`<h1>Users</h1>` });
    component('sr-owner', {
        props: { id: prop('') },
        render: (ctx) => html`<h1>${ctx.id}</h1><pdx-router-outlet></pdx-router-outlet>`,
    });
    component('sr-pets', { props: { id: prop('') }, render: (ctx) => html`<p>pets of ${ctx.id}</p>` });
});

const app = () => html`<pdx-router-outlet></pdx-router-outlet>`;

describe('the outlet on the server', () => {
    it('writes the layout chain with its hosts, and the page inside the innermost one', () => {
        expect(serverRoute('/admin/users')).toEqual({ path: '/admin/users', route: '/admin/users' });
        const markup = renderToString(app);
        expect(markup).toMatch(/^<pdx-router-outlet data-pdx-ssg="\/admin\/users" style="display: block;"><sr-shell style="display: contents;"/);
        expect(markup).toContain('<header>Shell</header>');
        expect(markup).toMatch(/<sr-admin style="display: contents;"[^>]*>/);
        expect(markup).toMatch(/<div data-pdx-layout-host="sr-shell" style="display: contents;"><sr-admin/);
        expect(markup).toMatch(/<div data-pdx-layout-host="sr-admin" style="display: contents;"><sr-users data-pdx-route=""[^>]*><h1>Users<\/h1><\/sr-users><\/div>/);
        expect(markup.indexOf('<nav>Admin</nav>'), 'the inner layout rendered outside the outer one')
            .toBeGreaterThan(markup.indexOf('<header>Shell</header>'));
    });

    it('gives the page its params as attributes, and an outlet inside it the next level', () => {
        expect(serverRoute('/owners/7/pets')).toEqual({ path: '/owners/7/pets', route: '/owners/:id/pets' });
        const markup = renderToString(app);
        expect(markup).toMatch(/^<pdx-router-outlet data-pdx-ssg="\/owners\/:id" style="display: block;"><sr-owner data-pdx-route="" id="7"/);
        expect(markup).toMatch(/<pdx-router-outlet data-pdx-ssg="\/owners\/:id\/pets" style="display: block;"><sr-pets data-pdx-route="" id="7"[^>]*><p>pets of <!--pdx-->7<!--\/pdx--><\/p><\/sr-pets><\/pdx-router-outlet>/);
    });

    it('leaves the nested outlet empty when the path ends at the parent', () => {
        serverRoute('/owners/7');
        const markup = renderToString(app);
        expect(markup).toContain('<h1><!--pdx-->7<!--/pdx--></h1><pdx-router-outlet></pdx-router-outlet>');
    });

    it('renders nothing for a path it cannot answer for, and says why', () => {
        expect(serverRoute('/nowhere')).toEqual({ path: '/nowhere', route: null, skipped: 'not-found' });
        expect(renderToString(app)).toBe('<pdx-router-outlet></pdx-router-outlet>');
        expect(serverRoute('/secret')).toEqual({ path: '/secret', route: null, skipped: 'guard' });
        expect(renderToString(app)).toBe('<pdx-router-outlet></pdx-router-outlet>');
        expect(serverRoute('/old')).toEqual({ path: '/old', route: null, skipped: 'redirect' });
        expect(renderToString(app)).toBe('<pdx-router-outlet></pdx-router-outlet>');
    });

    it('leaves a named outlet to the browser', () => {
        serverRoute('/');
        expect(renderToString(() => html`<pdx-router-outlet name="side"></pdx-router-outlet>`))
            .toBe('<pdx-router-outlet name="side"></pdx-router-outlet>');
    });
});
