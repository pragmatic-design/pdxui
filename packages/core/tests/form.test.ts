// Tests for createForm() — fields, validation, state machine, field arrays.

import { describe, it, expect, vi } from 'vitest';
import { createForm } from '../src/form/form';
import { required, minLength, email, min } from '../src/form/validators';
import { waitUntil } from './wait-until';

describe('createForm — basic fields', () => {
    it('creates form with initial values', () => {
        const form = createForm({
            initialValues: { name: 'Alice', age: 30 },
        });

        expect(form.fields.name.value()).toBe('Alice');
        expect(form.fields.age.value()).toBe(30);
    });

    it('tracks dirty state on change', () => {
        const form = createForm({ initialValues: { name: '' } });

        expect(form.fields.name.dirty()).toBe(false);
        expect(form.dirty()).toBe(false);

        form.fields.name.onChange('Bob');
        expect(form.fields.name.dirty()).toBe(true);
        expect(form.dirty()).toBe(true);
    });

    it('tracks touched state on blur', () => {
        const form = createForm({ initialValues: { name: '' } });

        expect(form.fields.name.touched()).toBe(false);
        expect(form.touched()).toBe(false);

        form.fields.name.onBlur();
        expect(form.fields.name.touched()).toBe(true);
        expect(form.touched()).toBe(true);
    });

    it('reset clears all state', () => {
        const form = createForm({ initialValues: { name: '' } });

        form.fields.name.onChange('Bob');
        form.fields.name.onBlur();
        expect(form.dirty()).toBe(true);
        expect(form.touched()).toBe(true);

        form.reset();
        expect(form.fields.name.value()).toBe('');
        expect(form.dirty()).toBe(false);
        expect(form.touched()).toBe(false);
    });

    it('setValues updates multiple fields', () => {
        const form = createForm({ initialValues: { name: '', email: '' } });

        form.setValues({ name: 'Alice', email: 'a@b.com' });
        expect(form.fields.name.value()).toBe('Alice');
        expect(form.fields.email.value()).toBe('a@b.com');
    });

    it('getValues returns snapshot', () => {
        const form = createForm({ initialValues: { name: 'A', count: 1 } });
        form.fields.name.onChange('B');

        const values = form.getValues();
        expect(values).toEqual({ name: 'B', count: 1 });
    });
});

describe('createForm — validation', () => {
    it('validates required field', () => {
        const form = createForm({
            initialValues: { name: '' },
            validators: { name: [required()] },
            validateOn: 'onChange',
        });

        form.fields.name.onChange('');
        expect(form.fields.name.error()).toBe('This field is required');
        expect(form.valid()).toBe(false);

        form.fields.name.onChange('Alice');
        expect(form.fields.name.error()).toBeUndefined();
        expect(form.valid()).toBe(true);
    });

    it('validates with multiple rules (first error wins)', () => {
        const form = createForm({
            initialValues: { name: '' },
            validators: { name: [required(), minLength(3)] },
            validateOn: 'onChange',
        });

        form.fields.name.onChange('');
        expect(form.fields.name.error()).toBe('This field is required');

        form.fields.name.onChange('AB');
        expect(form.fields.name.error()).toBe('Minimum 3 characters');

        form.fields.name.onChange('Alice');
        expect(form.fields.name.error()).toBeUndefined();
    });

    it('validates on blur by default', () => {
        const form = createForm({
            initialValues: { name: '' },
            validators: { name: [required()] },
        });

        // No error yet (haven't blurred)
        form.fields.name.onChange('');
        expect(form.fields.name.error()).toBeUndefined();

        // Blur triggers validation
        form.fields.name.onBlur();
        expect(form.fields.name.error()).toBe('This field is required');
    });

    it('errors signal aggregates all field errors', () => {
        const form = createForm({
            initialValues: { name: '', email: '' },
            validators: {
                name: [required()],
                email: [required(), email()],
            },
            validateOn: 'onChange',
        });

        form.fields.name.onChange('');
        form.fields.email.onChange('bad');

        const errs = form.errors();
        expect(errs.name).toBe('This field is required');
        expect(errs.email).toBe('Invalid email address');
    });

    it('validate() touches all fields and returns validity', async () => {
        const form = createForm({
            initialValues: { name: '', age: 0 },
            validators: { name: [required()], age: [min(1)] },
        });

        const isValid = await form.validate();
        expect(isValid).toBe(false);
        expect(form.fields.name.touched()).toBe(true);
        expect(form.fields.age.touched()).toBe(true);
    });

    it('async validator runs after sync passes', async () => {
        const asyncCheck = vi.fn().mockResolvedValue(undefined);
        const form = createForm({
            initialValues: { username: '' },
            validators: { username: [required()] },
            asyncValidators: { username: asyncCheck },
            asyncDebounceMs: 0,
            validateOn: 'onChange',
        });

        // Sync fails — async should NOT run
        form.fields.username.onChange('');
        await new Promise(r => setTimeout(r, 50)); // SLEEP-OK: asserts the async validator did NOT run inside the debounce window
        expect(asyncCheck).not.toHaveBeenCalled();

        // Sync passes — async runs
        form.fields.username.onChange('alice');
        await waitUntil(() => asyncCheck.mock.calls.length > 0, 'the debounced async validator to run');
        expect(asyncCheck).toHaveBeenCalledWith('alice');
    });
});

