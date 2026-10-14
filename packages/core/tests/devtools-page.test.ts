// `__PDX_DEVTOOLS__.page()` (#271): the page card, read from the routed element and its ARIA.

import { describe, it, expect, afterEach } from 'vitest';
import { pageCard, routeRoot } from '../src/debug/page-card';

const roots: HTMLElement[] = [];
afterEach(() => { for (const r of roots.splice(0)) r.remove(); document.title = ''; });

function routed(html: string): HTMLElement {
    const root = document.createElement('x-page');
    root.setAttribute('data-pdx-route', '');
    root.innerHTML = html;
    document.body.appendChild(root);
    roots.push(root);
    return root;
}

describe('the page card', () => {
    it('describes the routed element, not the shell around it', () => {
        const shell = document.createElement('nav');
        shell.innerHTML = '<button>Shell action</button>';
        document.body.appendChild(shell);
        roots.push(shell);
        const root = routed('<button>Save</button>');
        expect(routeRoot()).toBe(root);
        const card = pageCard(null, []);
        expect(card.actions).toEqual(['Save']);
    });

    it('a form lists its fields, the required ones and the invalid ones', () => {
        routed(`<form aria-label="Intake">
            <input name="requester" aria-required="true">
            <input name="email" required>
            <input name="notes">
            <input name="phone" aria-invalid="true">
        </form>`);
        const [form] = pageCard(null, []).forms!;
        expect(form).toEqual({
            name: 'Intake', fields: ['requester', 'email', 'notes', 'phone'],
            required: ['requester', 'email'], invalid: ['phone'], valid: false,
        });
    });

    it('a list of data says how many rows it shows; its row buttons are row actions', () => {
        const rows = Array.from({ length: 3 }, (_, i) => `<li data-pdx-item>Row ${i} <button>Open</button></li>`).join('');
        routed(`<ul aria-label="Customers">${rows}</ul><button>New customer</button>`);
        const card = pageCard(null, []);
        expect(card.lists).toEqual([{ name: 'Customers', shown: 3 }]);
        expect(card.actions).toEqual(['New customer']);
        expect(card.rowActions).toEqual(['Open']);
    });

    it('a grid\'s total counts its data, not its header rows', () => {
        // `aria-rowcount` counts every row of the grid — the header row and a row of filters
        // included — so the 24 customers of the showcase read as 26 in the customer picker.
        const items = Array.from({ length: 3 }, (_, i) => `<div role="row" data-pdx-item><div role="gridcell">C-${i}</div></div>`).join('');
        routed(`<div role="grid" aria-label="Customers" aria-rowcount="26">
            <div role="row"><div role="columnheader">Customer</div></div>
            <div role="row"><div role="gridcell"><input aria-label="Filter Customer"></div></div>
            <div role="rowgroup">${items}</div>
        </div>`);
        expect(pageCard(null, []).lists).toEqual([{ name: 'Customers', shown: 3, total: 24 }]);
    });

    it('the route, the title, the links and the errors; empty members are left out', () => {
        document.title = 'Tickets';
        routed('<a href="/tickets/new">New</a><a href="https://example.com">Out</a>');
        const card = pageCard({ path: '/tickets', matched: '/tickets' }, ['boom']);
        expect(card).toEqual({
            route: { path: '/tickets', matched: '/tickets' }, title: 'Tickets',
            links: ['/tickets/new'], errors: ['boom'],
        });
    });

    it('a hidden control is no action', () => {
        routed('<button hidden>Ghost</button><button disabled>Off</button><button>On</button>');
        expect(pageCard(null, []).actions).toEqual(['On']);
    });
});
