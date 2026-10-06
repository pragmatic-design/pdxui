// pdx-entity-grid asks before it deletes, and names each row's actions after the row.
//
// A click on a row's trash, or the bulk Delete, must not remove records at once with no confirmation
// and no undo. Row buttons named only "Edit" and "Delete" would make a screen reader list "Edit,
// Delete, Edit, Delete" with nothing saying which row. The actions column has no filter button.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/entity-grid/pdx-entity-grid';

type Host = HTMLElement & Record<string, unknown>;

const COLUMNS = [
    { field: 'name', header: 'Name' },
    { field: 'role', header: 'Role' },
];
const PEOPLE = [
    { id: 1, name: 'Alice Johnson', role: 'Engineer' },
    { id: 2, name: 'Bob Smith', role: 'Designer' },
    { id: 3, name: 'Carol White', role: 'PM' },
];
const SCHEMA = { fields: [{ name: 'name', type: 'text', label: 'Name' }, { name: 'role', type: 'text', label: 'Role' }] };

async function mount(props: Record<string, unknown> = {}): Promise<{ el: Host; deletes: unknown[] }> {
    const el = document.createElement('pdx-entity-grid') as Host;
    Object.assign(el, { columns: COLUMNS, data: PEOPLE.map(p => ({ ...p })), schema: SCHEMA }, props);
    const deletes: unknown[] = [];
    el.addEventListener('pdx-delete', (e) => deletes.push((e as CustomEvent).detail));
    document.body.appendChild(el);
    await tick(40);
    await tick(20);
    return { el, deletes };
}

const deleteButtons = (el: Element) => [...el.querySelectorAll<HTMLButtonElement>('.pdx-dg-actions button.pdx-dg-action-danger')];
const dialog = (el: Element) => el.querySelector('pdx-alert-dialog') as (HTMLElement & { open?: boolean }) | null;
const dialogOpen = (el: Element) => !!dialog(el)?.querySelector('.pdx-dialog-backdrop[data-open]');
const dialogTitle = (el: Element) => dialog(el)?.querySelector('[role="alertdialog"]')?.getAttribute('aria-label');

beforeEach(cleanup);

describe('delete asks first', () => {
    it("a row's Delete opens an alertdialog and removes nothing", async () => {
        const { el, deletes } = await mount();
        deleteButtons(el)[0].click();
        await tick(20);
        expect(dialogOpen(el)).toBe(true);
        expect(dialogTitle(el)).toBe('Delete Alice Johnson?');
        // The title is the dialog's prop, not a title attribute on its host (a native tooltip).
        expect(dialog(el)!.getAttribute('title') ?? '').toBe('');
        expect(deleteButtons(el)).toHaveLength(3);
        expect(deletes).toHaveLength(0);
    });

    it('Cancel keeps the row; confirm removes it and emits pdx-delete once', async () => {
        const { el, deletes } = await mount();
        deleteButtons(el)[0].click();
        await tick(20);
        (dialog(el)!.querySelector('.pdx-alert-cancel') as HTMLButtonElement).click();
        await tick(20);
        expect(dialogOpen(el)).toBe(false);
        expect(deleteButtons(el)).toHaveLength(3);
        expect(deletes).toHaveLength(0);

        deleteButtons(el)[1].click();
        await tick(20);
        expect(dialogTitle(el)).toBe('Delete Bob Smith?');
        (dialog(el)!.querySelector('.pdx-alert-confirm') as HTMLButtonElement).click();
        await tick(40);
        expect(deleteButtons(el)).toHaveLength(2);
        expect(deletes).toEqual([{ ids: [2], rows: [expect.objectContaining({ id: 2 })] }]);
        expect(el.textContent).not.toContain('Bob Smith');
    });

    it('confirm-delete="false" removes at once, for an app that confirms elsewhere', async () => {
        const { el, deletes } = await mount({ confirmDelete: false });
        deleteButtons(el)[0].click();
        await tick(40);
        expect(dialogOpen(el)).toBe(false);
        expect(deleteButtons(el)).toHaveLength(2);
        expect(deletes).toHaveLength(1);
    });

    it('the bulk Delete asks "Delete 2 records?" and removes the selection on confirm', async () => {
        const { el, deletes } = await mount();
        const checks = [...el.querySelectorAll<HTMLInputElement>('[role="row"] input[type="checkbox"]')].slice(1);
        checks[0].click();
        checks[1].click();
        await tick(40);
        const bulkDelete = [...el.querySelectorAll<HTMLButtonElement>('pdx-bulk-actions button')].find(b => b.textContent?.includes('Delete'))!;
        bulkDelete.click();
        await tick(20);
        expect(dialogTitle(el)).toBe('Delete 2 records?');
        expect(deleteButtons(el)).toHaveLength(3);
        expect(deletes).toHaveLength(0);
        (dialog(el)!.querySelector('.pdx-alert-confirm') as HTMLButtonElement).click();
        await tick(40);
        expect(deleteButtons(el)).toHaveLength(1);
        expect(deletes).toEqual([{ ids: [1, 2] }]);
    });
});

describe("each row's actions are named after the row", () => {
    it('the first text column names them: "Edit Alice Johnson", "Delete Alice Johnson"', async () => {
        const { el } = await mount();
        const first = el.querySelector('.pdx-dg-actions')!;
        const names = [...first.querySelectorAll('button')].map(b => b.getAttribute('aria-label'));
        expect(names).toEqual(['Edit Alice Johnson', 'Delete Alice Johnson']);
    });

    it('row-label picks the field', async () => {
        const { el } = await mount({ rowLabel: 'role' });
        expect(deleteButtons(el)[0].getAttribute('aria-label')).toBe('Delete Engineer');
    });

    it('the actions column has no filter button, and the others do', async () => {
        const { el } = await mount();
        const headers = [...el.querySelectorAll('[role="columnheader"]')];
        const withFilter = headers.filter(h => h.querySelector('.pdx-dg-filter-icon')).map(h => h.textContent?.trim());
        expect(withFilter).toEqual(['Name', 'Role']);
        // Named: after a delete the grid's roving focus can land on it.
        expect(headers.map(h => h.textContent?.trim())).toContain('Actions');
    });
});
