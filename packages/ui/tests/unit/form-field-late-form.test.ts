// A field set up before its <pdx-form> still finds the form.
//
// pdx-form-field cannot look its form up once, in setup, with tryUseForm(): a field set up before
// <pdx-form> has provided the form would never find it, and everything that depends on it would be
// silently off — in validateOn 'onChange' the error would wait for the first blur, and a field with
// only a `name` would never show the form's error at all. happy-dom connects children before their
// parent; a browser gets there too when pdx-form is upgraded after its fields (its module loaded
// later).
//
// The precondition test measures that order here, so these tests cannot silently turn into tests of
// the easy order.
import { describe, it, expect, beforeEach } from 'vitest';
import { component, html, createForm, minLength } from '@pdxui/core';
import type { Form } from '@pdxui/core';
import '../../src/form/pdx-form';
import '../../src/form-field/pdx-form-field';
import '../../src/form-actions/pdx-form-actions';
import { cleanup, tick } from './helpers';

const setupOrder: string[] = [];
component('probe-order-parent', { setup() { setupOrder.push('parent'); return {}; }, render: () => html`` });
component('probe-order-child', { setup() { setupOrder.push('child'); return {}; }, render: () => html`` });

function onChangeForm(): Form<{ a: string }> {
    return createForm({
        initialValues: { a: '' },
        validators: { a: [minLength(3, 'At least 3 characters')] },
        validateOn: 'onChange',
    });
}

/** <pdx-form .form=f> around `children`, connected in one append — the way a template mounts it. */
async function mountForm(f: Form<any>, ...children: HTMLElement[]): Promise<HTMLElement> {
    const formEl = document.createElement('pdx-form') as HTMLElement & { form: unknown };
    formEl.form = f;
    for (const c of children) formEl.appendChild(c);
    document.body.appendChild(formEl);
    await tick(); await tick();
    return formEl;
}

function field(name: string): HTMLElement & { error: unknown } {
    const el = document.createElement('pdx-form-field') as HTMLElement & { error: unknown };
    el.setAttribute('name', name);
    return el;
}

const shown = (f: HTMLElement): boolean => !!f.querySelector('.pdx-form-field.has-error');

describe('a form field set up before its <pdx-form>', () => {
    beforeEach(() => { cleanup(); setupOrder.length = 0; });

    it('precondition: here a child sets up before its parent', async () => {
        const parent = document.createElement('probe-order-parent');
        parent.appendChild(document.createElement('probe-order-child'));
        document.body.appendChild(parent);
        await tick();
        expect(setupOrder, 'the environment sets the parent up first: these tests measure nothing').toEqual(['child', 'parent']);
    });

    it('shows an :error while typing in onChange mode, without a blur', async () => {
        const f = onChangeForm();
        const a = field('a');
        await mountForm(f, a);
        f.fields.a.onChange('x');
        a.error = f.fields.a.error();
        await tick();
        expect(a.error, 'the validator did not run').toBe('At least 3 characters');
        expect(f.fields.a.touched(), 'the field was touched: the case no longer isolates onChange').toBe(false);
        expect(shown(a), 'the error is there but hidden until a blur — the field never found its form').toBe(true);
    });

    it('shows the form\'s own error on a field that has only a name', async () => {
        const f = onChangeForm();
        const a = field('a');
        await mountForm(f, a);
        f.fields.a.onChange('x');
        await tick();
        expect(shown(a), 'the form has an error for "a" and the field never showed it').toBe(true);
        expect(a.querySelector('[role="alert"]')?.textContent ?? '').toContain('At least 3 characters');
    });

    it('control: a field outside any form shows no error of its own', async () => {
        const a = field('a');
        document.body.appendChild(a);
        await tick(); await tick();
        expect(shown(a)).toBe(false);
    });
});

describe('pdx-form-actions set up before its <pdx-form>', () => {
    beforeEach(cleanup);

    // Not "reset": its button is type="reset", and <pdx-form> resets the form from the native event
    // whether the actions found it or not — measured, it passes without the actions finding the form.
    it('disables its submit button while the form is submitting', async () => {
        const f = onChangeForm();
        const actions = document.createElement('pdx-form-actions');
        await mountForm(f, actions);
        const submit = (): HTMLButtonElement => actions.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        expect(submit().disabled).toBe(false);

        f.fields.a.onChange('valid');
        let release!: () => void;
        f.handleSubmit(() => new Promise<void>((r) => { release = r; }))(new Event('submit'));
        await tick();
        expect(f.submitting(), 'the submit never started: the case measures nothing').toBe(true);
        expect(submit().disabled, 'the form is submitting and the button is live — the actions never found their form').toBe(true);

        release();
        await tick();
        expect(submit().disabled).toBe(false);
    });
});
