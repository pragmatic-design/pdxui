// createForm — branch coverage, and two regressions.
//
// The regressions share one shape: `validate()` is a "recompute", not a "report failures". A
// recompute has to be able to say NO error and NO warning, not only ever say more. Everything
// below the two `*-recompute` describes is ordinary branch coverage.

import { describe, it, expect, vi } from 'vitest';
import { waitUntil } from './wait-until';
import { createForm, FORM_INTERNALS } from '../src/form/form';
import type { FormInternals } from '../src/form/form';

const internals = (form: unknown): FormInternals =>
    (form as Record<symbol, FormInternals>)[FORM_INTERNALS];

describe('validate() is a recompute, not a report', () => {
    it('drops an error the field no longer has', async () => {
        // The interactive path (onChange/onBlur) clears the error itself, so this only bites when
        // the value arrives another way: setValues(), a DataSource load, a direct signal write.
        const form = createForm({
            initialValues: { zip: '1234' },
            validators: { zip: [(v: string) => (/^\d{5}$/.test(v) ? undefined : 'Five digits')] },
        });

        expect(await form.validate()).toBe(false);
        expect(form.errors().zip).toBe('Five digits');

        form.setValues({ zip: '12345' });
        expect(await form.validate(), 'the corrected value still fails').toBe(true);

        expect(form.errors().zip, 'the message survived the value it was about').toBeUndefined();
        expect(form.valid(), 'validate() said true while the form said invalid').toBe(true);
    });

    it('computes warnings, which only the field path used to do', async () => {
        const form = createForm({
            initialValues: { pw: 'abc' },
            warnings: { pw: [(v: string) => (v.length < 8 ? 'Weak' : undefined)] },
        });

        await form.validate();

        expect(form.errors().pw, 'a warning must not block submission').toBeUndefined();
        expect(form.warnings().pw, 'a form filled programmatically got no warnings at all')
            .toBe('Weak');
    });

    it('drops a warning the value no longer earns', async () => {
        const form = createForm({
            initialValues: { pw: 'abc' },
            warnings: { pw: [(v: string) => (v.length < 8 ? 'Weak' : undefined)] },
        });
        await form.validate();
        expect(form.warnings().pw).toBe('Weak');

        form.setValues({ pw: 'long-enough' });
        await form.validate();
        expect(form.warnings().pw).toBeUndefined();
    });

    it('drops an async error the value no longer earns', async () => {
        let taken = true;
        const form = createForm({
            initialValues: { user: 'ada' },
            asyncValidators: { user: async () => (taken ? 'Taken' : undefined) },
        });

        await form.validate();
        expect(form.errors().user).toBe('Taken');

        taken = false;
        await form.validate();
        expect(form.errors().user, 'the async answer changed and nothing noticed').toBeUndefined();
    });

    it('keeps an async error when the value moved under it', async () => {
        // The control for the clear above: the stale-guard must still refuse to write — in either
        // direction — an answer about a value the field has since left.
        let release: (v: string | undefined) => void = () => {};
        const form = createForm({
            initialValues: { user: 'ada' },
            validators: { user: [] },
            asyncValidators: {
                user: () => new Promise<string | undefined>((r) => { release = r; }),
            },
        });

        const running = form.validate();
        form.setValues({ user: 'grace' });   // the field moves while the request is in flight
        release('Taken');
        await running;

        expect(form.errors().user, 'an answer about "ada" landed on "grace"').toBeUndefined();
    });
});

describe('when validation runs', () => {
    it('onBlur by default: typing shows nothing until the field is left', () => {
        const form = createForm({
            initialValues: { name: '' },
            validators: { name: [(v: string) => (v ? undefined : 'Required')] },
        });

        form.fields.name.onChange('');
        expect(form.errors().name, 'an error for a value still being written').toBeUndefined();

        form.fields.name.onBlur();
        expect(form.errors().name).toBe('Required');
    });

    it('onChange: the error appears while typing', () => {
        const form = createForm({
            initialValues: { name: 'x' },
            validateOn: 'onChange',
            validators: { name: [(v: string) => (v ? undefined : 'Required')] },
        });
        form.fields.name.onChange('');
        expect(form.errors().name).toBe('Required');
    });

    it('onSubmit: neither blur nor typing validates, but a touched field re-validates', () => {
        const form = createForm({
            initialValues: { name: '' },
            validateOn: 'onSubmit',
            validators: { name: [(v: string) => (v ? undefined : 'Required')] },
        });

        form.fields.name.onBlur();
        expect(form.errors().name, 'onSubmit validated on blur').toBeUndefined();

        // Touched now — a later edit re-runs the rule so a corrected field can go green.
        form.fields.name.onChange('');
        expect(form.errors().name).toBe('Required');
    });

    it('exposes the modes it was configured with', () => {
        const form = createForm({ initialValues: { a: 1 }, validateOn: 'onChange', saveMode: 'immediate' });
        expect(form.validateOn).toBe('onChange');
        expect(form.saveMode).toBe('immediate');
    });
});

