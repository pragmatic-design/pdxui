// Typed cell renderers (B1) — renderCellNode builds DOM safely (never innerHTML of the value).

import { describe, it, expect } from 'vitest';
import { renderCellNode } from '../../src/data-grid/grid-cell';
import { status, link, currency, dateCell, booleanIcon, actions } from '@pdxui/core';

const col = (cell: unknown, type = 'string') => ({ def: { cell, field: 'x' }, type } as never);

describe('renderCellNode — typed cells', () => {
    it('status: leading dot + tone class + text', () => {
        const n = renderCellNode('Active', col(status({ tones: { Active: 'success' } })), {}) as HTMLElement;
        expect(n.className).toContain('pdx-dg-status-success');
        expect(n.querySelector('.pdx-dg-status-dot')).toBeTruthy();
        expect(n.textContent).toBe('Active');
    });

    it('link: anchor with derived href, target + rel, custom text', () => {
        const n = renderCellNode('u1', col(link({ href: (v) => '/users/' + v, target: '_blank', text: () => 'View' })), {}) as HTMLAnchorElement;
        expect(n.tagName).toBe('A');
        expect(n.getAttribute('href')).toBe('/users/u1');
        expect(n.target).toBe('_blank');
        expect(n.rel).toBe('noopener');
        expect(n.textContent).toBe('View');
    });

    it('currency: configurable Intl format', () => {
        const n = renderCellNode(1234.5, col(currency({ currency: 'USD', locale: 'en-US' })), {});
        expect(n.textContent).toContain('$');
    });

    it('date: Intl format', () => {
        const n = renderCellNode('2024-01-15', col(dateCell({ locale: 'en-US' })), {});
        expect(n.textContent).toMatch(/2024|1\/15/);
    });

    it('boolean-icon: defaults and custom labels', () => {
        expect(renderCellNode(true, col(booleanIcon({ trueLabel: 'YES' })), {}).textContent).toBe('YES');
        expect(renderCellNode(false, col(booleanIcon()), {}).textContent).toBe('✗');
    });

    it('actions: buttons fire onClick(row) and stop row-click propagation', () => {
        let clicked: unknown = null;
        const n = renderCellNode(null, col(actions([{ label: 'Edit', onClick: (row) => { clicked = row; } }])), { id: 7 }) as HTMLElement;
        const btn = n.querySelector('button')!;
        expect(btn.getAttribute('aria-label')).toBe('Edit');
        btn.click();
        expect(clicked).toEqual({ id: 7 });
    });

    it('link: blocks dangerous URL schemes (javascript:/data:/vbscript:)', () => {
        const js = renderCellNode('x', col(link({ href: () => 'javascript:alert(1)' })), {}) as HTMLAnchorElement;
        expect(js.getAttribute('href')).toBe('#');
        const data = renderCellNode('x', col(link({ href: () => 'data:text/html,<script>1</script>' })), {}) as HTMLAnchorElement;
        expect(data.getAttribute('href')).toBe('#');
        const vb = renderCellNode('x', col(link({ href: () => 'VBScript:msgbox(1)' })), {}) as HTMLAnchorElement;
        expect(vb.getAttribute('href')).toBe('#');
    });

    it('link: blocks control-char smuggling (java\\tscript:)', () => {
        const a = renderCellNode('x', col(link({ href: () => 'java\tscript:alert(1)' })), {}) as HTMLAnchorElement;
        expect(a.getAttribute('href')).toBe('#');
    });

    it('link: allows safe URLs (relative, fragment, http(s), mailto, tel)', () => {
        const cases = ['/users/1', './x', '#a', '?q=1', 'https://x.com', 'http://x.com', 'mailto:a@b.com', 'tel:+1'];
        for (const href of cases) {
            const a = renderCellNode('x', col(link({ href: () => href })), {}) as HTMLAnchorElement;
            expect(a.getAttribute('href')).toBe(href);
        }
    });

    it('actions: icon-only buttons still get an accessible name', () => {
        const n = renderCellNode(null, col(actions([{ icon: 'trash-2', onClick: () => {} }])), {}) as HTMLElement;
        const btn = n.querySelector('button')!;
        expect(btn.getAttribute('aria-label')).toBe('trash-2');
    });

    it('never renders the value as HTML (XSS-safe)', () => {
        const n = renderCellNode('<img src=x onerror=alert(1)>', col(status()), {}) as HTMLElement;
        expect(n.querySelector('img')).toBeNull();
        expect(n.textContent).toContain('<img');
    });
});
