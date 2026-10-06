// The form-template wizard step-gate must validate group/list fields too, and wait for async
// validators. Not by mapping step fields to `f.name`: a group field ('address') has no own entry
// in form.fields — only its leaves ('address.street') — so such a gate would silently pass with
// invalid data and advance.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/form-template/pdx-form-template';

const schema = {
    layout: 'wizard',
    sections: [
        { name: 's1', label: 'Address' },
        { name: 's2', label: 'Notes' },
    ],
    fields: [
        { name: 'address', type: 'group', section: 's1', fields: [{ name: 'street', type: 'text', required: true }] },
        { name: 'notes', type: 'textarea', section: 's2' },
    ],
};

async function mountTemplate(): Promise<HTMLElement> {
    const el = document.createElement('pdx-form-template');
    document.body.appendChild(el);
    await tick(50);
    (el as any).schema = schema;
    await tick(80);
    return el;
}

function activeStep(el: HTMLElement): number {
    const steps = Array.from(el.querySelectorAll('.pdx-wizard-step'));
    return steps.findIndex((s) => s.getAttribute('aria-selected') === 'true');
}

describe('wizard gate validates group-field leaves', () => {
    beforeEach(cleanup);

    it('does NOT advance while a required group leaf is empty', async () => {
        const el = await mountTemplate();
        expect(el.querySelectorAll('.pdx-wizard-step').length).toBe(2);
        expect(activeStep(el)).toBe(0);

        await (el as any).wizardNext();
        await tick(50);

        // Old code advanced (form.fields['address'] was undefined → gate skipped).
        expect(activeStep(el)).toBe(0);
    });

    it('advances once the required group leaf is filled', async () => {
        const el = await mountTemplate();
        const form = (el as any).getForm();
        form.fields['address.street'].onChange('123 Main St');
        await tick(20);

        await (el as any).wizardNext();
        await tick(50);

        expect(activeStep(el)).toBe(1);
    });
});
