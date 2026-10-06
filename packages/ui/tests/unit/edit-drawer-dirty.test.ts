// `pdx-edit-drawer` says whether anything was changed.
//
// The drawer is not a modal: it closes on Escape and on the ✕, and both are easy to hit by accident.
// A page that hosts it has to ask before discarding — and only when there is something to discard,
// because a confirm on every close is a confirm nobody reads.
//
// The page cannot work that out for itself:
//
//   · querying the form under the host fails — the panel is re-parented to <body>, so there is no
//     form there and every close reads «nothing changed»;
//   · comparing `getValues()` with the record is a snapshot race: the values are read as the close
//     is handled, and a keystroke that has not reached the form model yet reads clean.
//
// The form itself carries `dirty` (`core/src/form/form.ts:402`); the drawer passes it on.
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../../src/edit-drawer/pdx-edit-drawer';

type Drawer = HTMLElement & {
    open: boolean;
    schema: unknown;
    value: unknown;
    isDirty?: () => boolean;
};

const SCHEMA = {
    fields: [
        { name: 'subject', type: 'text', label: 'Subject' },
        { name: 'customer', type: 'text', label: 'Customer' },
    ],
};

async function mountOpen(value: Record<string, unknown> | null): Promise<Drawer> {
    const el = document.createElement('pdx-edit-drawer') as Drawer;
    el.schema = SCHEMA;
    el.value = value;
    el.open = true;
    document.body.appendChild(el);
    // The form is built in a requestAnimationFrame after the open is seen. Waiting for the MODEL
    // alone is not waiting for the form: `getValues()` answers before the inputs are in the
    // document, and under the load of the whole suite the next line would read `null.value`. The fields
    // the tests below type into are what has to be there.
    await vi.waitFor(() => {
        expect(typeof el.isDirty).toBe('function');
        expect((el as Drawer & { getValues: () => Record<string, unknown> }).getValues().subject)
            .toBe(value ? value.subject : undefined);
        expect(document.querySelector('input[name="subject"]'), 'the form model is up but its fields are not').not.toBeNull();
    }, { timeout: 2000 });
    return el;
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('pdx-edit-drawer — whether anything was changed', () => {
    it('is false on a form nobody touched', async () => {
        const el = await mountOpen({ subject: 'Printer jam', customer: 'Northwind' });
        expect(el.isDirty!(), 'a freshly opened record reads as changed').toBe(false);
    });

    it('is true after a field changes', async () => {
        const el = await mountOpen({ subject: 'Printer jam', customer: 'Northwind' });
        const input = document.querySelector<HTMLInputElement>('input[name="subject"]')!;
        input.value = 'Lift is stuck';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        await vi.waitFor(() => {
            expect(el.isDirty!(), 'the drawer cannot tell a changed form from an untouched one')
                .toBe(true);
        }, { timeout: 2000 });
    });

    it('control — it is false again on the next record', async () => {
        // A drawer reused for a second row must not inherit the first one's answer: the form is
        // rebuilt per open, and `isDirty` has to follow the form that is actually mounted.
        const el = await mountOpen({ subject: 'Printer jam', customer: 'Northwind' });
        const input = document.querySelector<HTMLInputElement>('input[name="subject"]')!;
        input.value = 'Lift is stuck';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await vi.waitFor(() => expect(el.isDirty!()).toBe(true), { timeout: 2000 });

        el.value = { subject: 'VPN drops', customer: 'Contoso' };
        await vi.waitFor(() => {
            expect(document.querySelector<HTMLInputElement>('input[name="subject"]')!.value)
                .toBe('VPN drops');
        }, { timeout: 2000 });

        expect(el.isDirty!(), 'the second record inherited the first one’s dirty state').toBe(false);
    });
});
