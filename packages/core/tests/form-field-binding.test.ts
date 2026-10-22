// A control bound to a form field through its model (#128, step 2): `::value="f.email"`.
//
// The binding writes the field, and the control takes the rest of it: marked invalid while the field
// shows an error, required when the field must be filled in; leaving it touches the field. A `.number`
// entry that does not parse is the field's error.

import { describe, it, expect, afterEach } from 'vitest';
import { html, createForm, required, email, component } from '../src/index';
import { prop, model } from '../src/component/component-descriptor';

const mounted: HTMLElement[] = [];
function mount(fragment: DocumentFragment | Node): HTMLElement {
    const host = document.createElement('div');
    host.appendChild(fragment);
    document.body.appendChild(host);
    mounted.push(host);
    return host;
}
afterEach(() => { for (const h of mounted.splice(0)) h.remove(); });

function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}
function leave(el: Element): void {
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
}

describe('::value bound to a form field', () => {
    it('writes the field, and shows the field on the control', () => {
        const f = createForm({ initialValues: { email: 'a@b.it' } });
        const input = mount(html`<input ::value=${f.email} />`).querySelector('input')!;
        expect(input.value).toBe('a@b.it');
        type(input, 'c@d.it');
        expect(f.email.value()).toBe('c@d.it');
        f.email.onChange('e@f.it');
        expect(input.value).toBe('e@f.it');
    });

    it('typing an invalid email and leaving shows the error, and sets aria-invalid', () => {
        const f = createForm({ initialValues: { email: '' }, validators: { email: [required(), email()] } });
        const input = mount(html`<input ::value=${f.email} />`).querySelector('input')!;
        type(input, 'not-an-email');
        expect(input.hasAttribute('aria-invalid'), 'marked before the field was left').toBe(false);
        leave(input);
        expect(f.email.touched()).toBe(true);
        expect(f.email.error()).toEqual(expect.any(String));
        expect(input.getAttribute('aria-invalid')).toBe('true');
        type(input, 'ok@site.it');
        expect(input.hasAttribute('aria-invalid'), 'still marked once corrected').toBe(false);
    });

    it('marks a required field required on its control', () => {
        const f = createForm({ initialValues: { name: '', note: '' }, validators: { name: [required()] } });
        const host = mount(html`<input data-test="name" ::value=${f.name} /><input data-test="note" ::value=${f.note} />`);
        expect((host.querySelector('[data-test="name"]') as HTMLInputElement).required).toBe(true);
        expect((host.querySelector('[data-test="note"]') as HTMLInputElement).required).toBe(false);
    });

    it('binds a checkbox through checked', () => {
        const f = createForm({ initialValues: { accepted: false } });
        const box = mount(html`<input type="checkbox" ::checked=${f.accepted} />`).querySelector('input')!;
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        expect(f.accepted.value()).toBe(true);
        expect(f.accepted.dirty()).toBe(true);
    });

    it('puts a .number entry that does not parse on the field, and lifts it on the next', () => {
        const f = createForm({ initialValues: { age: 30 as number | null } });
        const input = mount(html`<input ::value.number=${f.age} />`).querySelector('input')!;
        type(input, '12a');
        expect(f.age.value(), 'an unreadable entry was written').toBe(30);
        expect(f.age.error()).toBe('Enter a number.');
        expect(f.valid()).toBe(false);
        expect(input.getAttribute('aria-invalid')).toBe('true');
        type(input, '41');
        expect(f.age.value()).toBe(41);
        expect(f.age.error()).toBeUndefined();
        expect(input.hasAttribute('aria-invalid')).toBe(false);
    });

    it('gives a component with an error prop the field\'s state as that prop', () => {
        component('x-field-control', {
            props: { error: prop(false), required: prop(false) },
            models: { value: model<string>('') },
            render: () => html`<input /><button>clear</button>`,
        });
        const f = createForm({ initialValues: { code: '' }, validators: { code: [required()] } });
        const el = mount(html`<x-field-control ::value=${f.code}></x-field-control>`).querySelector('x-field-control') as HTMLElement & { error: boolean; required: boolean };
        expect(el.required).toBe(true);
        // Moving between its parts is not leaving it.
        const [inner, button] = [el.querySelector('input')!, el.querySelector('button')!];
        inner.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: button }));
        expect(f.code.touched()).toBe(false);
        leave(inner);
        expect(f.code.touched()).toBe(true);
        expect(el.error).toBe(true);
        expect(el.hasAttribute('aria-invalid'), 'the component marks its own control').toBe(false);
    });
});
