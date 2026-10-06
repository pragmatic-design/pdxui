// `<pdx-json-editor>`: fields named by their labels, the sub-modal a dialog, no internal event on the
// host.
//
// The "Active" switch is named by its field, not "Toggle", and a click on its label toggles it; the
// "Edit…" sub-modal is a modal dialog with a name, focus inside it, Tab kept from the page, and focus
// back on Edit… after Apply; its delete buttons are named in words, not by an emoji; and no
// un-prefixed internal event (`jed-edit`) bubbles out of the host and into the API table.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, tick } from './helpers';

import '../../src/json-editor/pdx-json-editor';
import '../../src/input/pdx-input';
import '../../src/switch-toggle/pdx-switch';
import '../../src/tag-input/pdx-tag-input';
import '../../src/select/pdx-select';
import '../../src/button/pdx-button';

type Editor = HTMLElement & { schema: unknown; value: unknown };

const SCHEMA = {
    label: 'Config',
    fields: [
        { k: 'name', label: 'Name', type: 'text', req: true },
        { k: 'active', label: 'Active', type: 'bool' },
        { k: 'tags', label: 'Tags', type: 'taglist' },
        { k: 'tier', label: 'Tier', type: 'enum', values: ['gold', 'silver'] },
        { k: 'contacts', label: 'Contacts', type: 'objectList', fields: [
            { k: 'label', label: 'Label', type: 'text' },
            { k: 'value', label: 'Value', type: 'text' },
        ] },
    ],
};
const VALUE = { name: 'Acme', active: true, tags: ['vip'], tier: 'gold', contacts: [{ label: 'Email', value: 'a@b.com' }] };

async function mountEditor(schema: unknown = SCHEMA, value: unknown = VALUE): Promise<{ el: Editor; changes: unknown[] }> {
    document.body.innerHTML = '<pdx-json-editor></pdx-json-editor>';
    const el = document.body.firstElementChild as Editor;
    el.schema = schema;
    el.value = value;
    const changes: unknown[] = [];
    el.addEventListener('pdx-change', (e) => changes.push((e as CustomEvent).detail.value));
    await tick(100);
    return { el, changes };
}
const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
const editButton = (el: Element) => el.querySelector('.jcomplex-b') as HTMLButtonElement;

describe('pdx-json-editor field names', () => {
    beforeEach(cleanup);
    afterEach(() => { document.querySelectorAll('.jed-back').forEach((b) => b.remove()); });

    it('the switch is named by the field label, in a label that toggles it', async () => {
        const { el, changes } = await mountEditor();
        const input = el.querySelector('input[role="switch"]') as HTMLInputElement;
        expect(input.getAttribute('aria-label')).toBeNull();
        expect(input.closest('label')?.textContent?.trim()).toBe('Active');
        input.click();
        await tick(20);
        expect((changes.at(-1) as Record<string, unknown>).active).toBe(false);
    });

    it('no field sits in a <label> that would name the component host instead of its control', async () => {
        const { el } = await mountEditor();
        for (const label of el.querySelectorAll('label.jfld')) {
            expect(label.querySelector('pdx-input, pdx-select, pdx-tag-input, pdx-switch, pdx-number-input')).toBeNull();
        }
    });

    it('text, tag and select fields are named by their labels', async () => {
        const { el } = await mountEditor();
        expect(el.querySelector('pdx-input input')?.getAttribute('aria-label')).toBe('Name');
        expect(el.querySelector('pdx-tag-input input')?.getAttribute('aria-label')).toBe('Tags');
        expect(el.querySelector('pdx-select [aria-haspopup]')?.getAttribute('aria-label')).toBe('Tier');
    });
});

describe('pdx-json-editor sub-modal', () => {
    beforeEach(cleanup);
    afterEach(() => { document.querySelectorAll('.jed-back').forEach((b) => b.remove()); });

    it('Edit… opens a modal dialog named by the branch, with focus on its first field', async () => {
        const { el } = await mountEditor();
        const edit = editButton(el);
        edit.focus();
        edit.click();
        await tick(50);
        const d = dialog()!;
        expect(d).not.toBeNull();
        expect(d.getAttribute('aria-modal')).toBe('true');
        const nameId = d.getAttribute('aria-labelledby')!;
        expect(document.getElementById(nameId)?.textContent).toBe('Contacts');
        expect(document.activeElement).toBe(d.querySelector('pdx-input input'));
    });

    it('Apply writes the value, emits pdx-change once, and returns focus to Edit…', async () => {
        const { el, changes } = await mountEditor();
        const leaked: string[] = [];
        document.addEventListener('jed-edit', () => leaked.push('jed-edit'));
        const edit = editButton(el);
        edit.focus();
        edit.click();
        await tick(50);
        const d = dialog()!;
        (d.querySelector('.jrow-del') as HTMLButtonElement).click();
        const before = changes.length;
        (d.querySelector('.jed-ok') as HTMLButtonElement).click();
        await tick(20);
        expect(dialog()).toBeNull();
        expect(changes.length).toBe(before + 1);
        expect((changes.at(-1) as Record<string, unknown>).contacts).toBeUndefined();
        expect(document.activeElement).toBe(edit);
        expect(leaked).toEqual([]);
    });

    it('Escape closes it without applying, and returns focus to Edit…', async () => {
        const { el, changes } = await mountEditor();
        const edit = editButton(el);
        edit.focus();
        edit.click();
        await tick(50);
        const d = dialog()!;
        (d.querySelector('.jrow-del') as HTMLButtonElement).click();
        d.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await tick(20);
        expect(dialog()).toBeNull();
        expect(changes).toEqual([]);
        expect(document.activeElement).toBe(edit);
    });

    it('the delete buttons are named "Remove item {n}", and renumbered after a removal', async () => {
        const { el } = await mountEditor(SCHEMA, { ...VALUE, contacts: [{ label: 'A' }, { label: 'B' }] });
        editButton(el).click();
        await tick(50);
        const names = () => [...dialog()!.querySelectorAll('.jrow-del')].map((b) => b.getAttribute('aria-label'));
        expect(names()).toEqual(['Remove item 1', 'Remove item 2']);
        (dialog()!.querySelector('.jrow-del') as HTMLButtonElement).click();
        expect(names()).toEqual(['Remove item 1']);
    });
});

describe('pdx-json-editor root list', () => {
    beforeEach(cleanup);

    it('removing a row of a root-level list emits the new value', async () => {
        const schema = { label: 'Contacts', kind: 'list', item: [{ k: 'label', label: 'Label', type: 'text' }] };
        const { el, changes } = await mountEditor(schema, [{ label: 'A' }, { label: 'B' }]);
        (el.querySelector('.jrow-del') as HTMLButtonElement).click();
        await tick(20);
        expect(changes.at(-1)).toEqual([{ label: 'B' }]);
    });
});
