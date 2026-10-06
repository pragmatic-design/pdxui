// A row's own actions live behind ONE control, not in a row of buttons.
//
// `actions()` renders a button per action, which is right for one or two and wrong for five: at
// 390px a row of four icon buttons is the whole width of the phone. `rowMenu()` is the other shape
// — a single trigger that opens the grid's menu — and it carries the two things a row menu needs
// and a row of buttons cannot express:
//
//  · a LINK. "Open in a new tab" that calls `window.open` is not a link: it cannot be
//    middle-clicked, cannot be copied, and a screen reader announces a button. `href` makes the
//    item an <a>, and the URL goes through `sanitizeUrl` like every other href the grid builds.
//  · a REFUSAL. A permission the caller lacks leaves the item on screen, marked `aria-disabled`
//    with the reason reachable — the shape `pdx-bulk-actions` uses, for the same reason: an action that merely vanishes is indistinguishable from one nobody wrote.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import { renderCellNode } from '../../src/data-grid/grid-cell';
import { rowMenu } from '@pdxui/core';
import '../../src/data-grid/pdx-data-grid';

const ROW = { id: 7, reference: 'T-007', subject: 'Printer jam' };

const col = (cell: unknown) => ({ def: { cell, field: 'rowMenu' }, type: 'string' } as never);
const menu = () => document.querySelector<HTMLElement>('[role="menu"]');
const items = () => [...(menu()?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
const key = (target: Element, k: string) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

/** Render the cell into the document — the menu anchors to a button that has to be connected. */
function mountCell(cell: unknown): HTMLButtonElement {
    const host = document.createElement('div');
    host.appendChild(renderCellNode(null, col(cell), ROW));
    document.body.appendChild(host);
    return host.querySelector('button')!;
}

beforeEach(cleanup);

describe('rowMenu — one control per row', () => {
    it('renders ONE trigger, named after its row, that says it opens a menu', () => {
        const btn = mountCell(rowMenu({
            label: (row) => `Actions for ${row.reference}`,
            items: [
                { key: 'duplicate', label: 'Duplicate', onSelect: () => {} },
                { key: 'print', label: 'Print', onSelect: () => {} },
                { key: 'export', label: 'Export', onSelect: () => {} },
            ],
        }));
        // Three actions, ONE button: that is the whole difference from `actions()`.
        expect(btn.parentElement!.querySelectorAll('button')).toHaveLength(1);
        expect(btn.getAttribute('aria-haspopup')).toBe('menu');
        expect(btn.getAttribute('aria-expanded')).toBe('false');
        expect(btn.getAttribute('aria-label')).toBe('Actions for T-007');
    });

    it('opens on click with an item per action, and each one receives its row', () => {
        let picked: unknown = null;
        const btn = mountCell(rowMenu({
            items: [
                { key: 'duplicate', label: (row) => `Duplicate ${row.reference}`, onSelect: (row) => { picked = row; } },
                { key: 'print', label: 'Print', onSelect: () => {} },
            ],
        }));
        btn.click();
        expect(menu(), 'no role="menu" opened').not.toBeNull();
        expect(btn.getAttribute('aria-expanded')).toBe('true');
        expect(items().map(i => i.textContent)).toEqual(['Duplicate T-007', 'Print']);

        items()[0].click();
        expect(picked).toBe(ROW);
        expect(menu(), 'the menu stayed open after a pick').toBeNull();
    });

    it('an item with href is an ANCHOR, so it can be middle-clicked and copied', () => {
        const btn = mountCell(rowMenu({
            items: [
                { key: 'open', label: 'Open in a new tab', href: (row) => `/tickets/${row.id}`, target: '_blank' },
                { key: 'print', label: 'Print', onSelect: () => {} },
            ],
        }));
        btn.click();
        const link = items()[0] as HTMLAnchorElement;
        expect(link.tagName, 'a navigation item rendered as something other than a link').toBe('A');
        expect(link.getAttribute('href')).toBe('/tickets/7');
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener');
        // The item that acts is still not a link: the distinction is what a keyboard goes by.
        expect(items()[1].tagName).not.toBe('A');
    });

    it('a javascript: href coming back from a server does not become a link that runs it', () => {
        const btn = mountCell(rowMenu({
            items: [{ key: 'open', label: 'Open', href: () => 'javascript:alert(1)' }],
        }));
        btn.click();
        expect((items()[0] as HTMLAnchorElement).getAttribute('href')).not.toContain('javascript:');
    });

    it('a denied action stays on screen, marked, with its reason reachable — and refuses', () => {
        let ran = false;
        const btn = mountCell(rowMenu({
            items: [{
                key: 'delete', label: 'Delete', disabled: true,
                disabledReason: 'Only an administrator may delete a ticket',
                onSelect: () => { ran = true; },
            }],
        }));
        btn.click();
        const item = items()[0];
        expect(item, 'the denied action was withheld instead of refused').toBeTruthy();
        // aria-disabled, not `disabled`: a disabled control leaves the tab order, and the reason
        // attached to it goes with it (pdx-bulk-actions.ts:44).
        expect(item.getAttribute('aria-disabled')).toBe('true');
        expect((item as HTMLButtonElement).disabled).toBeFalsy();
        const why = document.getElementById(item.getAttribute('aria-describedby') ?? '');
        expect(why?.textContent).toBe('Only an administrator may delete a ticket');

        item.click();
        expect(ran, 'the mark was decorative: the click ran anyway').toBe(false);
        expect(menu(), 'a refused pick closed the menu').not.toBeNull();
    });

    it('`disabled` can be decided per row', () => {
        const spec = rowMenu({ items: [{ key: 'close', label: 'Close', disabled: (row) => row.id === 7, onSelect: () => {} }] });
        mountCell(spec).click();
        expect(items()[0].getAttribute('aria-disabled')).toBe('true');
        cleanup();

        const host = document.createElement('div');
        host.appendChild(renderCellNode(null, col(spec), { id: 8, reference: 'T-008' }));
        document.body.appendChild(host);
        host.querySelector('button')!.click();
        expect(items()[0].getAttribute('aria-disabled')).toBeNull();
    });

    it('the keyboard opens it, walks it, and Escape gives the focus back to the trigger', () => {
        const btn = mountCell(rowMenu({
            items: [
                { key: 'a', label: 'Duplicate', onSelect: () => {} },
                { key: 'b', label: 'Print', onSelect: () => {} },
            ],
        }));
        btn.focus();
        btn.click();   // a native button's Enter and Space ARE its click
        expect(document.activeElement).toBe(items()[0]);
        key(document.activeElement!, 'ArrowDown');
        expect(document.activeElement).toBe(items()[1]);
        key(document.activeElement!, 'Escape');
        expect(menu()).toBeNull();
        expect(document.activeElement, 'Escape left the focus in a menu that is gone').toBe(btn);
    });

    it('the trigger does not select the row it sits in', async () => {
        const el = document.createElement('pdx-data-grid') as HTMLElement & Record<string, unknown>;
        el.columns = [
            { field: 'reference', header: 'Ref' },
            { field: 'rowMenu', header: '', command: true,
              cell: rowMenu({ items: [{ key: 'print', label: 'Print', onSelect: () => {} }] }) },
        ];
        el.data = [ROW];
        el.selection = 'multiple';
        document.body.appendChild(el);
        await tick(40);
        await tick(20);

        const trigger = el.querySelector<HTMLButtonElement>('[role="row"] [aria-haspopup="menu"]')!;
        expect(trigger, 'no row menu rendered inside the grid').toBeTruthy();
        trigger.click();
        expect(el.querySelector('[role="row"][aria-selected="true"]'), 'opening the menu selected the row').toBeNull();
    });
});
