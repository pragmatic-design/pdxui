// Tests for pdx-cascader component.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';

import '../../src/cascader/pdx-cascader';

describe('pdx-cascader', () => {
    beforeEach(cleanup);

    const options = [
        {
            value: 'europe', label: 'Europe', children: [
                { value: 'italy', label: 'Italy', children: [
                    { value: 'rome', label: 'Rome' },
                    { value: 'milan', label: 'Milan' },
                ]},
                { value: 'france', label: 'France', children: [
                    { value: 'paris', label: 'Paris' },
                    { value: 'lyon', label: 'Lyon' },
                ]},
            ]
        },
        {
            value: 'asia', label: 'Asia', children: [
                { value: 'japan', label: 'Japan', children: [
                    { value: 'tokyo', label: 'Tokyo' },
                ]},
            ]
        },
    ];

    async function mountCascader(props: Record<string, any> = {}) {
        const attrs: Record<string, string> = {};
        if (props.placeholder) attrs.placeholder = props.placeholder;
        if (props.disabled) attrs.disabled = '';
        if (props.searchable) attrs.searchable = '';
        if (props.name) attrs.name = props.name;
        if (props.separator) attrs.separator = props.separator;
        const el = await mount('pdx-cascader', attrs) as any;
        el.options = props.options || options;
        if (props.value) el.value = props.value;
        await tick(200);
        return el;
    }

    it('renders trigger element', async () => {
        const el = await mountCascader();
        const trigger = el.querySelector('.pdx-cascader-trigger');
        expect(trigger).toBeTruthy();
    });

    it('trigger has role="combobox"', async () => {
        const el = await mountCascader();
        const trigger = el.querySelector('.pdx-cascader-trigger');
        expect(trigger?.getAttribute('role')).toBe('combobox');
    });

    it('trigger has aria-haspopup="listbox"', async () => {
        const el = await mountCascader();
        const trigger = el.querySelector('.pdx-cascader-trigger');
        expect(trigger?.getAttribute('aria-haspopup')).toBe('listbox');
    });

    it('shows placeholder when no value', async () => {
        const el = await mountCascader({ placeholder: 'Select location' });
        const text = el.querySelector('.pdx-cascader-text');
        expect(text?.textContent).toBe('Select location');
        expect(text?.classList.contains('pdx-cascader-placeholder')).toBe(true);
    });

    it('shows selected path as display text', async () => {
        const el = await mountCascader({ value: ['europe', 'italy', 'rome'] });
        const text = el.querySelector('.pdx-cascader-text');
        expect(text?.textContent).toBe('Europe / Italy / Rome');
    });

    it('uses custom separator', async () => {
        const el = await mountCascader({ value: ['europe', 'italy', 'rome'], separator: ' > ' });
        const text = el.querySelector('.pdx-cascader-text');
        expect(text?.textContent).toBe('Europe > Italy > Rome');
    });

    it('renders panel (hidden by default)', async () => {
        const el = await mountCascader();
        const panel = el.querySelector('.pdx-cascader-panel');
        expect(panel).toBeTruthy();
        expect(panel?.style.display).toBe('none');
    });

    it('renders dropdown icon', async () => {
        const el = await mountCascader();
        const icon = el.querySelector('.pdx-cascader-icon');
        expect(icon).toBeTruthy();
    });

    it('applies disabled class', async () => {
        const el = await mountCascader({ disabled: true });
        const trigger = el.querySelector('.pdx-cascader-trigger');
        expect(trigger?.classList.contains('disabled')).toBe(true);
    });

    it('renders hidden input when name is set', async () => {
        const el = await mountCascader({ name: 'location' });
        const hidden = el.querySelector('input[type="hidden"]');
        expect(hidden).toBeTruthy();
        expect(hidden?.getAttribute('name')).toBe('location');
    });

    it('renders clear button when value is set', async () => {
        const el = await mountCascader({ value: ['europe', 'italy', 'rome'] });
        const clear = el.querySelector('.pdx-input-clear');
        expect(clear).toBeTruthy();
        expect((clear as HTMLElement)?.style.display).not.toBe('none');
    });

    it('hides clear button when no value', async () => {
        const el = await mountCascader();
        const clear = el.querySelector('.pdx-input-clear');
        if (clear) {
            expect((clear as HTMLElement).style.display).toBe('none');
        }
    });
});
