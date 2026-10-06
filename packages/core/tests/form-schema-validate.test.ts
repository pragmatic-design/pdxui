// A form built from a schema takes the form-level rule a form built by hand takes.
//
// `createForm({ validate })` holds the rules that read more than one field — an
// end before its start, a field required only when another says so. Without the same place in
// `FormSchema`, a `pdx-auto-form` checks its fields one by one and never against each other: a
// contract created in a modal from a schema could be saved ending before it began.

import { describe, it, expect } from 'vitest';
import { createFormFromSchema } from '../src/form/form-schema';

const period = (validate?: (v: Record<string, unknown>) => Record<string, string>) => createFormFromSchema({
    fields: [
        { name: 'start', type: 'date' },
        { name: 'end', type: 'date' },
    ],
    validate,
});

const endAfterStart = (v: Record<string, unknown>): Record<string, string> =>
    (v.start && v.end && String(v.end) < String(v.start) ? { end: 'Ends before it starts' } : {});

describe('FormSchema.validate', () => {
    it('refuses the pair on the field the rule names', async () => {
        const form = period(endAfterStart);
        form.setValues({ start: '2026-05-01', end: '2026-04-01' });
        expect(await form.validate()).toBe(false);
        expect(form.errors().end).toBe('Ends before it starts');
    });

    it('passes a pair the rule accepts', async () => {
        const form = period(endAfterStart);
        form.setValues({ start: '2026-05-01', end: '2026-06-01' });
        expect(await form.validate()).toBe(true);
    });

    it('control — without a rule, the same pair is valid', async () => {
        const form = period();
        form.setValues({ start: '2026-05-01', end: '2026-04-01' });
        expect(await form.validate()).toBe(true);
    });
});
