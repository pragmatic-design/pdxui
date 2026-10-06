// A validation rule that reads two fields.
//
// No other path exists. A `Validator` takes one value and returns
// a message; `FormField.error` and `Form.errors` are ReadonlySignal with no `setError`; and the
// external-schema route runs only inside `validate()`, drops a message with no path, and needs a
// Standard Schema library this repository does not depend on.
//
// A rule computed as a `$derived` on the PAGE, rendered as its own `<p role="alert">`, is not the
// form's error: the fields are not invalid, `form.valid()` does not know, and a submit that
// bypasses the page does not see it.
//
// `config.validate` sees every value and returns
// messages BY FIELD, so they land where the user is looking and the form owns the rule.
import { describe, it, expect } from 'vitest';
import { createForm } from '../src/form/form';
import { required } from '../src/form/validators';

/** A window with a start and an end, the intake wizard's case. */
function windowForm(validateOn: 'onChange' | 'onBlur' | 'onSubmit' = 'onChange') {
    return createForm<{ start: string; end: string }>({
        initialValues: { start: '', end: '' },
        validators: { start: [required()] },
        validateOn,
        validate: (v) => (v.start && v.end && v.end < v.start
            ? { end: 'The end precedes the start' }
            : {}),
    });
}

describe('a form-level rule that reads every value', () => {
    it('puts its message on the field it names', () => {
        const form = windowForm();
        form.fields.start.onChange('2026-03-10');
        form.fields.end.onChange('2026-03-01');
        expect(form.fields.end.error()).toBe('The end precedes the start');
    });

    it('makes the form invalid while it stands', () => {
        // The half the page-level workaround could never have: `valid()` knew nothing about it.
        const form = windowForm();
        form.fields.start.onChange('2026-03-10');
        form.fields.end.onChange('2026-03-01');
        expect(form.valid()).toBe(false);
        expect(form.errors().end).toBe('The end precedes the start');
    });

    it('and clears it when the values stop disagreeing', () => {
        // A rule is a RECOMPUTE, not an accumulation: correcting either field has to lift it.
        const form = windowForm();
        form.fields.start.onChange('2026-03-10');
        form.fields.end.onChange('2026-03-01');
        expect(form.fields.end.error()).toBeTruthy();

        form.fields.end.onChange('2026-03-20');
        expect(form.fields.end.error()).toBeUndefined();
        expect(form.valid()).toBe(true);
    });

    it('lets the field\'s own validator speak first', () => {
        // Precedence, and it has to be decided somewhere: a field-level error is about the value
        // in front of the user and is the more actionable of the two. "Required" and "the end
        // precedes the start" at once is noise, and the cross-field rule is about a pair that are
        // each individually fine.
        const form = createForm<{ start: string; end: string }>({
            initialValues: { start: '', end: '' },
            validators: { end: [required()] },
            validateOn: 'onChange',
            validate: () => ({ end: 'The end precedes the start' }),
        });
        form.fields.end.onChange('');
        expect(form.fields.end.error()).toBe('This field is required');
    });

    it('runs on submit too, and fails it', async () => {
        // `validateOn: 'onSubmit'` never calls the field path, so a rule wired only there would
        // let a bad pair through the one gate that matters.
        const form = windowForm('onSubmit');
        form.fields.start.onChange('2026-03-10');
        form.fields.end.onChange('2026-03-01');
        expect(await form.validate(), 'submit validation passed a pair the rule rejects').toBe(false);
        expect(form.fields.end.error()).toBe('The end precedes the start');
    });

    it('and a form with no rule behaves exactly as before', () => {
        // The control: `validate` is optional and every existing form goes through the same code.
        const form = createForm<{ start: string; end: string }>({
            initialValues: { start: '', end: '' },
            validators: { start: [required()] },
            validateOn: 'onChange',
        });
        form.fields.start.onChange('2026-03-10');
        form.fields.end.onChange('2026-03-01');
        expect(form.valid()).toBe(true);
        expect(form.errors()).toEqual({});
    });

    it('and a message for a field that does not exist is not silently lost', () => {
        // A typo in the returned key would otherwise behave exactly like a rule that passed.
        const form = createForm<{ start: string; end: string }>({
            initialValues: { start: '', end: '' },
            validateOn: 'onChange',
            validate: () => ({ nosuchfield: 'nope' } as Record<string, string>),
        });
        form.fields.start.onChange('x');
        expect(form.valid(), 'an unroutable message let the form call itself valid').toBe(false);
        expect((form.errors() as Record<string, string>).nosuchfield).toBe('nope');
    });
});
