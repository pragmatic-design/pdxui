// pdx-form-template — self-contained control registration + per-type input semantics.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/form-template/pdx-form-template';

async function mountForm(schema: unknown): Promise<HTMLElement & { schema: unknown; showActions: boolean }> {
    const el = document.createElement('pdx-form-template') as HTMLElement & { schema: unknown; showActions: boolean };
    document.body.appendChild(el); // upgrade the CE first, then set props (pre-upgrade assignment is lost)
    await tick();
    el.showActions = false;
    el.schema = schema;
    await tick(20);
    return el;
}

describe('pdx-form-template — controls + field types', () => {
    beforeEach(cleanup);

    it('registers + renders pdx-file-upload for a file field (self-contained)', async () => {
        const el = await mountForm({ fields: [{ name: 'doc', type: 'file', label: 'Doc' }] });
        expect(customElements.get('pdx-file-upload')).toBeTruthy();
        expect(el.querySelector('pdx-file-upload')).toBeTruthy();
    });

    it('a date field is a pdx-date-picker you can type into', async () => {
        // TYPE_TAG maps `date`: without it the field falls back to pdx-input, and a schema form's dates
        // are the browser's own input, not the library's calendar.
        const el = await mountForm({ fields: [{ name: 'start', type: 'date', label: 'Start' }] });
        const picker = el.querySelector('pdx-date-picker');
        expect(picker, 'a date field is not a pdx-date-picker').not.toBeNull();
        expect(picker!.getAttribute('name')).toBe('start');
        expect(picker!.hasAttribute('editable'), 'a date field cannot be typed into').toBe(true);
        expect(el.querySelector('pdx-input'), 'the date is still a pdx-input').toBeNull();
    });

    it('control — a text field is still a pdx-input', async () => {
        const el = await mountForm({ fields: [{ name: 'title', type: 'text', label: 'Title' }] });
        expect(el.querySelector('pdx-input')).not.toBeNull();
        expect(el.querySelector('pdx-date-picker')).toBeNull();
    });

    it('a top-level email field carries input type="email"', async () => {
        const el = await mountForm({ fields: [{ name: 'mail', type: 'email', label: 'Email' }] });
        expect(el.querySelector('pdx-input')?.getAttribute('type')).toBe('email');
    });

    it('a nested list email field keeps input type="email" (not generic text)', async () => {
        const el = await mountForm({
            fields: [{
                name: 'contacts', type: 'list', label: 'Contacts',
                itemFields: [{ name: 'mail', type: 'email', label: 'Email' }],
            }],
        });
        // Add one row so an item input renders.
        const addBtn = Array.from(el.querySelectorAll('.pdx-field-list button'))
            .find(b => /Add/.test(b.textContent || '')) as HTMLButtonElement | undefined;
        expect(addBtn, 'field-list add button').toBeTruthy();
        addBtn!.click();
        await tick(20);
        expect(el.querySelector('.pdx-field-list pdx-input')?.getAttribute('type')).toBe('email');
    });
});
