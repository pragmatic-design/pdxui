// A required pdx-form-field tells its control, and a form-template list row names its remove button.
//
// An asterisk alone tells no one: a control that reports neither `required` nor `aria-required` is
// read as "Full Name, edit text", with no "required" until an error appears. A list row's remove
// button named "×" says nothing, and after a removal focus must not fall to <body>.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/form-field/pdx-form-field';
import '../../src/input/pdx-input';
import '../../src/radio-group/pdx-radio-group';
import '../../src/form-template/pdx-form-template';

async function mount(html: string): Promise<HTMLElement> {
    document.body.innerHTML = html;
    await tick(20);
    await tick();
    return document.body.firstElementChild as HTMLElement;
}

beforeEach(cleanup);

describe('pdx-form-field required → the control', () => {
    it('sets aria-required on the native input, and not the native required', async () => {
        const field = await mount('<pdx-form-field label="Full Name" required><pdx-input></pdx-input></pdx-form-field>');
        const input = field.querySelector('input')!;
        expect(input.getAttribute('aria-required')).toBe('true');
        // The browser's own validation bubble would come up alongside the form's messages.
        expect(input.hasAttribute('required')).toBe(false);
    });

    it('dropping required removes it', async () => {
        const field = await mount('<pdx-form-field label="Full Name" required><pdx-input></pdx-input></pdx-form-field>');
        field.removeAttribute('required');
        await tick();
        expect(field.querySelector('input')!.hasAttribute('aria-required')).toBe(false);
    });

    it('a field that is not required leaves a control that says so itself alone', async () => {
        const field = await mount('<pdx-form-field label="Nick"><pdx-input required></pdx-input></pdx-form-field>');
        expect(field.querySelector('input')!.getAttribute('aria-required')).toBe('true');
    });

    it('a radio group gets it on the radiogroup, not on its first radio', async () => {
        const field = await mount(`<pdx-form-field label="Role" required>
            <pdx-radio-group value="a" options='[{"label":"A","value":"a"},{"label":"B","value":"b"}]'></pdx-radio-group>
        </pdx-form-field>`);
        await tick(20);
        const group = field.querySelector('[role="radiogroup"]')!;
        expect(group.getAttribute('aria-required')).toBe('true');
        expect(field.querySelector('input[type="radio"][aria-required]')).toBeNull();
    });
});

describe('pdx-form-template list rows', () => {
    async function mountList(): Promise<HTMLElement & { schema: unknown; showActions: boolean }> {
        const el = document.createElement('pdx-form-template') as HTMLElement & { schema: unknown; showActions: boolean };
        document.body.appendChild(el);
        await tick();
        el.showActions = false;
        el.schema = { fields: [{ name: 'items', type: 'list', label: 'Items', itemFields: [{ name: 'product', type: 'text', label: 'Product' }] }] };
        await tick(20);
        const add = () => [...el.querySelectorAll<HTMLButtonElement>('.pdx-field-list-header button')].find(b => /Add/.test(b.textContent ?? ''))!;
        add().click(); await tick(20);
        add().click(); await tick(20);
        return el;
    }
    const removes = (el: Element) => [...el.querySelectorAll<HTMLButtonElement>('.pdx-field-list-cell-actions button')];

    it('each remove button is named after its line', async () => {
        const el = await mountList();
        expect(removes(el).map(b => b.getAttribute('aria-label'))).toEqual(['Remove line 1', 'Remove line 2']);
    });

    it('after a removal focus goes to the next row\'s first field, and after the last to "+ Add"', async () => {
        const el = await mountList();
        removes(el)[0].focus();
        removes(el)[0].click();
        await tick(20);
        expect(removes(el)).toHaveLength(1);
        const firstRowInput = el.querySelector('.pdx-field-list-row input') as HTMLElement;
        expect(document.activeElement).toBe(firstRowInput);

        removes(el)[0].focus();
        removes(el)[0].click();
        await tick(20);
        expect(removes(el)).toHaveLength(0);
        expect(document.activeElement?.textContent).toMatch(/Add/);
    });
});

// A list row's controls need a name of their own: the field's label is empty ("the column header
// already shows it") and the header is a plain span tied to nothing, so every cell would read "edit text".
describe('pdx-form-template list row controls are named', () => {
    it('each control is "{column}, line {n}"', async () => {
        const el = document.createElement('pdx-form-template') as HTMLElement & { schema: unknown; showActions: boolean };
        document.body.appendChild(el);
        await tick();
        el.showActions = false;
        el.schema = { fields: [{ name: 'items', type: 'list', label: 'Items', itemFields: [
            { name: 'product', type: 'text', label: 'Product' },
            { name: 'qty', type: 'number', label: 'Qty' },
        ] }] };
        await tick(20);
        const add = () => [...el.querySelectorAll<HTMLButtonElement>('.pdx-field-list-header button')].find(b => /Add/.test(b.textContent ?? ''))!;
        add().click(); await tick(20);
        add().click(); await tick(20);
        await tick(20);
        const names = [...el.querySelectorAll('.pdx-field-list-row')].flatMap(row =>
            [...row.querySelectorAll('.pdx-field-list-cell:not(.pdx-field-list-cell-actions)')]
                .map(cell => cell.querySelector('input, textarea, select')?.getAttribute('aria-label') ?? null));
        expect(names).toEqual(['Product, line 1', 'Qty, line 1', 'Product, line 2', 'Qty, line 2']);
    });

    it('a visible label wins: the <label for> stays, and a11y-label sets no aria-label', async () => {
        const field = await mount('<pdx-form-field label="Email" a11y-label="Hidden name"><pdx-input></pdx-input></pdx-form-field>');
        const input = field.querySelector('input')!;
        expect(input.hasAttribute('aria-label')).toBe(false);
        expect(field.querySelector('label')!.getAttribute('for')).toBe(input.id);
    });

    it('without a label, a11y-label names the control; a control that names itself keeps its own name', async () => {
        const named = await mount('<pdx-form-field a11y-label="Product, line 1"><pdx-input></pdx-input></pdx-form-field>');
        expect(named.querySelector('input')!.getAttribute('aria-label')).toBe('Product, line 1');
        const own = await mount('<pdx-form-field a11y-label="Product, line 1"><pdx-input aria-label="SKU"></pdx-input></pdx-form-field>');
        expect(own.querySelector('input')!.getAttribute('aria-label')).toBe('SKU');
    });
});
