// A field its form's schema requires is marked required — aria-required on the control, the marker
// on the label — exactly as one whose markup says `required`.
//
// Only the `required` prop did either. A form that declared `email: [required()]` left the control
// announced as «Email, edit text» with no «required», and no asterisk, until an error appeared
// (#249). The rule (docs/language/agents.md, A1): aria-required whenever the schema OR the prop
// requires the field.
import { describe, it, expect, beforeEach } from 'vitest';
import { createForm, required, minLength } from '@pdxui/core';
import type { Form } from '@pdxui/core';
import '../../src/form/pdx-form';
import '../../src/form-field/pdx-form-field';
import { cleanup, tick } from './helpers';

/** <pdx-form .form=f> around the fields, connected in one append — the way a template mounts it. */
async function mountForm(f: Form<any>, ...children: HTMLElement[]): Promise<HTMLElement> {
    const formEl = document.createElement('pdx-form') as HTMLElement & { form: unknown };
    formEl.form = f;
    for (const c of children) formEl.appendChild(c);
    document.body.appendChild(formEl);
    await tick(50);
    return formEl;
}

/** <pdx-form-field name label><input></pdx-form-field> */
function field(name: string, label: string, attrs: Record<string, string> = {}): HTMLElement {
    const el = document.createElement('pdx-form-field');
    el.setAttribute('name', name);
    el.setAttribute('label', label);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.appendChild(document.createElement('input'));
    return el;
}

const input = (f: HTMLElement): HTMLInputElement => f.querySelector('input')!;

// The label's marker is drawn from the host's :state(required) since #293, which happy-dom does not
// have: form-b-beta-contract.spec.ts measures it in Chromium, required by the prop and by the form. Both
// come from one answer, the one that sets aria-required here.
describe('a field required by its form', () => {
    beforeEach(cleanup);

    it('marks the control aria-required', async () => {
        const f = createForm({
            initialValues: { email: '', name: '' },
            validators: { email: [required()], name: [minLength(2)] },
        });
        const email = field('email', 'Email');
        const name = field('name', 'Name');
        await mountForm(f, email, name);

        expect(input(email).getAttribute('aria-required'), 'the schema requires email').toBe('true');
        expect(input(name).hasAttribute('aria-required'), 'name is not required').toBe(false);
    });

    it('never sets the native required attribute — the browser bubble would compete with the form', async () => {
        const f = createForm({ initialValues: { email: '' }, validators: { email: [required()] } });
        const email = field('email', 'Email');
        await mountForm(f, email);
        expect(input(email).hasAttribute('required')).toBe(false);
    });

    it('control: the required prop still marks a field the form does not require', async () => {
        const f = createForm({ initialValues: { note: '' } });
        const note = field('note', 'Note', { required: '' });
        await mountForm(f, note);
        expect(input(note).getAttribute('aria-required')).toBe('true');
    });
});