describe('dirty, touched and reset', () => {
    it('dirty follows the value, not the number of edits', () => {
        const form = createForm<Record<string, unknown>>({ initialValues: { a: 'x' } });
        expect(form.dirty()).toBe(false);

        form.fields.a.onChange('y');
        expect(form.dirty()).toBe(true);

        form.fields.a.onChange('x');
        expect(form.dirty(), 'a value typed back to its original is not a change').toBe(false);
    });

    it('setValues marks dirty the same way', () => {
        const form = createForm<Record<string, unknown>>({ initialValues: { a: 'x' } });
        form.setValues({ a: 'y' });
        expect(form.dirty()).toBe(true);
        form.setValues({ a: 'x' });
        expect(form.dirty()).toBe(false);
    });

    it('setValues ignores a key that is not a field', () => {
        const form = createForm<Record<string, unknown>>({ initialValues: { a: 'x' } });
        expect(() => form.setValues({ ghost: 1 } as never)).not.toThrow();
        expect(form.getValues()).toEqual({ a: 'x' });
    });

    it('reset returns to the initial values and clears the state', async () => {
        const form = createForm({
            initialValues: { a: 'x' },
            validators: { a: [(v: string) => (v === 'x' ? undefined : 'no')] },
        });
        form.fields.a.onChange('y');
        form.fields.a.onBlur();
        expect(form.errors().a).toBe('no');

        form.reset();
        expect(form.getValues().a).toBe('x');
        expect(form.errors().a).toBeUndefined();
        expect(form.touched()).toBe(false);
        expect(form.dirty()).toBe(false);
    });

    it('reset(newValues) moves the baseline, so the new value is not dirty', () => {
        const form = createForm<Record<string, unknown>>({ initialValues: { a: 'x' } });
        form.reset({ a: 'saved' });
        expect(form.getValues().a).toBe('saved');
        expect(form.dirty(), 'the record was saved — that is the new zero').toBe(false);
    });

    it('a single field resets on its own', () => {
        const form = createForm({ initialValues: { a: 'x', b: 'y' } });
        form.fields.a.onChange('1');
        form.fields.b.onChange('2');
        form.fields.a.reset();
        expect(form.getValues()).toEqual({ a: 'x', b: '2' });
    });
});

describe('handleSubmit', () => {
    it('prevents the default and does not submit an invalid form', async () => {
        const fn = vi.fn();
        const form = createForm({
            initialValues: { a: '' },
            validators: { a: [(v: string) => (v ? undefined : 'Required')] },
        });
        const e = new Event('submit');
        const prevented = vi.spyOn(e, 'preventDefault');

        form.handleSubmit(fn)(e);
        await Promise.resolve();
        await Promise.resolve();

        expect(prevented).toHaveBeenCalled();
        expect(fn, 'an invalid form reached the server').not.toHaveBeenCalled();
        expect(form.submitted(), 'submitted means it went through, and it did not').toBe(false);
        expect(form.touched(), 'the fields must be touched or the errors stay invisible').toBe(true);
    });

    it('passes the values and lands in success', async () => {
        const fn = vi.fn();
        const form = createForm({ initialValues: { a: 'ok' } });

        form.handleSubmit((v) => { fn(v); })(new Event('submit'));
        for (let i = 0; i < 8; i++) await Promise.resolve();

        expect(fn).toHaveBeenCalledWith({ a: 'ok' });
        expect(form.state()).toBe('success');
        expect(form.submitted()).toBe(true);
        expect(form.submitting()).toBe(false);
    });

    it('records a handler failure instead of letting it escape', async () => {
        const boom = new Error('server said no');
        const form = createForm({ initialValues: { a: 'ok' } });

        form.handleSubmit(async () => { throw boom; })(new Event('submit'));
        for (let i = 0; i < 8; i++) await Promise.resolve();

        expect(form.state()).toBe('error');
        expect(form.submitError()).toBe(boom);
        expect(form.submitting()).toBe(false);
    });

    it('refuses a second submit while the first is in flight', async () => {
        const fn = vi.fn(async () => { await new Promise((r) => setTimeout(r, 20)); });
        const form = createForm({ initialValues: { a: 'ok' } });
        const submit = form.handleSubmit(fn);

        submit(new Event('submit'));
        for (let i = 0; i < 4; i++) await Promise.resolve();
        submit(new Event('submit'));
        await new Promise((r) => setTimeout(r, 40)); // SLEEP-OK: asserts a double click did NOT submit twice, so the window must elapse

        expect(fn.mock.calls.length, 'a double click submitted twice').toBe(1);
    });
});

