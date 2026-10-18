// Typed routes, the runtime half (#150): `navigate(pattern, params)` fills the pattern — a number
// param included — `navigate.url(url)` takes a concrete URL, and `<pdx-link :params>` points at the
// filled URL: its href, its click and its active state. The types are checked in
// packages/lsp/tests/typed-routes.test.ts, against a generated `.pdx/routes.d.ts`.

import { describe, it, expect, beforeAll } from 'vitest';
import { createRouter, navigate, destroyRouter, currentPath, currentParams, currentQuery } from '../src/runtime';
import '../src/link';

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeAll(() => {
    history.replaceState(null, '', '/');
    destroyRouter();
    createRouter([
        { path: '/', component: () => document.createElement('div') },
        { path: '/users/:id(number)', component: () => document.createElement('div') },
        { path: '/tickets', component: () => document.createElement('div') },
    ]);
});

describe('navigate()', () => {
    it('fills a pattern with a number param', async () => {
        navigate('/users/:id', { id: 42 });
        await tick();
        expect(currentPath()).toBe('/users/42');
        expect(currentParams()).toMatchObject({ id: '42' });
    });

    it('navigate.url() takes a concrete URL, query included', async () => {
        navigate.url('/tickets?status=open');
        await tick();
        expect(currentPath()).toBe('/tickets');
        expect(currentQuery()).toMatchObject({ status: 'open' });
    });

    it('navigate.url() refuses an external URL like navigate() does', async () => {
        navigate.url('/');
        await tick();
        navigate.url('https://example.com/x');
        await tick();
        expect(currentPath()).toBe('/');
    });
});

describe('<pdx-link :params>', () => {
    const make = (setup: (el: HTMLElement & { params?: unknown; to?: string }) => void) => {
        const el = document.createElement('pdx-link') as HTMLElement & { params?: unknown; to?: string };
        el.textContent = 'user';
        setup(el);
        document.body.appendChild(el);
        return el;
    };
    const href = (el: HTMLElement) => el.querySelector('a')!.getAttribute('href');

    it('points at the filled URL when the params are set as a property, before or after connecting', () => {
        const before = make((el) => { el.to = '/users/:id'; el.params = { id: 7 }; });
        expect(href(before)).toBe('/users/7');
        const after = make((el) => { el.to = '/users/:id'; });
        after.params = { id: 8 };
        expect(href(after), 'a :params binding written after connect did not reach the href').toBe('/users/8');
    });

    it('reads the params attribute as JSON too', () => {
        const el = make((e) => { e.setAttribute('to', '/users/:id'); e.setAttribute('params', '{"id":9}'); });
        expect(href(el)).toBe('/users/9');
    });

    it('a click navigates to the filled URL', async () => {
        const el = make((e) => { e.to = '/users/:id'; e.params = { id: 11 }; });
        el.querySelector('a')!.click();
        await tick();
        expect(currentPath()).toBe('/users/11');
    });

    it('is active on the filled URL, not on the pattern', async () => {
        const el = make((e) => { e.to = '/users/:id'; e.params = { id: 12 }; e.setAttribute('active-class', 'on'); });
        navigate('/users/:id', { id: 12 });
        await tick();
        expect(el.classList.contains('on')).toBe(true);
        navigate('/users/:id', { id: 13 });
        await tick();
        expect(el.classList.contains('on')).toBe(false);
    });
});
