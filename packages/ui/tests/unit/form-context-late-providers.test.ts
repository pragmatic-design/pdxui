// A field-group path and a form coordinator reach a child set up before their provider.
//
// The form itself does (form-field-late-form.test.ts). Two more form contexts must not be looked up
// once, at setup: `useFieldGroupPath()` (pdx-form-field, pdx-field-list, a nested pdx-field-group) and
// `useFormCoordinator()` (pdx-form). happy-dom connects children before their parent — measured
// below — and a browser does too when the provider's module loads after the consumer's.
//
// A group path is not the form: it can CHANGE after it is found. An inner group set up before the
// outer one first provides `inner`, then `outer.inner` once the outer path appears; a child that kept
// the first answer would stay on the wrong path.

import { describe, it, expect, beforeEach } from 'vitest';
import { component, html, createForm, createFormCoordinator, provideFormCoordinator, minLength } from '@pdxui/core';
import type { FormCoordinator } from '@pdxui/core';
import '../../src/form/pdx-form';
import '../../src/form-field/pdx-form-field';
import '../../src/field-group/pdx-field-group';
import { cleanup, tick } from './helpers';

const setupOrder: string[] = [];
component('probe-late-parent', { setup() { setupOrder.push('parent'); return {}; }, render: () => html`` });
component('probe-late-child', { setup() { setupOrder.push('child'); return {}; }, render: () => html`` });

// An app component that provides a coordinator to what it contains — the only way one reaches a
// <pdx-form>: nothing in @pdxui/ui provides one.
let provided: FormCoordinator;
component('probe-coordinator-host', {
    setup(ctx) { provided = createFormCoordinator(); provideFormCoordinator(provided, ctx.el); return {}; },
    render: () => html`<slot></slot>`,
});

function el(tag: string, attrs: Record<string, string> = {}, ...children: HTMLElement[]): HTMLElement {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    for (const c of children) e.appendChild(c);
    return e;
}

async function mount(root: HTMLElement): Promise<void> {
    document.body.appendChild(root);
    await tick(); await tick();
}

const shown = (f: HTMLElement): boolean => !!f.querySelector('.pdx-form-field.has-error');

describe('form contexts provided after the child that reads them', () => {
    beforeEach(() => { cleanup(); setupOrder.length = 0; });

    it('precondition: here a child sets up before its parent', async () => {
        await mount(el('probe-late-parent', {}, el('probe-late-child')));
        expect(setupOrder, 'the environment sets the parent up first: these tests measure nothing').toEqual(['child', 'parent']);
    });

    it('a field inside a field-group reads the form field at the group\'s path', async () => {
        const f = createForm<Record<string, unknown>>({
            initialValues: { address: { city: '' } },
            validators: { 'address.city': [minLength(3, 'At least 3 characters')] } as never,
            validateOn: 'onChange',
        });
        const city = el('pdx-form-field', { name: 'city' });
        const formEl = el('pdx-form', {}, el('pdx-field-group', { name: 'address' }, city)) as HTMLElement & { form: unknown };
        formEl.form = f;
        await mount(formEl);

        f.fields['address.city'].onChange('x');
        await tick();
        expect(f.fields['address.city'].error(), 'the validator did not run').toBe('At least 3 characters');
        expect(shown(city), 'the field never found "address.city": it looked for "city"').toBe(true);
    });

    it('a field inside nested groups reads the full path, not the inner group\'s alone', async () => {
        const f = createForm<Record<string, unknown>>({
            initialValues: { order: { address: { city: '' } } },
            validators: { 'order.address.city': [minLength(3, 'At least 3 characters')] } as never,
            validateOn: 'onChange',
        });
        // The form is mounted FIRST, and the groups go in afterwards, as one subtree. Otherwise the form,
        // set up last, wakes the field once more after every path is final, and the case would pass
        // even for a lookup that kept the inner group's first answer (measured: it did).
        const formEl = el('pdx-form') as HTMLElement & { form: unknown };
        formEl.form = f;
        await mount(formEl);
        const city = el('pdx-form-field', { name: 'city' });
        formEl.querySelector('form')!.appendChild(
            el('pdx-field-group', { name: 'order' }, el('pdx-field-group', { name: 'address' }, city)),
        );
        await tick(); await tick();

        f.fields['order.address.city'].onChange('x');
        await tick();
        expect(shown(city), 'the field stayed on the inner group\'s path "address.city"').toBe(true);
    });

    it('a <pdx-form name> registers with the coordinator its host provides', async () => {
        const f = createForm({ initialValues: { a: '' } });
        const formEl = el('pdx-form', { name: 'billing' }) as HTMLElement & { form: unknown };
        formEl.form = f;
        await mount(el('probe-coordinator-host', {}, formEl));
        expect(provided.forms().get('billing'), 'the form never registered: it looked for the coordinator once, before it existed').toBe(f);
    });
});

// The unregister cannot live in a `_cleanup` returned from setup, which nothing calls: a removed form
// would stay in the coordinator, and its dirty/valid/submitting would keep counting a form off screen.
describe('a <pdx-form name> removed from the page', () => {
    beforeEach(cleanup);

    it('unregisters from the coordinator it registered with', async () => {
        const f = createForm({ initialValues: { a: '' } });
        const formEl = el('pdx-form', { name: 'billing' }) as HTMLElement & { form: unknown };
        formEl.form = f;
        await mount(el('probe-coordinator-host', {}, formEl));
        expect(provided.forms().has('billing'), 'control: the form is registered while it is on the page').toBe(true);

        formEl.remove();
        await tick();
        expect(provided.forms().has('billing'), 'the removed form is still registered').toBe(false);
    });
});
