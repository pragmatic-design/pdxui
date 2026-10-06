// pdx-autocomplete emits its value field, and says when nothing matches.
//
// 1. With labelField="name" valueField="code", picking «Milan» emits the code, not the label: a
//    reader who sets value-field expects the code. `value` is the value field, `label` the label,
//    `item` the raw suggestion; the input — and the host's `value`, the text typed — show the label.
// 2. Typing «zzz» does not leave the popup closed and the status region empty. pdx-select says
//    "No results"; so does the autocomplete, in the list and in the status region.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/autocomplete/pdx-autocomplete';

type Ac = HTMLElement & { suggestions: unknown[]; value: string };

async function autocomplete(attrs: Record<string, string> = {}, suggestions: unknown[] = []): Promise<{ ac: Ac; input: HTMLInputElement }> {
    const ac = document.createElement('pdx-autocomplete') as Ac;
    for (const [k, v] of Object.entries(attrs)) ac.setAttribute(k, v);
    document.body.appendChild(ac);
    await tick(20);
    ac.suggestions = suggestions;
    await tick();
    return { ac, input: ac.querySelector('input') as HTMLInputElement };
}

function type(input: HTMLInputElement, text: string): void {
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function pick(ac: HTMLElement, label: string): void {
    const opt = [...ac.querySelectorAll('[role="option"]')].find((o) => o.textContent?.trim() === label) as HTMLElement;
    opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

const CITIES = [{ name: 'Milan', code: 'MXP' }, { name: 'Rome', code: 'FCO' }];

describe('pdx-autocomplete value field', () => {
    beforeEach(cleanup);

    it('picking an object suggestion emits its value field as value, and its label as label', async () => {
        const { ac, input } = await autocomplete({ 'label-field': 'name', 'value-field': 'code' }, CITIES);
        const changes: Record<string, unknown>[] = [];
        ac.addEventListener('pdx-change', (e) => changes.push((e as CustomEvent).detail));
        type(input, 'mi');
        await vi.waitFor(() => expect(ac.querySelectorAll('[role="option"]')).toHaveLength(1));
        pick(ac, 'Milan');
        expect(changes).toHaveLength(1);
        expect(changes[0]).toMatchObject({ value: 'MXP', label: 'Milan', item: { name: 'Milan', code: 'MXP' } });
        // The text shown, and the host's value (the text), stay the label.
        await tick();
        expect(input.value).toBe('Milan');
        expect(ac.value).toBe('Milan');
    });

    it('the control: string suggestions emit the string as value and label', async () => {
        const { ac, input } = await autocomplete({}, ['Apple', 'Banana']);
        const changes: Record<string, unknown>[] = [];
        ac.addEventListener('pdx-change', (e) => changes.push((e as CustomEvent).detail));
        type(input, 'ap');
        await vi.waitFor(() => expect(ac.querySelectorAll('[role="option"]')).toHaveLength(1));
        pick(ac, 'Apple');
        expect(changes[0]).toMatchObject({ value: 'Apple', label: 'Apple', item: 'Apple' });
    });
});

describe('pdx-autocomplete with nothing matching', () => {
    beforeEach(cleanup);

    it('a query that matches nothing shows "No results" in the list and in the status region', async () => {
        const { ac, input } = await autocomplete({}, ['Apple', 'Banana']);
        type(input, 'zzz');
        await vi.waitFor(() => expect(input.getAttribute('aria-expanded'), 'the popup stayed closed').toBe('true'));
        expect(ac.querySelector('.pdx-autocomplete-empty')?.textContent?.trim()).toBe('No results');
        expect(ac.querySelectorAll('[role="option"]')).toHaveLength(0);
        expect(ac.querySelector('[role="status"]')?.textContent?.trim()).toBe('No results');
    });

    it('the control: a query shorter than minLength opens nothing', async () => {
        const { ac, input } = await autocomplete({ 'min-length': '3' }, ['Apple']);
        type(input, 'zz');
        await tick();
        expect(input.getAttribute('aria-expanded')).toBe('false');
        expect(ac.querySelector('.pdx-autocomplete-empty')).toBeNull();
    });

    it('the control: typing on to a match replaces "No results" with the option', async () => {
        const { ac, input } = await autocomplete({}, ['Apple', 'Banana']);
        type(input, 'zzz');
        await vi.waitFor(() => expect(ac.querySelector('.pdx-autocomplete-empty')).not.toBeNull());
        type(input, 'ban');
        await vi.waitFor(() => expect(ac.querySelectorAll('[role="option"]')).toHaveLength(1));
        expect(ac.querySelector('.pdx-autocomplete-empty')).toBeNull();
    });
});
