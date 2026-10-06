// Tests for pdx-tree-select component.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';

import '../../src/tree-select/pdx-tree-select';

describe('pdx-tree-select', () => {
    beforeEach(cleanup);

    const tree = [
        {
            value: 'fruits', label: 'Fruits', children: [
                { value: 'apple', label: 'Apple' },
                { value: 'banana', label: 'Banana' },
                { value: 'cherry', label: 'Cherry', disabled: true },
            ]
        },
        {
            value: 'vegs', label: 'Vegetables', children: [
                { value: 'carrot', label: 'Carrot' },
                { value: 'broccoli', label: 'Broccoli' },
            ]
        },
        { value: 'grain', label: 'Grain' },
    ];

    async function mountTreeSelect(props: Record<string, any> = {}) {
        const attrs: Record<string, string> = {};
        if (props.placeholder) attrs.placeholder = props.placeholder;
        if (props.disabled) attrs.disabled = '';
        if (props.searchable) attrs.searchable = '';
        if (props.multiple) attrs.multiple = '';
        if (props.expandAll) attrs.expandall = '';
        if (props.name) attrs.name = props.name;
        const el = await mount('pdx-tree-select', attrs) as any;
        el.options = props.options || tree;
        if (props.value !== undefined) el.value = props.value;
        await tick(200);
        return el;
    }

    it('renders trigger element', async () => {
        const el = await mountTreeSelect();
        const trigger = el.querySelector('[role="combobox"]');
        expect(trigger).toBeTruthy();
    });

    it('trigger has aria-haspopup="tree"', async () => {
        const el = await mountTreeSelect();
        const trigger = el.querySelector('[role="combobox"]');
        expect(trigger?.getAttribute('aria-haspopup')).toBe('tree');
    });

    it('shows placeholder when no value', async () => {
        const el = await mountTreeSelect({ placeholder: 'Pick food' });
        const text = el.querySelector('.pdx-cascader-text');
        expect(text?.textContent).toBe('Pick food');
    });

    it('shows selected label when value set (single)', async () => {
        const el = await mountTreeSelect({ value: 'grain' });
        const text = el.querySelector('.pdx-cascader-text');
        expect(text?.textContent).toBe('Grain');
    });

    it('shows multiple labels when value set (multi)', async () => {
        const el = await mountTreeSelect({ multiple: true, value: ['apple', 'carrot'] });
        const text = el.querySelector('.pdx-cascader-text');
        expect(text?.textContent).toContain('Apple');
        expect(text?.textContent).toContain('Carrot');
    });

    it('renders panel (hidden by default)', async () => {
        const el = await mountTreeSelect();
        const panel = el.querySelector('.pdx-tree-select-panel');
        expect(panel).toBeTruthy();
        expect(panel?.style.display).toBe('none');
    });

    it('applies disabled class', async () => {
        const el = await mountTreeSelect({ disabled: true });
        const trigger = el.querySelector('[role="combobox"]');
        expect(trigger?.classList.contains('disabled')).toBe(true);
    });

    it('renders hidden input when name set', async () => {
        const el = await mountTreeSelect({ name: 'food' });
        const hidden = el.querySelector('input[type="hidden"]');
        expect(hidden).toBeTruthy();
        expect(hidden?.getAttribute('name')).toBe('food');
    });

    it('renders clear button when value set', async () => {
        const el = await mountTreeSelect({ value: 'grain' });
        const clear = el.querySelector('.pdx-input-clear');
        expect(clear).toBeTruthy();
    });
});
