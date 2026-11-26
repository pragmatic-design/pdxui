// A key typed in the search field of a closed searchable pdx-select is kept, and filters the list.
//
// The field's focus opens the list, but Escape closes it and leaves the focus where it is: the next
// key reaches a closed select. Its input handler wrote the query, then opened the list, and opening
// empties the query — so the key the user typed was dropped, and the list showed every option.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/select/pdx-select.pdx';

beforeEach(cleanup);

const options = (el: HTMLElement): string[] =>
    [...el.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim() ?? '');

describe('pdx-select searchable — typing after the list was closed', () => {
    it('keeps the key typed, and the list shows what matches it', async () => {
        const el = await mount('pdx-select', { searchable: '' });
        (el as unknown as { options: string[] }).options = ['Rossi', 'Verdi'];
        await tick(50);
        const search = el.querySelector<HTMLInputElement>('input.pdx-select-search')!;
        search.focus();
        search.dispatchEvent(new FocusEvent('focus'));
        await tick(50);
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await tick(50);
        expect(el.querySelector('[role="combobox"]')?.getAttribute('aria-expanded'), 'Escape did not close the list').toBe('false');

        search.value = 'V';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        await tick(50);
        expect(el.querySelector('[role="combobox"]')?.getAttribute('aria-expanded')).toBe('true');
        expect(search.value, 'the key typed was dropped').toBe('V');
        expect(options(el), 'the list does not filter by the key typed').toEqual(['Verdi']);
    });

    it('control — typing while the list is open filters it', async () => {
        const el = await mount('pdx-select', { searchable: '' });
        (el as unknown as { options: string[] }).options = ['Rossi', 'Verdi'];
        await tick(50);
        const search = el.querySelector<HTMLInputElement>('input.pdx-select-search')!;
        search.focus();
        search.dispatchEvent(new FocusEvent('focus'));
        await tick(50);
        // "Ross", not "R": Verdi has an r too.
        search.value = 'Ross';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        await tick(50);
        expect(options(el)).toEqual(['Rossi']);
    });
});
