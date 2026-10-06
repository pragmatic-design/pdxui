// A prop named like a PdxElement getter can be set before the component connects.
//
// PdxElement carries `get form()` for form-associated components (ElementInternals). A component
// that declares a `form` PROP — pdx-form, whose whole API it is — installs its accessor only when it
// connects; before that, `el.form = x` must not meet the prototype's getter-only accessor and throw
// "Cannot set property form … which has only a getter". Neither may the template engine binding
// `<pdx-form :form="form">` wherever the element is upgraded before it is bound: happy-dom, the
// production inline generator, any code that creates the element and sets the prop first.
import { describe, it, expect, afterEach } from 'vitest';
import { component } from '../src/component/component';
import { html } from '../src/renderer/template';

let n = 0;
const uniqueTag = () => `getter-prop-${n++}`;

afterEach(() => { document.body.innerHTML = ''; });

function formHolder(): string {
    const tag = uniqueTag();
    component(tag, {
        props: { form: { type: Object, default: null } },
        render: (ctx) => html`<b class="shown">${() => (ctx.form() as { name?: string } | null)?.name ?? 'none'}</b>`,
    });
    return tag;
}

describe('a `form` prop set before connect', () => {
    it('does not throw when set on an element that has not connected, and arrives', () => {
        const tag = formHolder();
        const el = document.createElement(tag) as HTMLElement & { form: unknown };
        const f = { name: 'shipment' };
        expect(() => { el.form = f; }, 'the prototype getter rejected the assignment').not.toThrow();
        document.body.appendChild(el);
        expect(el.form).toBe(f);
        expect(el.querySelector('.shown')?.textContent).toBe('shipment');
    });

    it('works through a template binding, as <pdx-form :form> compiles', () => {
        // A fixed tag: the binding goes through the template engine's bindProperty, on the element
        // the html`` clone produced.
        if (!customElements.get('getter-prop-bound')) {
            component('getter-prop-bound', {
                props: { form: { type: Object, default: null } },
                render: (ctx) => html`<b class="shown">${() => (ctx.form() as { name?: string } | null)?.name ?? 'none'}</b>`,
            });
        }
        const f = { name: 'draft' };
        const host = document.createElement('div');
        expect(() => host.appendChild(html`<getter-prop-bound :form=${f}></getter-prop-bound>`), 'the :form binding threw').not.toThrow();
        document.body.appendChild(host);
        expect(host.querySelector('.shown')?.textContent).toBe('draft');
    });

    it('control — a later assignment, after connect, still goes through the prop', () => {
        const tag = formHolder();
        const el = document.createElement(tag) as HTMLElement & { form: unknown };
        document.body.appendChild(el);
        el.form = { name: 'later' };
        expect(el.querySelector('.shown')?.textContent).toBe('later');
    });

    it('control — a form-associated component still reads `form` from ElementInternals', () => {
        const tag = uniqueTag();
        component(tag, { formAssociated: true, render: () => html`<i></i>` });
        const form = document.createElement('form');
        const el = document.createElement(tag) as HTMLElement & { form: unknown };
        form.appendChild(el);
        document.body.appendChild(form);
        // happy-dom may not implement ElementInternals.form; the assertion is that nothing replaced
        // the getter with a stored value when no one assigned it.
        expect(Object.getOwnPropertyDescriptor(el, 'form')).toBeUndefined();
    });
});
