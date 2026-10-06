// Free text typed into pdx-autocomplete reaches the form.
//
// The component says its value is free text. Inside a pdx-form the compiler wires it by name, on
// `pdx-change` (codegen-form-binding.ts: autocomplete has no entry in `eventName`, so the default),
// with `e.detail?.value ?? e.target?.value`. If `pdx-change` came only on a pick, on clear, and on a
// forceSelection blur, text typed and never picked would never reach the form. The handler below is the one the compiler generates, written out.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createForm } from '@pdxui/core';
import { cleanup, tick } from './helpers';
import '../../src/autocomplete/pdx-autocomplete';

type Ac = HTMLElement & { suggestions: unknown[]; value: string };

async function wired(suggestions: unknown[] = ['Rome', 'Milan']) {
    const form = createForm<{ city: string }>({ initialValues: { city: '' } });
    const ac = document.createElement('pdx-autocomplete') as Ac;
    ac.setAttribute('name', 'city');
    document.body.appendChild(ac);
    await tick(20);
    ac.suggestions = suggestions;
    // What the compiler injects for a control it does not know as a text input.
    ac.addEventListener('pdx-change', ((e: CustomEvent) =>
        form.fields.city.onChange(e.detail?.value ?? (e.target as Ac).value)) as EventListener);
    await tick();
    return { form, ac, input: ac.querySelector('input') as HTMLInputElement };
}

function type(input: HTMLInputElement, text: string): void {
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function blur(input: HTMLInputElement): Promise<void> {
    input.blur();
    input.dispatchEvent(new FocusEvent('blur'));
    await tick(200); // the component closes 150 ms after a blur, so a click on an option still lands
}

describe('pdx-autocomplete free text in a form', () => {
    beforeEach(cleanup);

    it('text typed and never picked reaches the form once the field is left', async () => {
        const { form, input } = await wired();
        type(input, 'Xyz');
        await blur(input);
        await vi.waitFor(() => expect(form.getValues().city).toBe('Xyz'));
    });

    it('Enter with no option chosen commits the text as typed', async () => {
        const { form, input } = await wired();
        type(input, 'Xyz');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await vi.waitFor(() => expect(form.getValues().city).toBe('Xyz'));
    });

    it('one commit per edit: leaving the field again announces nothing new', async () => {
        const { ac, input } = await wired();
        const changes: unknown[] = [];
        ac.addEventListener('pdx-change', (e) => changes.push((e as CustomEvent).detail));
        type(input, 'Xyz');
        await blur(input);
        input.focus();
        await blur(input);
        expect(changes).toEqual([{ value: 'Xyz', label: 'Xyz', item: null }]);
    });

    it('a pick is not announced a second time when the field is left', async () => {
        const { ac, input } = await wired();
        const changes: unknown[] = [];
        ac.addEventListener('pdx-change', (e) => changes.push((e as CustomEvent).detail));
        type(input, 'ro');
        await vi.waitFor(() => expect(ac.querySelectorAll('[role="option"]')).toHaveLength(1));
        (ac.querySelector('[role="option"]') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        await blur(input);
        expect(changes).toHaveLength(1);
    });

    it('a value set from outside is not announced back when the field is left', async () => {
        const { ac, input } = await wired();
        const changes: unknown[] = [];
        ac.addEventListener('pdx-change', (e) => changes.push((e as CustomEvent).detail));
        ac.value = 'Turin';
        await tick();
        input.focus();
        await blur(input);
        expect(changes).toEqual([]);
    });

    it('the control: a picked suggestion reaches the form, as it always did', async () => {
        const { form, ac, input } = await wired();
        type(input, 'ro');
        await vi.waitFor(() => expect(ac.querySelectorAll('[role="option"]')).toHaveLength(1));
        (ac.querySelector('[role="option"]') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        await vi.waitFor(() => expect(form.getValues().city).toBe('Rome'));
    });
});
