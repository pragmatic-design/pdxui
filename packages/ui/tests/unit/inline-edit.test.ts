// Tests for pdx-inline-edit component.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';

import '../../src/inline-edit/pdx-inline-edit';

describe('pdx-inline-edit', () => {
    beforeEach(cleanup);

    async function mountInlineEdit(props: Record<string, any> = {}) {
        const attrs: Record<string, string> = {};
        if (props.type) attrs.type = props.type;
        if (props.placeholder) attrs.placeholder = props.placeholder;
        if (props.disabled) attrs.disabled = '';
        if (props.readonly) attrs.readonly = '';
        if (props.editOn) attrs.editon = props.editOn;
        if (props.saveOn) attrs.saveon = props.saveOn;
        if (props.name) attrs.name = props.name;
        if (props.currency) attrs.currency = props.currency;
        if (props.showIcon === false) attrs.showicon = 'false';
        const el = await mount('pdx-inline-edit', attrs) as any;
        if (props.value !== undefined) el.value = props.value;
        if (props.options) el.options = props.options;
        await tick(200);
        return el;
    }

    it('renders display element', async () => {
        const el = await mountInlineEdit({ value: 'Hello' });
        const display = el.querySelector('.pdx-inline-edit-display');
        expect(display).toBeTruthy();
    });

    it('shows value in display mode', async () => {
        const el = await mountInlineEdit({ value: 'Hello World' });
        const text = el.querySelector('.pdx-inline-edit-text');
        expect(text?.textContent).toContain('Hello World');
    });

    it('shows placeholder when value is empty', async () => {
        const el = await mountInlineEdit({ placeholder: 'Enter text...', value: '' });
        const display = el.querySelector('.pdx-inline-edit-display');
        expect(display?.textContent).toContain('Enter text...');
    });

    it('shows edit icon on display', async () => {
        const el = await mountInlineEdit({ value: 'Test' });
        const icon = el.querySelector('.pdx-inline-edit-icon');
        expect(icon).toBeTruthy();
        expect(icon?.textContent).toBe('✎');
    });

    it('hides edit icon when showIcon is false', async () => {
        const el = await mountInlineEdit({ value: 'Test', showIcon: false });
        await tick(200);
        const icon = el.querySelector('.pdx-inline-edit-icon');
        expect(el.querySelector('.pdx-inline-edit-display')).toBeTruthy();
        expect(icon, 'showIcon=false must not render the pencil').toBeNull();
    });

    it('enters edit mode on click', async () => {
        const el = await mountInlineEdit({ value: 'Hello' });
        const display = el.querySelector('.pdx-inline-edit-display');
        display?.click();
        await tick(100);
        const editor = el.querySelector('.pdx-inline-edit-editor');
        expect(editor?.style.display).not.toBe('none');
    });

    it('shows text input for type=text', async () => {
        const el = await mountInlineEdit({ type: 'text', value: 'Hello' });
        const display = el.querySelector('.pdx-inline-edit-display');
        display?.click();
        await tick(100);
        const input = el.querySelector('.pdx-inline-edit-input');
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement)?.value).toBe('Hello');
    });

    it('shows textarea for type=textarea', async () => {
        const el = await mountInlineEdit({ type: 'textarea', value: 'Long text' });
        const display = el.querySelector('.pdx-inline-edit-display');
        display?.click();
        await tick(100);
        const textarea = el.querySelector('.pdx-inline-edit-textarea');
        expect(textarea).toBeTruthy();
    });

    it('formats number display', async () => {
        const el = await mountInlineEdit({ type: 'number', value: 1234.5 });
        const text = el.querySelector('.pdx-inline-edit-text');
        // Number formatting is locale-dependent
        expect(text?.textContent).toBeTruthy();
        expect(text?.textContent).not.toBe('');
    });

    it('formats boolean as Yes/No', async () => {
        const el = await mountInlineEdit({ type: 'boolean', value: true });
        const text = el.querySelector('.pdx-inline-edit-text');
        expect(text?.textContent).toBe('Yes');
    });

    it('formats select with label', async () => {
        const el = await mountInlineEdit({
            type: 'select',
            value: 'b',
            options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }],
        });
        const text = el.querySelector('.pdx-inline-edit-text');
        expect(text?.textContent).toBe('Beta');
    });

    it('formats multiselect as comma-separated', async () => {
        const el = await mountInlineEdit({
            type: 'multiselect',
            value: ['a', 'c'],
            options: [
                { value: 'a', label: 'Alpha' },
                { value: 'b', label: 'Beta' },
                { value: 'c', label: 'Gamma' },
            ],
        });
        const text = el.querySelector('.pdx-inline-edit-text');
        expect(text?.textContent).toBe('Alpha, Gamma');
    });

    it('shows color swatch for type=color', async () => {
        const el = await mountInlineEdit({ type: 'color', value: '#ff0000' });
        const swatch = el.querySelector('.pdx-inline-edit-swatch');
        expect(swatch).toBeTruthy();
    });

    it('applies disabled class', async () => {
        const el = await mountInlineEdit({ disabled: true, value: 'X' });
        const root = el.querySelector('.pdx-inline-edit');
        expect(root?.classList.contains('disabled')).toBe(true);
    });

    it('does not enter edit mode when disabled', async () => {
        const el = await mountInlineEdit({ disabled: true, value: 'X' });
        const display = el.querySelector('.pdx-inline-edit-display');
        display?.click();
        await tick(100);
        const editor = el.querySelector('.pdx-inline-edit-editor');
        expect(editor?.style.display).toBe('none');
    });

    it('shows action buttons in action saveOn mode', async () => {
        const el = await mountInlineEdit({ value: 'Hello', saveOn: 'action' });
        const display = el.querySelector('.pdx-inline-edit-display');
        display?.click();
        await tick(100);
        const save = el.querySelector('.pdx-inline-edit-save');
        const cancel = el.querySelector('.pdx-inline-edit-cancel');
        expect(save).toBeTruthy();
        expect(cancel).toBeTruthy();
    });

    it('renders hidden input when name set', async () => {
        const el = await mountInlineEdit({ name: 'myfield', value: 'test' });
        const hidden = el.querySelector('input[type="hidden"]');
        expect(hidden).toBeTruthy();
        expect(hidden?.getAttribute('name')).toBe('myfield');
    });

    it('has role=button on display element', async () => {
        const el = await mountInlineEdit({ value: 'Test' });
        const display = el.querySelector('.pdx-inline-edit-display');
        expect(display?.getAttribute('role')).toBe('button');
        expect(display?.getAttribute('tabindex')).toBe('0');
    });
});