describe('per-field save', () => {
    it('calls back on change when the field says onChange', async () => {
        const saved = vi.fn();
        const form = createForm({
            initialValues: { a: 'x' },
            saveMode: 'onChange',
            saveDebounce: 1,
        });
        form.onFieldSave(saved);

        form.fields.a.onChange('y');
        await waitUntil(() => saved.mock.calls.length > 0, 'the autosave to fire');

        expect(saved).toHaveBeenCalledWith('a', 'y');
    });

    it('a per-field mode beats the form default', async () => {
        const saved = vi.fn();
        const form = createForm({
            initialValues: { a: 'x', b: 'x' },
            saveMode: 'onSubmit',
            fieldConfig: { a: { saveMode: 'immediate' } },
        });
        form.onFieldSave(saved);

        form.fields.a.onChange('1');
        form.fields.b.onChange('2');
        await waitUntil(() => saved.mock.calls.length > 0, 'the autosave to fire');

        expect(saved).toHaveBeenCalledWith('a', '1');
        expect(saved.mock.calls.some((c) => c[0] === 'b'), 'onSubmit field auto-saved').toBe(false);
    });

    it('debounces: only the last value of a burst is saved', async () => {
        const saved = vi.fn();
        const form = createForm({ initialValues: { a: 'x' }, saveMode: 'onChange', saveDebounce: 15 });
        form.onFieldSave(saved);

        form.fields.a.onChange('1');
        form.fields.a.onChange('2');
        form.fields.a.onChange('3');
        await new Promise((r) => setTimeout(r, 40)); // SLEEP-OK: asserts EXACTLY one coalesced call, which only a settled window can show

        expect(saved.mock.calls).toEqual([['a', '3']]);
    });

    it('onBlur save fires on blur and not on change', async () => {
        const saved = vi.fn();
        const form = createForm({ initialValues: { a: 'x' }, saveMode: 'onBlur', saveDebounce: 1 });
        form.onFieldSave(saved);

        form.fields.a.onChange('y');
        await new Promise((r) => setTimeout(r, 15)); // SLEEP-OK: asserts the autosave did NOT fire before blur, so waiting is the point
        expect(saved).not.toHaveBeenCalled();

        form.fields.a.onBlur();
        await waitUntil(() => saved.mock.calls.length > 0, 'the blur autosave to fire');
        expect(saved).toHaveBeenCalledWith('a', 'y');
    });
});

describe('nested values', () => {
    it('flattens the initial object into dotted fields and gives it back nested', () => {
        const form = createForm({ initialValues: { customer: { name: 'Ada', city: 'Roma' } } });
        expect(Object.keys(form.fields)).toEqual(['customer.name', 'customer.city']);
        expect(form.getValues()).toEqual({ customer: { name: 'Ada', city: 'Roma' } });
    });

    it('a validator is declared against the dotted path', async () => {
        const form = createForm({
            initialValues: { customer: { name: '' } },
            validators: { 'customer.name': [(v: string) => (v ? undefined : 'Required')] },
        } as never);
        expect(await form.validate()).toBe(false);
        expect(form.errors()['customer.name']).toBe('Required');
    });
});

describe('dynamic fields (FORM_INTERNALS)', () => {
    it('adds a field with its validators and counts it as a field', async () => {
        const form = createForm<Record<string, unknown>>({ initialValues: { a: 'x' } });
        internals(form).addField('items.0.qty', 0, [(v) => ((v as number) > 0 ? undefined : 'Positive')]);

        expect(internals(form).getFieldPaths()).toContain('items.0.qty');
        expect(await form.validate(), 'a dynamic required field passed the submit untouched')
            .toBe(false);
        expect(form.errors()['items.0.qty']).toBe('Positive');
    });

    it('removes every field under a prefix', () => {
        const form = createForm<Record<string, unknown>>({ initialValues: { a: 'x' } });
        internals(form).addField('items.0.qty', 1);
        internals(form).addField('items.0.name', 'p');
        internals(form).addField('items.1.qty', 2);

        internals(form).removeFields('items.0');

        const paths = internals(form).getFieldPaths();
        expect(paths).not.toContain('items.0.qty');
        expect(paths).not.toContain('items.0.name');
        expect(paths, 'removing row 0 took row 1 with it').toContain('items.1.qty');
    });

    it('renames a prefix, keeping the values', () => {
        const form = createForm<Record<string, unknown>>({ initialValues: { a: 'x' } });
        internals(form).addField('items.1.qty', 7);

        internals(form).renameFields('items.1', 'items.0');

        expect(internals(form).getFieldPaths()).toContain('items.0.qty');
        expect(form.fields['items.0.qty'].value()).toBe(7);
    });

    it('bumps the version so a list re-renders', () => {
        const form = createForm<Record<string, unknown>>({ initialValues: { a: 'x' } });
        const before = internals(form).fieldVersion();
        internals(form).addField('items.0.qty', 1);
        expect(internals(form).fieldVersion()).toBeGreaterThan(before);
    });
});

describe('dispose', () => {
    it('cancels a pending save instead of firing it after teardown', async () => {
        const saved = vi.fn();
        const form = createForm({ initialValues: { a: 'x' }, saveMode: 'onChange', saveDebounce: 20 });
        form.onFieldSave(saved);

        form.fields.a.onChange('y');
        form.dispose();
        await new Promise((r) => setTimeout(r, 50)); // SLEEP-OK: asserts a disposed form never wrote at all, so there is nothing to await

        expect(saved, 'a disposed form wrote to the server').not.toHaveBeenCalled();
    });
});
