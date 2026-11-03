// The `item` snippet draws EVERY entry, a group's included.
//
// A snippet that draws the leaves only leaves an entry with children on the default content — the
// `icon` field and the label — whatever the app has put in it. An app that draws its own icons
// (the showcase's rail uses glyphs, so its first paint carries no icon set) gets a group that,
// collapsed to icons, shows a chevron and nothing else. The snippet's `expanded` argument is a
// group's state.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/nav-menu/pdx-nav-menu';

type Item = { key: string; label: string };

async function mount(items: unknown[], collapsed = false): Promise<HTMLElement> {
    const el = document.createElement('pdx-nav-menu');
    (el as any).items = items;
    (el as any).collapsed = collapsed;
    // What a parent's `@snippet item(item, level, expanded)` compiles to: the element's property.
    (el as any).item = (item: Item, _level: number, expanded: boolean) => {
        const span = document.createElement('span');
        span.className = 'mine';
        span.textContent = `${item.label}${expanded ? ' (open)' : ''}`;
        return span;
    };
    document.body.appendChild(el);
    await tick(50);
    return el;
}

const ITEMS = [
    { key: 'home', label: 'Home', href: '/' },
    { key: 'customers', label: 'Customers', expanded: true, children: [{ key: 'list', label: 'List', href: '/customers' }] },
];

describe('pdx-nav-menu item snippet', () => {
    beforeEach(cleanup);

    it('draws a group entry, with its expanded state as an argument', async () => {
        const el = await mount(ITEMS);
        const group = el.querySelector('[data-nav-key="customers"]')!;
        expect(group.querySelector('.mine')?.textContent).toBe('Customers (open)');
        // The component's own content is not drawn beside the app's.
        expect(group.querySelector('.pdx-nav-label')).toBeNull();
        // The chevron is the component's, and stays.
        expect(group.querySelector('.pdx-nav-chevron')).not.toBeNull();
    });

    it('draws a group entry of a collapsed menu too', async () => {
        const el = await mount(ITEMS, true);
        expect(el.querySelector('[data-nav-key="customers"] .mine')).not.toBeNull();
    });

    it('control — a leaf is drawn by the snippet, as it was', async () => {
        const el = await mount(ITEMS);
        expect(el.querySelector('[data-nav-key="home"] .mine')?.textContent).toBe('Home');
        expect(el.querySelector('[data-nav-key="list"] .mine')?.textContent).toBe('List');
    });
});
