// A generated route's loaders run on the server before it renders (#239): the page is written with
// the data its loader returns, as the client shows it once the loader has answered. A loader that
// redirects or says not found leaves the route out, reported; one that fails stops the build.

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { html, component } from '@pdxui/core';
import { renderToString } from '@pdxui/core/server';

const calls: unknown[] = [];

(globalThis as Record<string, unknown>).__pdx_route_table = {
    routes: [
        {
            path: '/tickets/:id(number)', tag: 'sl-ticket',
            loader: async (ctx: { params: Record<string, unknown>; query: unknown; signal: AbortSignal }) => {
                calls.push(ctx);
                return { title: `Ticket ${ctx.params.id as number}` };
            },
        },
        { path: '/moved', tag: 'sl-ticket', loader: async () => { const { redirect } = await import('../src/active'); throw redirect('/tickets/1'); } },
        { path: '/gone', tag: 'sl-ticket', loader: async () => { const { notFound } = await import('../src/active'); throw notFound(); } },
        { path: '/broken', tag: 'sl-ticket', loader: async () => { throw new Error('the database is down'); } },
    ],
};

import { loaderData } from '../src/state';
import { serverRoute } from '../src/server';

beforeAll(() => {
    component('sl-ticket', {
        render: () => html`<h1>${() => (loaderData('/tickets/:id(number)') as { title?: string } | undefined)?.title ?? 'loading'}</h1>`,
    });
});

const app = () => html`<pdx-router-outlet></pdx-router-outlet>`;

describe('a route\'s loaders on the server', () => {
    it('run before the render, with the route\'s params coerced, so the page holds their data', async () => {
        expect(await serverRoute('/tickets/7')).toEqual({ path: '/tickets/7', route: '/tickets/:id(number)' });
        expect(calls).toHaveLength(1);
        const ctx = calls[0] as { params: Record<string, unknown>; query: Record<string, unknown>; signal: AbortSignal };
        expect(ctx.params).toEqual({ id: 7 });
        expect(ctx.query).toEqual({});
        expect(ctx.signal.aborted).toBe(false);
        expect(renderToString(app)).toContain('<h1><!--pdx-->Ticket 7<!--/pdx--></h1>');
    });

    it('a redirect() or a notFound() leaves the route out, and says which', async () => {
        expect(await serverRoute('/moved')).toEqual({ path: '/moved', route: null, skipped: 'loader-redirect' });
        expect(await serverRoute('/gone')).toEqual({ path: '/gone', route: null, skipped: 'loader-not-found' });
    });

    it('a loader that fails stops the build, naming the route and the error', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(serverRoute('/broken')).rejects.toThrow(/\/broken.*the database is down/);
        error.mockRestore();
    });
});
