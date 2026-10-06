// pdx-edit-drawer opens without a console warning.
//
// The warning it guards against is `<pdx-form> requires a "form" prop (from createForm()).` on
// every open, with the component used exactly as documented — the kind of noisy console that makes
// an app route around the framework.
//
// The order is the point: the drawer sets its pdx-form-template's `form` BEFORE appending it to the
// (connected) drawer body. Appending mounts the template at once, and a <pdx-form> set up with no form
// yet warns; the form arriving a moment later makes everything work, which is why the only symptom
// would be the console.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { FormSchema } from '@pdxui/core';
import '../../src/edit-drawer/pdx-edit-drawer';
import { tick, cleanup } from './helpers';

const SCHEMA: FormSchema = {
    fields: [
        { name: 'shipper', type: 'text', label: 'Shipper', required: true },
        { name: 'consignee', type: 'text', label: 'Consignee', required: true },
        { name: 'weight', type: 'number', label: 'Weight', required: true },
    ],
};

const FORM_WARNING = /<pdx-form> requires a "form" prop/;

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('pdx-edit-drawer', () => {
    it('opens without the "<pdx-form> requires a form" warning, and renders its fields', async () => {
        const warn = vi.spyOn(console, 'warn');
        const el = document.createElement('pdx-edit-drawer') as HTMLElement & { schema: unknown; value: unknown; open: boolean };
        el.schema = SCHEMA;
        el.value = { shipper: 'Adriatica Srl', consignee: '', weight: 12 };
        document.body.appendChild(el);
        await tick();

        el.open = true;
        await tick(); await tick();

        // The drawer portals its panel out of the host, so the fields are found in the document.
        expect(document.querySelectorAll('.pdx-edit-drawer-body pdx-form-field').length, 'the form did not render its three fields').toBe(3);
        // The form set before the template was attached is the one it uses: the entity is loaded.
        const shipper = document.querySelector<HTMLInputElement>('.pdx-edit-drawer-body pdx-form-field[name="shipper"] input');
        expect(shipper?.value, 'the value loaded into the form is not on screen').toBe('Adriatica Srl');
        const formWarnings = warn.mock.calls.map((c) => String(c[0])).filter((m) => FORM_WARNING.test(m));
        expect(formWarnings, 'opening the drawer printed the pdx-form warning').toEqual([]);

        // …and not on the second open either: the warning would come on EVERY open.
        el.open = false; await tick();
        el.open = true; await tick(); await tick();
        expect(warn.mock.calls.map((c) => String(c[0])).filter((m) => FORM_WARNING.test(m))).toEqual([]);
    });

    it('control — the same spy sees the warning when a <pdx-form> really has no form', async () => {
        // Without this, a spy wired to the wrong console would pass the test above.
        const warn = vi.spyOn(console, 'warn');
        document.body.appendChild(document.createElement('pdx-form'));
        await tick();
        expect(warn.mock.calls.map((c) => String(c[0])).some((m) => FORM_WARNING.test(m))).toBe(true);
    });
});
