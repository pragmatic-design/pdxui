// pdx-autocomplete opens its list when suggestions arrive after the user typed.
//
// Suggestions an app loads in a pdx-input handler — the usual async pattern, and what
// pdx-form-template's lookup does with optionsSource — arrive after the keystroke that asked for
// them. A list that opened on input only if matches were already there would find nothing, close,
// and never show the matches until the user typed again.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/autocomplete/pdx-autocomplete';

type Ac = HTMLElement & { suggestions: { label: string; value: string }[] };

async function autocomplete(): Promise<{ ac: Ac; input: HTMLInputElement }> {
    const ac = document.createElement('pdx-autocomplete') as Ac;
    document.body.appendChild(ac);
    await tick(20);
    return { ac, input: ac.querySelector('input') as HTMLInputElement };
}

function type(input: HTMLInputElement, text: string): void {
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

const expanded = (input: HTMLInputElement) => input.getAttribute('aria-expanded');
const listed = (ac: HTMLElement) => [...ac.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim());

describe('pdx-autocomplete: suggestions that arrive after typing', () => {
    beforeEach(cleanup);

    it('the matches show when they arrive while the field has focus', async () => {
        const { ac, input } = await autocomplete();
        type(input, 'ro');
        await tick();
        // Nothing yet: the list is open and says so, rather than closed and silent.
        expect(listed(ac), 'nothing to show yet').toEqual([]);

        ac.suggestions = [{ label: 'Roma', value: 'rm' }, { label: 'Milano', value: 'mi' }];
        await vi.waitFor(() => expect(listed(ac), 'the arrived matches did not show').toEqual(['Roma']));
        expect(expanded(input)).toBe('true');
    });

    it('the control: choosing an item closes the list, and it stays closed', async () => {
        const { ac, input } = await autocomplete();
        type(input, 'ro');
        ac.suggestions = [{ label: 'Roma', value: 'rm' }, { label: 'Rovigo', value: 'ro' }];
        await vi.waitFor(() => expect(expanded(input)).toBe('true'));
        (ac.querySelector('[role="option"]') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        (ac.querySelector('[role="option"]') as HTMLElement).click();
        await tick(30);
        expect(input.value).toBe('Roma');
        expect(expanded(input), 'choosing reopened the list').toBe('false');
    });

    it('the control: suggestions that match nothing list nothing, and say "No results"', async () => {
        const { ac, input } = await autocomplete();
        type(input, 'zz');
        ac.suggestions = [{ label: 'Roma', value: 'rm' }];
        await tick();
        expect(listed(ac)).toEqual([]);
        expect(ac.querySelector('.pdx-autocomplete-empty')?.textContent?.trim()).toBe('No results');
    });

    it('the control: suggestions set while the field is not focused do not open it', async () => {
        const { ac, input } = await autocomplete();
        type(input, 'ro');
        input.blur();
        await tick(250);
        ac.suggestions = [{ label: 'Roma', value: 'rm' }];
        await tick();
        expect(expanded(input)).toBe('false');
    });
});
