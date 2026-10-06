// An item's `data` becomes `data-*` attributes on its entry.
//
// A menu drawn from data leaves an app nothing to hang its own hooks on: a test's `data-test`, an
// analytics id. The showcase's rail marks every entry `data-test="to-…"`, and eight suites click
// through them. Only `data-*`,
// and only a key that makes a valid attribute name: an item is data, and data must not be able to
// write an `href` or an event handler onto the element.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/nav-menu/pdx-nav-menu';

async function mount(items: unknown[]): Promise<HTMLElement> {
    const el = document.createElement('pdx-nav-menu');
    (el as any).items = items;
    document.body.appendChild(el);
    await tick(50);
    return el;
}

describe('NavMenuItem.data', () => {
    beforeEach(cleanup);

    it('writes data-* attributes on a link entry and on a group entry', async () => {
        const el = await mount([
            { key: 'tickets', label: 'Tickets', href: '/tickets', data: { test: 'to-tickets', track: 'nav' } },
            { key: 'customers', label: 'Customers', data: { test: 'to-customers-group' }, children: [{ key: 'list', label: 'List' }] },
        ]);
        const link = el.querySelector('[data-nav-key="tickets"]')!;
        expect(link.getAttribute('data-test')).toBe('to-tickets');
        expect(link.getAttribute('data-track')).toBe('nav');
        expect(el.querySelector('[data-nav-key="customers"]')!.getAttribute('data-test')).toBe('to-customers-group');
    });

    it('control — a key that is not a valid data name writes nothing, and nothing but data-*', async () => {
        const el = await mount([
            { key: 'x', label: 'X', href: '/x', data: { 'on click': 'bad', 'Test': 'upper', '"><img': 'bad' } },
        ]);
        const link = el.querySelector('[data-nav-key="x"]')!;
        // The menu's own attributes are not the item's data: its key, and its level.
        const own = new Set(['data-nav-key', 'data-level']);
        const written = [...link.attributes].map(a => a.name).filter(n => n.startsWith('data-') && !own.has(n));
        expect(written).toEqual([]);
        expect(link.getAttribute('href')).toBe('/x');
    });
});
