// A single-value lookup in pdx-form-template shows its options.
//
// The template builds a pdx-autocomplete for `type: 'lookup'`, and pdx-autocomplete reads
// `suggestions`: options handed over as `options` — from `optionsSource` or static — are an expando
// nobody reads, and typing «ro» in a «City» lookup lists nothing. The multi-value lookup builds a
// pdx-select, which does read `options`.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/form-template/pdx-form-template';

const CITIES = [
    { label: 'Roma', value: 'rm' },
    { label: 'Milano', value: 'mi' },
    { label: 'Torino', value: 'to' },
];

async function mountForm(schema: unknown): Promise<HTMLElement> {
    const el = document.createElement('pdx-form-template') as HTMLElement & { schema: unknown; showActions: boolean };
    document.body.appendChild(el);
    await tick();
    el.showActions = false;
    el.schema = schema;
    await tick(20);
    return el;
}

type Autocomplete = HTMLElement & { suggestions: { label: string; value: unknown }[] };

/** Type into the autocomplete's input, as a user does. */
function type(ac: HTMLElement, text: string): void {
    const input = ac.querySelector('input') as HTMLInputElement;
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

const listed = (ac: HTMLElement) => [...ac.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim());

describe('pdx-form-template single-value lookup', () => {
    beforeEach(cleanup);

    it('with optionsSource: the loader\'s items reach the autocomplete, and typing lists the matches', async () => {
        const loader = vi.fn(async (q: string) => CITIES.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())));
        const el = await mountForm({ fields: [{ name: 'city', type: 'lookup', label: 'City', optionsSource: loader }] });
        const ac = el.querySelector('pdx-autocomplete') as Autocomplete;
        expect(ac, 'a single-value lookup is a pdx-autocomplete').toBeTruthy();
        await vi.waitFor(() => expect(ac.suggestions.map((s) => s.label)).toEqual(['Roma', 'Milano', 'Torino']));

        type(ac, 'ro');
        await vi.waitFor(() => expect(loader).toHaveBeenCalledWith('ro'), { timeout: 2000 });
        await vi.waitFor(() => expect(listed(ac)).toContain('Roma'), { timeout: 2000 });
    });

    it('with static options: they reach the autocomplete as its suggestions', async () => {
        const el = await mountForm({ fields: [{ name: 'city', type: 'lookup', label: 'City', options: CITIES }] });
        const ac = el.querySelector('pdx-autocomplete') as Autocomplete;
        expect(ac.suggestions.map((s) => s.label)).toEqual(['Roma', 'Milano', 'Torino']);
        type(ac, 'mi');
        await vi.waitFor(() => expect(listed(ac)).toEqual(['Milano']), { timeout: 2000 });
    });

    it('the control: a multi-value lookup is a pdx-select and keeps reading options', async () => {
        const el = await mountForm({ fields: [{ name: 'cities', type: 'lookup', multiple: true, label: 'Cities', options: CITIES }] });
        const select = el.querySelector('pdx-select') as HTMLElement & { options: unknown[] };
        expect(select.options).toHaveLength(3);
        expect(el.querySelector('pdx-autocomplete')).toBeNull();
    });
});