describe('createForm — state machine', () => {
    it('starts in idle state', () => {
        const form = createForm({ initialValues: { name: '' } });
        expect(form.state()).toBe('idle');
        expect(form.submitting()).toBe(false);
        expect(form.submitted()).toBe(false);
    });

    it('transitions through submit lifecycle', async () => {
        let resolve!: () => void;
        const pending = new Promise<void>(r => { resolve = r; });

        const form = createForm({
            initialValues: { name: 'Alice' },
        });

        const handler = form.handleSubmit(() => pending);

        const fakeEvent = { preventDefault: vi.fn() } as unknown as Event;
        const promise = handler(fakeEvent);

        expect(fakeEvent.preventDefault).toHaveBeenCalled();

        // Wait a tick for async validation to complete
        await new Promise(r => setTimeout(r, 0));
        expect(form.state()).toBe('submitting');
        expect(form.submitting()).toBe(true);

        resolve();
        await promise;

        expect(form.state()).toBe('success');
        expect(form.submitted()).toBe(true);
    });

    it('transitions to error on submit failure', async () => {
        const form = createForm({ initialValues: { name: 'Alice' } });

        const handler = form.handleSubmit(async () => { throw new Error('Server error'); });
        const fakeEvent = { preventDefault: vi.fn() } as unknown as Event;

        await handler(fakeEvent);

        expect(form.state()).toBe('error');
        expect(form.submitError()).toBeInstanceOf(Error);
    });

    it('prevents double-submit', async () => {
        let submitCount = 0;
        let resolve!: () => void;
        const pending = new Promise<void>(r => { resolve = r; });

        const form = createForm({ initialValues: { name: 'Alice' } });
        const handler = form.handleSubmit(() => {
            submitCount++;
            return pending;
        });

        const ev = { preventDefault: vi.fn() } as unknown as Event;
        const p1 = handler(ev);
        // Wait a tick so the first handler enters submitting state
        await new Promise(r => setTimeout(r, 0));
        handler(ev); // second call — should be ignored

        resolve();
        await p1;

        expect(submitCount).toBe(1);
    });

    it('skips submit if validation fails', async () => {
        let submitted = false;
        const form = createForm({
            initialValues: { name: '' },
            validators: { name: [required()] },
        });

        const handler = form.handleSubmit(async () => { submitted = true; });
        await handler({ preventDefault: vi.fn() } as unknown as Event);

        expect(submitted).toBe(false);
        expect(form.state()).toBe('idle');
    });
});

describe('createForm — field arrays', () => {
    it('creates and manipulates field array', () => {
        const form = createForm({
            initialValues: { name: '', items: [] as { text: string }[] },
        });

        const arr = form.array('items');
        expect(arr.items().length).toBe(0);

        arr.append({ text: 'first' });
        arr.append({ text: 'second' });
        expect(arr.items().length).toBe(2);
        expect(arr.items()[0].value).toEqual({ text: 'first' });

        arr.remove(0);
        expect(arr.items().length).toBe(1);
        expect(arr.items()[0].value).toEqual({ text: 'second' });
    });

    // Field-array edits must reach getValues()/submit and make the form dirty.
    it('field array values reach getValues() and mark the form dirty', () => {
        const form = createForm({
            initialValues: { name: 'x', items: [] as { text: string }[] },
        });
        expect(form.dirty()).toBe(false);

        const arr = form.array('items');
        arr.append({ text: 'first' });
        arr.append({ text: 'second' });

        const values = form.getValues() as { name: string; items: { text: string }[] };
        expect(values.items).toEqual([{ text: 'first' }, { text: 'second' }]);
        expect(values.name).toBe('x');
        expect(form.dirty()).toBe(true);
    });

    it('nested (dotted) field array reaches getValues()', () => {
        const form = createForm({
            initialValues: { order: { items: [] as { sku: string }[] } },
        });
        form.array('order.items').append({ sku: 'A1' });
        const values = form.getValues() as { order: { items: { sku: string }[] } };
        expect(values.order.items).toEqual([{ sku: 'A1' }]);
    });

    it('field array items have stable IDs', () => {
        const form = createForm({
            initialValues: { items: [] as { text: string }[] },
        });

        const arr = form.array('items');
        arr.append({ text: 'a' });
        arr.append({ text: 'b' });

        const id0 = arr.items()[0].__id;
        const id1 = arr.items()[1].__id;
        expect(id0).not.toBe(id1);

        // After swap, IDs follow their items
        arr.swap(0, 1);
        expect(arr.items()[0].__id).toBe(id1);
        expect(arr.items()[1].__id).toBe(id0);
    });

    it('field array move reorders correctly', () => {
        const form = createForm({
            initialValues: { items: [] as string[] },
        });

        const arr = form.array('items');
        arr.append('a');
        arr.append('b');
        arr.append('c');

        arr.move(0, 2); // move 'a' to end
        expect(arr.getValues()).toEqual(['b', 'c', 'a']);
    });

    it('field array reset restores initial', () => {
        const form = createForm({
            initialValues: { items: [{ text: 'init' }] },
        });

        const arr = form.array('items');
        arr.append({ text: 'new' });
        expect(arr.items().length).toBe(2);

        form.reset();
        expect(arr.items().length).toBe(1);
    });
});
