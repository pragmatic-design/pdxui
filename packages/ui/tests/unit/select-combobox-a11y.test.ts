// pdx-select is one combobox contract, named by its label, with the highlighted option announced and
// type-ahead on the closed trigger.
//
// The plain trigger is a combobox too, so the component announces the same thing whatever
// `searchable` says; ↓ moves a highlight that aria-activedescendant announces, not one only sighted
// users can see; a searchable select is named by its label; typing a letter on a closed select
// picks the matching option.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/select/pdx-select';
import '../../src/form-field/pdx-form-field';
import '../../src/label/pdx-label';

beforeEach(cleanup);

const COLORS = ['Red', 'Green', 'Blue'];

async function select(attrs: Record<string, string> = {}, options: unknown[] = COLORS): Promise<HTMLElement> {
    const el = await mount('pdx-select', attrs);
    (el as unknown as { options: unknown[] }).options = options;
    await tick(50);
    return el;
}

function key(target: Element, k: string): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

/** The element with role="combobox" — the one that takes focus. */
const combobox = (el: Element): HTMLElement => {
    const cb = el.querySelector<HTMLElement>('[role="combobox"]');
    expect(cb, 'no element has role="combobox"').toBeTruthy();
    return cb!;
};

/** The option aria-activedescendant points at, or null. */
function activeOption(cb: HTMLElement): HTMLElement | null {
    const id = cb.getAttribute('aria-activedescendant');
    return id ? document.getElementById(id) : null;
}

/** The accessible name from aria-label, aria-labelledby, or a <label for>; '' when none. */
function nameOf(cb: HTMLElement): string {
    const own = cb.getAttribute('aria-label');
    if (own) return own;
    const by = cb.getAttribute('aria-labelledby');
    if (by) return by.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() ?? '').join(' ').trim();
    if (cb.id) {
        const lbl = document.querySelector(`label[for="${cb.id}"]`);
        if (lbl) return lbl.textContent?.trim() ?? '';
    }
    return '';
}

describe('pdx-select: one combobox contract', () => {
    it('the plain trigger is a combobox: ↓ opens on the first option and ↓ moves to the second', async () => {
        const el = await select();
        const cb = combobox(el);
        expect(cb.classList.contains('pdx-select-trigger')).toBe(true);
        expect(cb.getAttribute('tabindex')).toBe('0');
        cb.focus();
        key(cb, 'ArrowDown');
        await tick(20);
        expect(cb.getAttribute('aria-expanded')).toBe('true');
        expect(document.getElementById(cb.getAttribute('aria-controls')!)?.getAttribute('role')).toBe('listbox');
        expect(activeOption(cb)?.textContent?.trim()).toBe('Red');
        key(cb, 'ArrowDown');
        await tick(20);
        expect(activeOption(cb)?.textContent?.trim()).toBe('Green');
    });

    it('opening with a value highlights the selected option', async () => {
        const el = await select({ value: 'Blue' });
        const cb = combobox(el);
        key(cb, 'ArrowDown');
        await tick(20);
        expect(activeOption(cb)?.textContent?.trim()).toBe('Blue');
    });

    it('closed, it points at no option', async () => {
        const el = await select({ value: 'Blue' });
        expect(combobox(el).hasAttribute('aria-activedescendant')).toBe(false);
    });

    it('searchable: the search input is the combobox, and ↓ moves one option, not two', async () => {
        const el = await select({ searchable: '' });
        const cb = combobox(el);
        expect(cb.tagName).toBe('INPUT');
        expect(el.querySelector('.pdx-select-trigger')!.hasAttribute('role'), 'the wrapper is a second combobox').toBe(false);
        expect(cb.getAttribute('aria-autocomplete')).toBe('list');
        cb.focus();
        cb.dispatchEvent(new FocusEvent('focus'));
        await tick(20);
        expect(cb.getAttribute('aria-expanded')).toBe('true');
        expect(document.getElementById(cb.getAttribute('aria-controls')!)?.getAttribute('role')).toBe('listbox');
        key(cb, 'ArrowDown');
        await tick(20);
        expect(activeOption(cb)?.textContent?.trim()).toBe('Red');
    });

    it('searchable: Enter picks the option and the list stays closed', async () => {
        const el = await select({ searchable: '' });
        const cb = combobox(el);
        cb.focus();
        cb.dispatchEvent(new FocusEvent('focus'));
        await tick(20);
        key(cb, 'ArrowDown');
        key(cb, 'Enter');
        await tick(20);
        expect((el as unknown as { value: unknown }).value).toBe('Red');
        expect(cb.getAttribute('aria-expanded'), 'the bubbled Enter reopened the list').toBe('false');
    });

    it('multiple + searchable: the tag search input is the combobox', async () => {
        const el = await select({ searchable: '', multiple: '' });
        const cb = combobox(el);
        expect(cb.classList.contains('pdx-select-tag-search')).toBe(true);
        expect(cb.getAttribute('aria-controls')).toBeTruthy();
    });

    it('search in the dropdown: the closed trigger is a focusable combobox', async () => {
        const el = await select({ searchable: '', 'search-position': 'dropdown' });
        const cb = combobox(el);
        expect(cb.classList.contains('pdx-select-trigger')).toBe(true);
        expect(cb.getAttribute('tabindex'), 'nothing could take focus while closed').toBe('0');
    });
});

