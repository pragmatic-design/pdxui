// The `actions` slot is BESIDE the entry's link, never inside it.
//
// The `item` slot is the link's content: a pin button and an «open in a new tab» link put there make
// every rail entry an <a> holding a <button> and another <a>. The HTML content model forbids
// interactive content in a link (axe: nested-interactive), and a screen reader folds the buttons'
// names into the link's. The actions have a slot of their own, in a row with the link.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/nav-menu/pdx-nav-menu';

type Scope = { item: { key: string; label: string } };

function carrier(name: string, draw: (scope: Scope) => Node): HTMLTemplateElement {
    // What compiled parent code hands a component for `<slot name="…" let:item>`.
    const t = document.createElement('template') as HTMLTemplateElement & {
        __pdxSlot?: (scope: Scope) => Node;
        __pdxSlotName?: string;
    };
    t.__pdxSlotName = name;
    t.__pdxSlot = draw;
    return t;
}

async function mount(withActions: boolean): Promise<HTMLElement> {
    const el = document.createElement('pdx-nav-menu');
    (el as any).items = [
        { key: 'home', label: 'Home', href: '/' },
        { key: 'tickets', label: 'Tickets', href: '/tickets' },
    ];
    el.appendChild(carrier('item', ({ item }) => {
        const span = document.createElement('span');
        span.className = 'pdx-nav-label';
        span.textContent = item.label;
        return span;
    }));
    if (withActions) {
        el.appendChild(carrier('actions', ({ item }) => {
            const tools = document.createElement('span');
            tools.className = 'tools';
            const pin = document.createElement('button');
            pin.type = 'button';
            pin.setAttribute('aria-label', `Pin ${item.label}`);
            const out = document.createElement('a');
            out.href = '#';
            out.textContent = '↗';
            tools.append(pin, out);
            return tools;
        }));
    }
    document.body.appendChild(el);
    await tick(50);
    return el;
}

describe('pdx-nav-menu actions slot', () => {
    beforeEach(cleanup);

    it('no entry link holds a button, a link or an input', async () => {
        const el = await mount(true);
        const links = [...el.querySelectorAll('a.pdx-nav-item')];
        expect(links, 'the premise: the entries are links').toHaveLength(2);
        for (const a of links) expect(a.querySelectorAll('button, a, input'), a.getAttribute('data-nav-key')!).toHaveLength(0);
    });

    it('the actions are the link\'s next sibling, in one row with it', async () => {
        const el = await mount(true);
        const link = el.querySelector('a.pdx-nav-item[data-nav-key="home"]')!;
        const row = link.parentElement!;
        expect(row.classList.contains('pdx-nav-row')).toBe(true);
        const actions = link.nextElementSibling!;
        expect(actions.classList.contains('pdx-nav-actions')).toBe(true);
        expect(actions.querySelector('button[aria-label="Pin Home"]')).not.toBeNull();
    });

    it('the arrows still move between the links, and skip the actions', async () => {
        const el = await mount(true);
        const home = el.querySelector<HTMLElement>('a.pdx-nav-item[data-nav-key="home"]')!;
        home.focus();
        home.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(document.activeElement?.getAttribute('data-nav-key')).toBe('tickets');
    });

    it('control — without an actions slot, an entry is drawn as before: no row around it', async () => {
        const el = await mount(false);
        const link = el.querySelector('a.pdx-nav-item[data-nav-key="home"]')!;
        expect(link.parentElement!.classList.contains('pdx-nav-row')).toBe(false);
        expect(el.querySelector('.pdx-nav-actions')).toBeNull();
    });
});
