// pdx-auto-form mounts without a console warning.
//
// The order matters, as in pdx-edit-drawer: an auto-form that appended its pdx-form-template and
// set `schema` and `form` a frame later would let the template's <pdx-form> set up with no form and
// print `<pdx-form> requires a "form" prop (from createForm()).` at every mount, then work once the
// form arrived.
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../../src/auto-form/pdx-auto-form';
import { tick, cleanup } from './helpers';

const FIELDS = [
    { field: 'name', label: 'Name', type: 'text' },
    { field: 'role', label: 'Role', type: 'text' },
];

const FORM_WARNING = /<pdx-form> requires a "form" prop/;

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('pdx-auto-form', () => {
    it('mounts without the "<pdx-form> requires a form" warning, and renders its fields', async () => {
        const warn = vi.spyOn(console, 'warn');
        const el = document.createElement('pdx-auto-form') as HTMLElement & { fields: unknown };
        el.fields = FIELDS;
        document.body.appendChild(el);

        await vi.waitFor(() => expect(el.querySelectorAll('pdx-form-field').length, 'the form did not render its two fields').toBe(2));
        await tick(30);
        const formWarnings = warn.mock.calls.map((c) => String(c[0])).filter((m) => FORM_WARNING.test(m));
        expect(formWarnings, 'mounting the auto-form printed the pdx-form warning').toEqual([]);
    });

    it('…nor when its fields change and the form is rebuilt', async () => {
        const warn = vi.spyOn(console, 'warn');
        const el = document.createElement('pdx-auto-form') as HTMLElement & { fields: unknown };
        el.fields = FIELDS;
        document.body.appendChild(el);
        await vi.waitFor(() => expect(el.querySelectorAll('pdx-form-field').length).toBe(2));

        el.fields = [...FIELDS, { field: 'email', label: 'Email', type: 'text' }];
        await vi.waitFor(() => expect(el.querySelectorAll('pdx-form-field').length).toBe(3));
        await tick(30);
        expect(warn.mock.calls.map((c) => String(c[0])).filter((m) => FORM_WARNING.test(m))).toEqual([]);
    });

    it('control — the same spy sees the warning when a <pdx-form> really has no form', async () => {
        const warn = vi.spyOn(console, 'warn');
        document.body.appendChild(document.createElement('pdx-form'));
        await tick();
        expect(warn.mock.calls.map((c) => String(c[0])).some((m) => FORM_WARNING.test(m))).toBe(true);
    });
});