// The root says its type as an attribute, not as a class: two of the `pdx-inline-edit-${type}` names
// are inner elements' classes, so a textarea root would take the editor <textarea>'s border, ring and
// height in display mode, and a text root the value span's overflow:hidden. The root shares no class
// with anything inside it.
describe('pdx-inline-edit type on the root', () => {
    beforeEach(cleanup);

    const shared = (el: Element): string[] => {
        const root = el.querySelector('.pdx-inline-edit')!;
        const inner = new Set([...root.querySelectorAll('*')].flatMap(n => [...n.classList]));
        return [...root.classList].filter(c => inner.has(c));
    };

    for (const type of ['text', 'textarea', 'number', 'currency']) {
        it(`type="${type}": the root says its type as data-type, and shares no class with an inner element`, async () => {
            const el = await mount('pdx-inline-edit', { type, value: type === 'number' || type === 'currency' ? '12' : 'Hello' }) as HTMLElement & { startEdit(): void };
            await tick(200);
            const root = el.querySelector('.pdx-inline-edit')!;
            expect(shared(el), 'display mode').toEqual([]);
            el.startEdit();
            await tick(50);
            expect(shared(el), 'edit mode').toEqual([]);
            expect(root.getAttribute('data-type')).toBe(type);
        });
    }
});