describe('pdx-select: named by its label, not by its value', () => {
    it('the label prop names the combobox, plain and searchable', async () => {
        const plain = await select({ label: 'Color', value: 'Red' });
        expect(nameOf(combobox(plain))).toBe('Color');
        const searchable = await select({ label: 'Fruit', searchable: '' });
        expect(nameOf(combobox(searchable))).toBe('Fruit');
    });

    it('inside <pdx-form-field label="Fruit">, a searchable select is named Fruit', async () => {
        document.body.innerHTML = '<pdx-form-field label="Fruit"><pdx-select searchable></pdx-select></pdx-form-field>';
        await tick(50);
        await tick(50);
        expect(nameOf(combobox(document.body))).toBe('Fruit');
    });

    it('inside <pdx-form-field label="Role">, a plain select is named Role', async () => {
        document.body.innerHTML = '<pdx-form-field label="Role"><pdx-select placeholder="Pick one"></pdx-select></pdx-form-field>';
        await tick(50);
        await tick(50);
        expect(nameOf(combobox(document.body))).toBe('Role');
    });

    it('a <label for> the host names the combobox, not only the host', async () => {
        document.body.innerHTML = '<label for="size-select">Size</label><pdx-select id="size-select" placeholder="Pick one"></pdx-select>';
        await tick(50);
        await tick(50);
        expect(nameOf(combobox(document.body))).toBe('Size');
    });

    it('after a <pdx-label>, a plain select is named by it', async () => {
        document.body.innerHTML = '<pdx-label text="Country"></pdx-label><pdx-select placeholder="Pick one"></pdx-select>';
        await tick(50);
        await tick(50);
        expect(nameOf(combobox(document.body))).toBe('Country');
    });
});

describe('pdx-select: type-ahead on the trigger', () => {
    it('closed, showing Red: "b" picks Blue and emits pdx-change', async () => {
        const el = await select({ value: 'Red' });
        const changes: unknown[] = [];
        el.addEventListener('pdx-change', (e) => changes.push((e as CustomEvent).detail.value));
        key(combobox(el), 'b');
        await tick(20);
        expect((el as unknown as { value: unknown }).value).toBe('Blue');
        expect(changes).toEqual(['Blue']);
        expect(combobox(el).getAttribute('aria-expanded'), 'type-ahead on a closed select does not open it').toBe('false');
    });

    it('open: a letter moves the highlight and leaves the value alone', async () => {
        const el = await select({ value: 'Red' });
        const cb = combobox(el);
        key(cb, 'ArrowDown');
        key(cb, 'g');
        await tick(20);
        expect(activeOption(cb)?.textContent?.trim()).toBe('Green');
        expect((el as unknown as { value: unknown }).value).toBe('Red');
    });

    it('a letter moves to the NEXT option that starts with it, and cycles (APG)', async () => {
        const el = await select({}, ['Banana', 'Blueberry', 'Cherry']);
        const cb = combobox(el);
        key(cb, 'ArrowDown');                     // opens on Banana
        key(cb, 'b');
        await tick(20);
        expect(activeOption(cb)?.textContent?.trim()).toBe('Blueberry');
        key(cb, 'b');
        await tick(20);
        expect(activeOption(cb)?.textContent?.trim()).toBe('Banana');
    });

    it('letters typed together match a prefix, not the first letter again', async () => {
        const el = await select({}, ['Black', 'Blue', 'Brown']);
        const cb = combobox(el);
        key(cb, 'b');
        key(cb, 'r');
        await tick(20);
        expect((el as unknown as { value: unknown }).value).toBe('Brown');
    });

    it('a searchable select types into its search, not a type-ahead', async () => {
        const el = await select({ searchable: '', value: 'Red' });
        key(combobox(el), 'b');
        await tick(20);
        expect((el as unknown as { value: unknown }).value).toBe('Red');
    });
});
