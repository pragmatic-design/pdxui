// Focusing the search field of a searchable pdx-select opens the list without throwing.
//
// A focus handler that faked a click — `onTriggerClick(new Event('click'))` — would pass an event that
// was never dispatched, whose `target` is null, and `onTriggerClick` reads `target.closest(…)` first:
// every focus would throw «Cannot read properties of null (reading 'closest')». The list opens anyway,
// so no assertion on the open state sees it; only a global error collector does.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/select/pdx-select';

let errors: unknown[] = [];
const onError = (e: ErrorEvent): void => { errors.push(e.error ?? e.message); };

beforeEach(() => {
    cleanup();
    errors = [];
    window.addEventListener('error', onError);
});
afterEach(() => { window.removeEventListener('error', onError); });

async function searchableSelect(attrs: Record<string, string> = {}): Promise<HTMLElement> {
    const el = await mount('pdx-select', { searchable: '', ...attrs });
    (el as unknown as { options: string[] }).options = ['Rossi', 'Bianchi'];
    await tick(50);
    return el;
}

const isOpen = (el: HTMLElement): boolean =>
    !!el.querySelector('.pdx-select-dropdown')?.classList.contains('open');

describe('pdx-select searchable — focusing the search field', () => {
    it('opens the list, and nothing is thrown', async () => {
        const el = await searchableSelect();
        const search = el.querySelector<HTMLInputElement>('input.pdx-select-search');
        expect(search, 'the searchable select rendered no search input').toBeTruthy();
        search!.focus();
        search!.dispatchEvent(new FocusEvent('focus'));
        await tick(50);
        expect(isOpen(el)).toBe(true);
        expect(errors, 'the focus handler threw').toEqual([]);
    });

    it('a mouse click on the search field — focus, then click — leaves the list open', async () => {
        // The browser's order. The click bubbles to the trigger, whose handler toggles: once the
        // focus opens the list, a toggle there would close it again at once.
        const el = await searchableSelect();
        const search = el.querySelector<HTMLInputElement>('input.pdx-select-search')!;
        search.focus();
        search.dispatchEvent(new FocusEvent('focus'));
        search.click();
        await tick(50);
        expect(isOpen(el), 'the click right after the focus closed the list').toBe(true);
        expect(errors).toEqual([]);
    });

    it('the control: clicking the clear button still does not open the list', async () => {
        const el = await searchableSelect({ clearable: '' });
        (el as unknown as { value: string }).value = 'Rossi';
        await tick(50);
        const clear = el.querySelector<HTMLButtonElement>('.pdx-input-clear');
        expect(clear, 'no clear button with a value selected').toBeTruthy();
        clear!.click();
        await tick(50);
        expect(isOpen(el)).toBe(false);
        expect(errors).toEqual([]);
    });
});
