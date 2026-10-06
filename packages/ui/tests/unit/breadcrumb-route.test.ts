// `<pdx-breadcrumb>` with no `items`: the trail the router published.
//
// The prop is authoritative when it is passed. Given nothing, the component renders the router's
// trail rather than an empty nav: otherwise every page writes the array by hand, and the copy goes
// stale the day a route is renamed.
//
// The trail comes from core's registry (`routeTrail`), which the router fills. This file sets it
// directly, because the component's side of the contract is "read the registry", and pulling the
// router in here would test the router instead.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setRouteTrail, clearRouteTrail } from '@pdxui/core';
import '../../src/breadcrumb/pdx-breadcrumb';

const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

async function mount(attrs = ''): Promise<HTMLElement> {
    document.body.innerHTML = `<pdx-breadcrumb ${attrs}></pdx-breadcrumb>`;
    const el = document.body.querySelector('pdx-breadcrumb') as HTMLElement;
    await frame();
    await frame();
    return el;
}

const crumbTexts = (el: HTMLElement) =>
    [...el.querySelectorAll('.pdx-breadcrumb-item')].map(n => (n.textContent ?? '').trim());

beforeEach(() => clearRouteTrail());
afterEach(() => { document.body.innerHTML = ''; clearRouteTrail(); });

describe('a breadcrumb given no items', () => {
    it('renders the route trail', async () => {
        setRouteTrail([
            { label: 'Tickets', href: '/tickets', current: false },
            { label: 'Ticket 42', href: '/tickets/42', current: true },
        ]);

        const el = await mount();

        expect(crumbTexts(el)).toEqual(['Tickets', 'Ticket 42']);
    });

    it('links every crumb but the last one', async () => {
        setRouteTrail([
            { label: 'Tickets', href: '/tickets', current: false },
            { label: 'Ticket 42', href: '/tickets/42', current: true },
        ]);

        const el = await mount();

        const links = [...el.querySelectorAll('a')];
        expect(links.map(a => a.getAttribute('href'))).toEqual(['/tickets']);
        // The page you are on is not somewhere to go, and says so to a screen reader.
        expect(el.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('Ticket 42');
    });

    it('follows the next navigation without being told', async () => {
        setRouteTrail([{ label: 'Tickets', href: '/tickets', current: true }]);
        const el = await mount();
        expect(crumbTexts(el)).toEqual(['Tickets']);

        setRouteTrail([
            { label: 'Tickets', href: '/tickets', current: false },
            { label: 'Ticket 42', href: '/tickets/42', current: true },
        ]);
        await frame();
        await frame();

        // The whole point: a hand-written array would still say "Tickets".
        expect(crumbTexts(el)).toEqual(['Tickets', 'Ticket 42']);
    });

    it('renders nothing when there is no router and no items', async () => {
        const el = await mount();

        expect(crumbTexts(el)).toEqual([]);
    });
});

describe('a breadcrumb given items', () => {
    it('shows them, and ignores the trail', async () => {
        // The control, and the compatibility promise: an app that passes `items` is unaffected by
        // any of this, including one whose router publishes something different.
        setRouteTrail([{ label: 'From the router', href: '/r', current: true }]);

        document.body.innerHTML = '<pdx-breadcrumb></pdx-breadcrumb>';
        const el = document.body.querySelector('pdx-breadcrumb') as HTMLElement & { items: unknown };
        el.items = [
            { key: 'a', label: 'Written by hand', href: '/a' },
            { key: 'b', label: 'Still here' },
        ];
        await frame();
        await frame();

        expect(crumbTexts(el)).toEqual(['Written by hand', 'Still here']);
    });
});
