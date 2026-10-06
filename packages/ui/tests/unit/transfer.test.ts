// Tests for pdx-transfer component.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';

import '../../src/transfer/pdx-transfer';

describe('pdx-transfer', () => {
    beforeEach(cleanup);

    const items = [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
        { value: 'c', label: 'Charlie' },
        { value: 'd', label: 'Delta' },
        { value: 'e', label: 'Echo', disabled: true },
    ];

    async function mountTransfer(props: Record<string, any> = {}) {
        // Build attribute map for string/boolean props set at mount time
        const attrs: Record<string, string> = {};
        if (props.searchable) attrs.searchable = '';
        if (props.disabled) attrs.disabled = '';
        if (props.sourceTitle) attrs.sourcetitle = props.sourceTitle;
        if (props.targetTitle) attrs.targettitle = props.targetTitle;
        if (props.showAllButtons) attrs.showallbuttons = '';
        if (props.name) attrs.name = props.name;
        const el = await mount('pdx-transfer', attrs) as any;
        // Set complex props via JS property (must happen before rAF build)
        el.items = props.items || items;
        el.value = props.value || ['c', 'd'];
        await tick(200);
        return el;
    }

    it('renders transfer root element', async () => {
        const el = await mountTransfer();
        const root = el.querySelector('.pdx-transfer');
        expect(root).toBeTruthy();
    });

    it('has role="group" on root', async () => {
        const el = await mountTransfer();
        const root = el.querySelector('.pdx-transfer');
        expect(root?.getAttribute('role')).toBe('group');
    });

    it('renders two panels', async () => {
        const el = await mountTransfer();
        const panels = el.querySelectorAll('.pdx-transfer-panel');
        expect(panels.length).toBe(2);
    });

    it('renders source panel with correct items', async () => {
        const el = await mountTransfer();
        const panels = el.querySelectorAll('.pdx-transfer-panel');
        const sourceItems = panels[0].querySelectorAll('.pdx-transfer-item');
        // Source should have items not in value: a, b, e (c and d are in target)
        expect(sourceItems.length).toBe(3);
    });

    it('renders target panel with correct items', async () => {
        const el = await mountTransfer();
        const panels = el.querySelectorAll('.pdx-transfer-panel');
        const targetItems = panels[1].querySelectorAll('.pdx-transfer-item');
        // Target should have items in value: c, d
        expect(targetItems.length).toBe(2);
    });

    it('renders action buttons between panels', async () => {
        const el = await mountTransfer();
        const actions = el.querySelector('.pdx-transfer-actions');
        expect(actions).toBeTruthy();
        const btns = actions.querySelectorAll('.pdx-transfer-btn');
        expect(btns.length).toBe(2); // move right, move left
    });

    it('renders 4 buttons when showAllButtons is set', async () => {
        const el = await mountTransfer({ showAllButtons: true });
        const btns = el.querySelectorAll('.pdx-transfer-btn');
        expect(btns.length).toBe(4); // move all right, move right, move left, move all left
    });

    it('renders panel headers with titles', async () => {
        const el = await mountTransfer({ sourceTitle: 'Available', targetTitle: 'Selected' });
        const headers = el.querySelectorAll('.pdx-transfer-header');
        expect(headers[0].textContent).toContain('Available');
        expect(headers[1].textContent).toContain('Selected');
    });

    it('renders select-all checkboxes', async () => {
        const el = await mountTransfer();
        const allCbs = el.querySelectorAll('.pdx-transfer-select-all');
        expect(allCbs.length).toBe(2);
    });

    it('renders count display', async () => {
        const el = await mountTransfer();
        const counts = el.querySelectorAll('.pdx-transfer-count');
        expect(counts.length).toBe(2);
    });

    it('renders search inputs when searchable', async () => {
        const el = await mountTransfer({ searchable: true });
        const searches = el.querySelectorAll('.pdx-transfer-search input');
        expect(searches.length).toBe(2);
    });

    it('does not render search inputs by default', async () => {
        const el = await mountTransfer();
        const searches = el.querySelectorAll('.pdx-transfer-search');
        expect(searches.length).toBe(0);
    });

    it('renders disabled items with disabled class', async () => {
        const el = await mountTransfer();
        const disabledItems = el.querySelectorAll('.pdx-transfer-item.disabled');
        expect(disabledItems.length).toBe(1); // 'e' (Echo) is disabled
    });

    it('disabled items expose aria-disabled', async () => {
        // The per-item check is a presentational <span> (a real <input> inside role=option violates
        // ARIA nested-interactive), so the disabled state is exposed via aria-disabled, not a checkbox.
        const el = await mountTransfer();
        const disabledItem = el.querySelector('.pdx-transfer-item.disabled') as HTMLElement;
        expect(disabledItem?.getAttribute('aria-disabled')).toBe('true');
    });

    it('applies disabled class on root when disabled', async () => {
        const el = await mountTransfer({ disabled: true });
        const root = el.querySelector('.pdx-transfer');
        expect(root?.classList.contains('disabled')).toBe(true);
    });

    it('renders hidden input when name is set', async () => {
        const el = await mountTransfer({ name: 'permissions' });
        const hidden = el.querySelector('input[type="hidden"]');
        expect(hidden).toBeTruthy();
        expect(hidden?.getAttribute('name')).toBe('permissions');
    });

    it('items have role="option"', async () => {
        const el = await mountTransfer();
        const options = el.querySelectorAll('[role="option"]');
        expect(options.length).toBe(5); // 3 source + 2 target
    });

    it('panels have role="listbox"', async () => {
        const el = await mountTransfer();
        const listboxes = el.querySelectorAll('[role="listbox"]');
        expect(listboxes.length).toBeGreaterThanOrEqual(2);
    });

    it('shows empty state when no items match search', async () => {
        const el = await mountTransfer({ searchable: true });
        const searchInput = el.querySelector('.pdx-transfer-search input') as HTMLInputElement;
        searchInput.value = 'zzzzz';
        searchInput.dispatchEvent(new Event('input'));
        await tick(50);
        const empty = el.querySelector('.pdx-transfer-empty');
        expect(empty).toBeTruthy();
    });

    it('move buttons are initially disabled (no checked items)', async () => {
        const el = await mountTransfer();
        const btns = el.querySelectorAll('.pdx-transfer-btn');
        expect((btns[0] as HTMLButtonElement).disabled).toBe(true);
        expect((btns[1] as HTMLButtonElement).disabled).toBe(true);
    });
});
