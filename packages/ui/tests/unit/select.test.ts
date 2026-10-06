import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/select/pdx-select';

// Helper: set an array prop on a CE
function setOptions(el: HTMLElement, options: unknown[]) {
    (el as any).options = options;
}

describe('pdx-select', () => {
    beforeEach(cleanup);

    // ─── Rendering ──────────────────���───────────────

    it('renders trigger with placeholder', async () => {
        const el = await mount('pdx-select', { placeholder: 'Pick one...' });
        await tick(50);
        const ph = el.querySelector('.pdx-select-placeholder');
        expect(ph).toBeTruthy();
        expect(ph?.textContent).toContain('Pick one');
    });

    it('renders caret icon', async () => {
        const el = await mount('pdx-select');
        await tick(50);
        const caret = el.querySelector('.pdx-select-caret');
        expect(caret).toBeTruthy();
    });

    it('renders hidden input for form participation', async () => {
        const el = await mount('pdx-select', { name: 'color' });
        await tick(50);
        const hidden = el.querySelector('input[type="hidden"]') as HTMLInputElement;
        expect(hidden).toBeTruthy();
        expect(hidden?.name).toBe('color');
    });

    // ─── Opening / Closing ──────────────────────────

    it('opens dropdown on click', async () => {
        const el = await mount('pdx-select');
        setOptions(el, ['Red', 'Green', 'Blue']);
        await tick(50);

        const trigger = el.querySelector('.pdx-select-trigger') as HTMLElement;
        trigger.click();
        await tick(50);

        const dropdown = el.querySelector('.pdx-select-dropdown') as HTMLElement;
        expect(dropdown?.classList.contains('open')).toBe(true);
    });

    it('shows options in dropdown', async () => {
        const el = await mount('pdx-select');
        setOptions(el, ['Red', 'Green', 'Blue']);
        await tick(50);

        const trigger = el.querySelector('.pdx-select-trigger') as HTMLElement;
        trigger.click();
        await tick(50);

        const options = el.querySelectorAll('.pdx-select-option');
        expect(options.length).toBe(3);
        expect(options[0].textContent).toContain('Red');
        expect(options[1].textContent).toContain('Green');
        expect(options[2].textContent).toContain('Blue');
    });

    it('does not open when disabled', async () => {
        const el = await mount('pdx-select', { disabled: '' });
        setOptions(el, ['Red', 'Green']);
        await tick(50);

        const trigger = el.querySelector('.pdx-select-trigger') as HTMLElement;
        trigger.click();
        await tick(50);

        const dropdown = el.querySelector('.pdx-select-dropdown') as HTMLElement;
        expect(dropdown?.classList.contains('open')).toBe(false);
    });

    // ─── Selection (single) ─────────────────────���────

    it('selects an option on click', async () => {
        const el = await mount('pdx-select');
        setOptions(el, ['Red', 'Green', 'Blue']);
        await tick(50);

        let changeEvent: any = null;
        el.addEventListener('pdx-change', (e: any) => { changeEvent = e.detail; });

        // Open
        const trigger = el.querySelector('.pdx-select-trigger') as HTMLElement;
        trigger.click();
        await tick(50);

        // Click first option
        const option = el.querySelector('.pdx-select-option') as HTMLElement;
        option.click();
        await tick(50);

        expect(changeEvent).toBeTruthy();
        expect(changeEvent.value).toBe('Red');
    });

    // ─── UI-03: readable value getter after selection ─────────

    it('reflects the chosen value on el.value after click', async () => {
        const el = await mount('pdx-select');
        setOptions(el, ['Red', 'Green', 'Blue']);
        await tick(50);

        (el.querySelector('.pdx-select-trigger') as HTMLElement).click();
        await tick(50);
        (el.querySelectorAll('.pdx-select-option')[1] as HTMLElement).click();
        await tick(50);

        // Previously the value lived only in pdx-change.detail; now el.value is readable.
        expect((el as any).value).toBe('Green');
    });

    it('exposes selectedItem (raw object) after click', async () => {
        const el = await mount('pdx-select');
        setOptions(el, [
            { label: 'Red', value: 'r' },
            { label: 'Green', value: 'g' },
        ]);
        await tick(50);

        (el.querySelector('.pdx-select-trigger') as HTMLElement).click();
        await tick(50);
        (el.querySelectorAll('.pdx-select-option')[1] as HTMLElement).click();
        await tick(50);

        expect((el as any).value).toBe('g');
        expect((el as any).selectedItem).toEqual({ label: 'Green', value: 'g' });
    });

    it('clears el.value when selection is cleared', async () => {
        const el = await mount('pdx-select', { clearable: '' });
        setOptions(el, ['Red', 'Green']);
        await tick(50);

        (el.querySelector('.pdx-select-trigger') as HTMLElement).click();
        await tick(50);
        (el.querySelector('.pdx-select-option') as HTMLElement).click();
        await tick(50);
        expect((el as any).value).toBe('Red');

        (el.querySelector('.pdx-input-clear') as HTMLElement).click();
        await tick(50);
        expect((el as any).value == null || (el as any).value === '').toBe(true);
    });

    it('reflects multi-select values as array on el.value', async () => {
        const el = await mount('pdx-select', { multiple: '' });
        setOptions(el, ['Red', 'Green', 'Blue']);
        await tick(50);

        (el.querySelector('.pdx-select-trigger') as HTMLElement).click();
        await tick(50);
        const opts = el.querySelectorAll('.pdx-select-option');
        (opts[0] as HTMLElement).click();
        (opts[2] as HTMLElement).click();
        await tick(50);

        // A real array, not a comma-joined string: consistent with pdx-change.detail.values
        // and with no loss of type for numeric values.
        expect((el as any).value).toEqual(['Red', 'Blue']);
        expect((el as any).selectedItem).toEqual(['Red', 'Blue']);
    });

    it('still honours external one-way el.value = x (set then read)', async () => {
        const el = await mount('pdx-select');
        setOptions(el, ['Red', 'Green', 'Blue']);
        await tick(50);

        (el as any).value = 'Blue';
        await tick(50);

        // External set drives the displayed selection (UI-01 prop reactivity)…
        const valueLabel = el.querySelector('.pdx-select-value');
        expect(valueLabel?.textContent).toContain('Blue');
        // …and remains readable.
        expect((el as any).value).toBe('Blue');
    });

    it('closes dropdown after single selection', async () => {
        const el = await mount('pdx-select');
        setOptions(el, ['Red', 'Green']);
        await tick(50);

        const trigger = el.querySelector('.pdx-select-trigger') as HTMLElement;
        trigger.click();
        await tick(50);

        const option = el.querySelector('.pdx-select-option') as HTMLElement;
        option.click();
        await tick(50);

        const dropdown = el.querySelector('.pdx-select-dropdown') as HTMLElement;
        expect(dropdown?.classList.contains('open')).toBe(false);
    });

    it('displays selected value label', async () => {
        const el = await mount('pdx-select');
        setOptions(el, ['Red', 'Green', 'Blue']);
        await tick(50);

        // Open and select
        (el.querySelector('.pdx-select-trigger') as HTMLElement).click();
        await tick(50);
        (el.querySelector('.pdx-select-option') as HTMLElement).click();
        await tick(50);

        const valueEl = el.querySelector('.pdx-select-value');
        expect(valueEl?.textContent).toContain('Red');
    });

    // ─── Clearable ──────────────────────────────────

    it('shows clear button when clearable and has value', async () => {
        const el = await mount('pdx-select', { clearable: '' });
        setOptions(el, ['Red', 'Green']);
        (el as any).value = 'Red';
        await tick(50);

        // Open and select to set value
        (el.querySelector('.pdx-select-trigger') as HTMLElement).click();
        await tick(50);
        (el.querySelector('.pdx-select-option') as HTMLElement).click();
        await tick(50);

        const clear = el.querySelector('.pdx-input-clear');
        expect(clear).toBeTruthy();
    });

    it('clears selection on clear button click', async () => {
        const el = await mount('pdx-select', { clearable: '' });
        setOptions(el, ['Red', 'Green']);
        await tick(50);

        // Select first
        (el.querySelector('.pdx-select-trigger') as HTMLElement).click();
        await tick(50);
        (el.querySelector('.pdx-select-option') as HTMLElement).click();
        await tick(50);

        let changeEvent: any = null;
        el.addEventListener('pdx-change', (e: any) => { changeEvent = e.detail; });

        // Click clear
        const clear = el.querySelector('.pdx-input-clear') as HTMLElement;
        clear.click();
        await tick(50);

        expect(changeEvent).toBeTruthy();
        expect(changeEvent.value).toBe(null);
    });

    // ─── Multiple ────────────��─────────────────────

    it('renders chips for multiple selection', async () => {
        const el = await mount('pdx-select', { multiple: '' });
        setOptions(el, ['Red', 'Green', 'Blue']);
        await tick(50);

        // Open and select two items
        (el.querySelector('.pdx-select-trigger') as HTMLElement).click();
        await tick(50);

        const options = el.querySelectorAll('.pdx-select-option');
        (options[0] as HTMLElement).click();
        await tick(50);
        // Open again (dropdown stays open in multiple mode)
        (options[1] as HTMLElement).click();
        await tick(50);

        const chips = el.querySelectorAll('.pdx-chip');
        expect(chips.length).toBe(2);
    });

    it('keeps dropdown open after selection in multiple mode', async () => {
        const el = await mount('pdx-select', { multiple: '' });
        setOptions(el, ['Red', 'Green']);
        await tick(50);

        (el.querySelector('.pdx-select-trigger') as HTMLElement).click();
        await tick(50);

        (el.querySelector('.pdx-select-option') as HTMLElement).click();
        await tick(50);

        const dropdown = el.querySelector('.pdx-select-dropdown') as HTMLElement;
        expect(dropdown?.classList.contains('open')).toBe(true);
    });

    it('emits values array in multiple mode', async () => {
        const el = await mount('pdx-select', { multiple: '' });
        setOptions(el, ['Red', 'Green', 'Blue']);
        await tick(50);

        let changeEvent: any = null;
        el.addEventListener('pdx-change', (e: any) => { changeEvent = e.detail; });

        (el.querySelector('.pdx-select-trigger') as HTMLElement).click();
        await tick(50);

        const options = el.querySelectorAll('.pdx-select-option');
        (options[0] as HTMLElement).click();
        await tick(50);

        expect(changeEvent.values).toBeTruthy();
        expect(changeEvent.values).toContain('Red');
    });

    // ─── Keyboard ───────────────────��──────────────

    it('opens on Enter key', async () => {
        const el = await mount('pdx-select');
        setOptions(el, ['Red', 'Green']);
        await tick(50);

        const trigger = el.querySelector('.pdx-select-trigger') as HTMLElement;
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await tick(50);

        const dropdown = el.querySelector('.pdx-select-dropdown') as HTMLElement;
        expect(dropdown?.classList.contains('open')).toBe(true);
    });

    it('opens on ArrowDown key', async () => {
        const el = await mount('pdx-select');
        setOptions(el, ['Red', 'Green']);
        await tick(50);

        const trigger = el.querySelector('.pdx-select-trigger') as HTMLElement;
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await tick(50);

        const dropdown = el.querySelector('.pdx-select-dropdown') as HTMLElement;
        expect(dropdown?.classList.contains('open')).toBe(true);
    });

    it('closes on Escape key', async () => {
        const el = await mount('pdx-select');
        setOptions(el, ['Red', 'Green']);
        await tick(50);

        const trigger = el.querySelector('.pdx-select-trigger') as HTMLElement;
        trigger.click();
        await tick(50);

        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await tick(50);

        const dropdown = el.querySelector('.pdx-select-dropdown') as HTMLElement;
        expect(dropdown?.classList.contains('open')).toBe(false);
    });

    it('selects active item with Enter', async () => {
        const el = await mount('pdx-select');
        setOptions(el, ['Red', 'Green', 'Blue']);
        await tick(50);

        let changeEvent: any = null;
        el.addEventListener('pdx-change', (e: any) => { changeEvent = e.detail; });

        const trigger = el.querySelector('.pdx-select-trigger') as HTMLElement;
        // ↓ opens on the first option (APG select-only), ↓ moves on
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await tick(50);
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await tick(50);
        // Select
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await tick(50);

        expect(changeEvent).toBeTruthy();
        expect(changeEvent.value).toBe('Green');
    });

    // ─── ARIA ────────────────��─────────────────────

    it('has aria-haspopup=listbox', async () => {
        const el = await mount('pdx-select');
        await tick(50);

        const trigger = el.querySelector('.pdx-select-trigger');
        expect(trigger?.getAttribute('aria-haspopup')).toBe('listbox');
    });

    it('sets aria-expanded on open', async () => {
        const el = await mount('pdx-select');
        setOptions(el, ['Red']);
        await tick(50);

        const trigger = el.querySelector('.pdx-select-trigger') as HTMLElement;
        expect(trigger.getAttribute('aria-expanded')).toBe('false');

        trigger.click();
        await tick(50);

        expect(trigger.getAttribute('aria-expanded')).toBe('true');
    });

    it('options have role=option', async () => {
        const el = await mount('pdx-select');
        setOptions(el, ['Red', 'Green']);
        await tick(50);

        (el.querySelector('.pdx-select-trigger') as HTMLElement).click();
        await tick(50);

        const options = el.querySelectorAll('[role="option"]');
        expect(options.length).toBe(2);
    });

    it('listbox has role=listbox', async () => {
        const el = await mount('pdx-select');
        setOptions(el, ['Red']);
        await tick(50);

        const listbox = el.querySelector('[role="listbox"]');
        expect(listbox).toBeTruthy();
    });

    it('sets aria-selected on selected option', async () => {
        const el = await mount('pdx-select');
        setOptions(el, ['Red', 'Green']);
        await tick(50);

        (el.querySelector('.pdx-select-trigger') as HTMLElement).click();
        await tick(50);
        (el.querySelector('.pdx-select-option') as HTMLElement).click();
        await tick(50);

        // Re-open to check
        (el.querySelector('.pdx-select-trigger') as HTMLElement).click();
        await tick(50);

        const selected = el.querySelector('[aria-selected="true"]');
        expect(selected).toBeTruthy();
        expect(selected?.textContent).toContain('Red');
    });

    it('sets role=combobox on the search input when searchable, and only there', async () => {
        // The element that takes focus is the combobox, and only it: were the wrapper around the
        // input one too, a searchable select would be a combobox inside a combobox.
        const el = await mount('pdx-select', { searchable: '' });
        await tick(50);

        expect(el.querySelector('input.pdx-select-search')?.getAttribute('role')).toBe('combobox');
        expect(el.querySelectorAll('[role="combobox"]')).toHaveLength(1);
    });

    it('sets aria-multiselectable when multiple', async () => {
        const el = await mount('pdx-select', { multiple: '' });
        setOptions(el, ['Red']);
        await tick(50);

        const listbox = el.querySelector('[role="listbox"]');
        expect(listbox?.getAttribute('aria-multiselectable')).toBe('true');
    });

    // ─── Object Data ──────────────────��─────────────

    it('works with object options and labelField/valueField', async () => {
        const el = await mount('pdx-select');
        (el as any).labelField = 'name';
        (el as any).valueField = 'id';
        setOptions(el, [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
        ]);
        await tick(50);

        (el.querySelector('.pdx-select-trigger') as HTMLElement).click();
        await tick(50);

        const options = el.querySelectorAll('.pdx-select-option');
        expect(options.length).toBe(2);
        expect(options[0].textContent).toContain('Alice');
    });

    // ─── CSS Classes ───────────────────────────���────

    it('applies size class', async () => {
        const el = await mount('pdx-select', { size: 'lg' });
        await tick(50);

        const trigger = el.querySelector('.pdx-select-trigger');
        expect(trigger?.classList.contains('pdx-input-lg')).toBe(true);
    });

    it('applies error state class', async () => {
        const el = await mount('pdx-select', { error: '' });
        await tick(50);

        const trigger = el.querySelector('.pdx-select-trigger');
        expect(trigger?.classList.contains('error')).toBe(true);
    });

    it('applies disabled state class', async () => {
        const el = await mount('pdx-select', { disabled: '' });
        await tick(50);

        const trigger = el.querySelector('.pdx-select-trigger');
        expect(trigger?.classList.contains('disabled')).toBe(true);
    });

    // ─── Empty state ─────────────��──────────────────

    it('shows empty message when no options match', async () => {
        const el = await mount('pdx-select');
        setOptions(el, []);
        await tick(50);

        (el.querySelector('.pdx-select-trigger') as HTMLElement).click();
        await tick(50);

        const empty = el.querySelector('.pdx-select-empty');
        expect(empty).toBeTruthy();
        expect(empty?.textContent).toContain('No results');
    });

    // ─── Groups ─────────────────────────────────────

    it('renders group headers', async () => {
        const el = await mount('pdx-select');
        (el as any).groupField = 'category';
        (el as any).labelField = 'name';
        (el as any).valueField = 'id';
        setOptions(el, [
            { id: 1, name: 'Apple', category: 'Fruit' },
            { id: 2, name: 'Banana', category: 'Fruit' },
            { id: 3, name: 'Carrot', category: 'Vegetable' },
        ]);
        await tick(50);

        (el.querySelector('.pdx-select-trigger') as HTMLElement).click();
        await tick(50);

        const headers = el.querySelectorAll('.pdx-select-group-header');
        expect(headers.length).toBe(2);
        expect(headers[0].textContent).toContain('Fruit');
        expect(headers[1].textContent).toContain('Vegetable');
    });
});
