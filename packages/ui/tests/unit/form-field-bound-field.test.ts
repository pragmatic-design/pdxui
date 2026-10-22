// `<pdx-form-field :field="f.email">` with `<pdx-input ::value="f.email">` (#128, steps 2 and 3).
//
// No `name`, no `<pdx-form>`: the field object is handed to both. Typing an invalid email and leaving
// the input shows the field's error under it and marks the input aria-invalid; the label carries the
// required marker the schema asks for.

import { describe, it, expect, beforeEach } from 'vitest';
import { html, createForm, required, email } from '@pdxui/core';
import '../../src/form-field/pdx-form-field';
import '../../src/input/pdx-input';
import { cleanup, tick } from './helpers';

function signup() {
    return createForm({ initialValues: { email: '' }, validators: { email: [required('Required'), email('Not an email')] } });
}

async function mount(f: ReturnType<typeof signup>): Promise<HTMLElement> {
    const host = document.createElement('div');
    host.appendChild(html`<pdx-form-field label="Email" :field=${f.email}><pdx-input ::value=${f.email}></pdx-input></pdx-form-field>`);
    document.body.appendChild(host);
    await tick(); await tick();
    return host;
}

function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('a form field bound by :field and ::value', () => {
    beforeEach(() => cleanup());

    it('typing an invalid email and leaving shows the error, and marks the input', async () => {
        const f = signup();
        const host = await mount(f);
        const input = host.querySelector('pdx-input input') as HTMLInputElement;
        type(input, 'nope');
        await tick();
        expect(f.email.value()).toBe('nope');
        expect(host.querySelector('.pdx-form-field.has-error'), 'shown before the input was left').toBeNull();
        input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
        await tick(); await tick();
        expect(f.email.touched()).toBe(true);
        expect(host.querySelector('.pdx-form-field.has-error')).not.toBeNull();
        expect(host.textContent).toContain('Not an email');
        expect(input.getAttribute('aria-invalid')).toBe('true');
    });

    it('marks the field required from the schema, on the label and the input', async () => {
        const host = await mount(signup());
        await tick();
        const input = host.querySelector('pdx-input input') as HTMLInputElement;
        expect(input.getAttribute('aria-required')).toBe('true');
        // The marker is the class's `::after`, which happy-dom does not compute: the class is the signal.
        expect(host.querySelector('label.pdx-field-label.pdx-field-required')).not.toBeNull();
    });
});
