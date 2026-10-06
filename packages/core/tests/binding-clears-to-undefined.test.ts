// A reactive `:prop` that returns to null/undefined has to CLEAR the property, not just drop the
// attribute.
//
// The symptom it prevents: a validation error that stays on screen after the field is corrected,
// while the form model has cleared it.
//
// On a custom element, a `v == null` branch that only does this changes nothing:
//
//     } else if (v == null) {
//         el.removeAttribute(prop);          // on a custom element this changes nothing
//     }
//
// A custom element's props are signal-backed and are written as PROPERTIES. Removing the attribute
// leaves the property — and the signal behind it — holding the previous value, so the transition back
// to "no value" would be the one transition that never propagates. `pdx-form-field` would go on
// rendering the message it had been handed once.
//
// It is not a form defect: it is every `:prop` on every component, whenever a value goes away.
//
// The `removeAttribute` branch exists for PLAIN elements, for the reason its comment gives:
// assigning null to a native numeric property coerces it (`maxLength = null` becomes 0). Both
// halves are asserted here, because clearing the property everywhere would bring that back.

import { describe, it, expect, beforeEach } from 'vitest';
import { html, signal, component } from '../src/index';
import { tick } from '../src/testing/index';

component('probe-clearable', {
    props: { error: { type: String, default: '' } },
    setup: () => ({}),
    render: (ctx) => html`<span class="msg">${() => ctx.error()}</span>`,
});

component('probe-aria', { setup: () => ({}), render: () => html`<i></i>` });

async function settle(): Promise<void> {
    await new Promise(r => setTimeout(r, 30));
}

describe('a binding that goes back to undefined clears the property', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('clears a custom element prop when the value disappears', async () => {
        const err = signal<string | undefined>('required');
        document.body.appendChild(html`<probe-clearable :error=${() => err()}></probe-clearable>` as unknown as Node);
        await settle();

        const el = document.querySelector('probe-clearable') as HTMLElement & { error?: string };
        expect(el, 'the element mounted').toBeTruthy();
        expect(el.error, 'the value arrives').toBe('required');

        err.set(undefined);
        await settle();
        expect(el.error, 'and its going away has to arrive too').toBeFalsy();
    });

    it('shows the consequence: the rendered text goes back to empty', async () => {
        // The property is the mechanism; this is what the user sees. Without it the code could satisfy
        // the assertion above and still leave the message painted.
        const err = signal<string | undefined>('required');
        document.body.appendChild(html`<probe-clearable :error=${() => err()}></probe-clearable>` as unknown as Node);
        await settle();
        expect(document.querySelector('probe-clearable .msg')?.textContent).toBe('required');

        err.set(undefined);
        await settle();
        expect(document.querySelector('probe-clearable .msg')?.textContent, 'the message must go').toBe('');
    });

    it('still removes the attribute on a plain element, and does not coerce', async () => {
        // Why the branch exists: `input.maxLength = null` becomes 0, capping the field at zero
        // characters. Assigning null everywhere would introduce exactly that.
        const max = signal<number | undefined>(10);
        document.body.appendChild(html`<input :maxlength=${() => max()} />` as unknown as Node);
        await settle();

        const input = document.querySelector('input') as HTMLInputElement;
        expect(input.getAttribute('maxlength')).toBe('10');

        max.set(undefined);
        await settle();
        expect(input.hasAttribute('maxlength'), 'the attribute goes').toBe(false);
        expect(input.maxLength, 'and it must NOT have become 0').not.toBe(0);
    });

    it('clears an aria- binding by removing it, on a component too', async () => {
        // aria-*/data-* are attribute-shaped by contract, so clearing them stays a removal even on a
        // component. Asserted so the clearing does not sweep them into the property path.
        const invalid = signal<string | null>('true');
        document.body.appendChild(html`<probe-aria :aria-invalid=${() => invalid()}></probe-aria>` as unknown as Node);
        await settle();

        const el = document.querySelector('probe-aria')!;
        expect(el.getAttribute('aria-invalid')).toBe('true');

        invalid.set(null);
        await settle();
        expect(el.hasAttribute('aria-invalid'), 'aria clears by removal').toBe(false);
    });
});

// Removing the attribute is right for a number property and wrong for live state: a field's `value`
// and a node's `textContent` are not their attribute, so going to null would leave the previous value
// on screen. What "no value" means follows the property's type, as Vue's patchDOMProp does.
describe('a plain element property going to null is cleared by its type', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    function bound<T>(template: (v: () => T) => unknown, initial: T): { el: Element; set(v: T): void } {
        const v = signal<T>(initial);
        const host = document.createElement('div');
        host.appendChild(template(() => v()) as Node);
        document.body.appendChild(host);
        return { el: host.firstElementChild!, set: next => v.set(next) };
    }

    it('a string property: <input :value> "b" → null empties the field', async () => {
        const { el, set } = bound<string | null>(v => html`<input :value=${v} />`, 'a');
        set('b');
        await tick();
        expect((el as HTMLInputElement).value, 'control: the binding updates').toBe('b');
        set(null);
        await tick();
        expect((el as HTMLInputElement).value).toBe('');
    });

    it('a string property: <p :text-content> "b" → undefined empties the text', async () => {
        const { el, set } = bound<string | undefined>(v => html`<p :text-content=${v}></p>`, 'b');
        expect(el.textContent).toBe('b');
        set(undefined);
        await tick();
        expect(el.textContent).toBe('');
    });

    it('a boolean property: <input :checked> true → null unchecks it', async () => {
        const { el, set } = bound<boolean | null>(v => html`<input type="checkbox" :checked=${v} />`, true);
        expect((el as HTMLInputElement).checked).toBe(true);
        set(null);
        await tick();
        expect((el as HTMLInputElement).checked).toBe(false);
    });

    it('the control: a number property still loses its attribute, and is not coerced to 0', async () => {
        const { el, set } = bound<number | null>(v => html`<input :maxlength=${v} />`, 5);
        set(null);
        await tick();
        expect(el.hasAttribute('maxlength')).toBe(false);
        expect((el as HTMLInputElement).maxLength).toBe(-1);
    });

    it('the control: a string property with an attribute loses it too: :title', async () => {
        const { el, set } = bound<string | null>(v => html`<div :title=${v}></div>`, 'tip');
        expect(el.getAttribute('title')).toBe('tip');
        set(null);
        await tick();
        expect(el.hasAttribute('title')).toBe(false);
        expect((el as HTMLElement).title).toBe('');
    });
});
