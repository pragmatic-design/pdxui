// A server's field errors land on their fields (#280; beta spec, data.md, «@form», rule F5).
//
// When the server rejects a submit with field errors in RFC 9457 shape — an `errors` member keyed by
// field path — the form kept the whole rejection as one object and no field showed its message: the
// user saw «could not save» and had to guess which field was refused. Now each message lands on its
// field (the path matched as written, else ignoring case: a .NET server sends `Email` for `email`),
// and what matches no field is the form's own error.

import { describe, it, expect } from 'vitest';
import { createForm, HttpError } from '../src/index';

const submitEvent = () => new Event('submit', { cancelable: true });

const problem = {
    title: 'Validation failed',
    errors: { Email: ['Already registered'], 'Items[0].Name': ['Required'], '': ['Try later'] },
};

/** Typed by record, as form-nested.test.ts does: a row's field is `fields['items.0.name']`, a dotted path the values' type does not list. */
function signUp() {
    return createForm<Record<string, unknown>>({ initialValues: { email: 'ann@example.test', items: [{ name: 'a' }, { name: 'b' }] } });
}

async function rejectedWith(form: ReturnType<typeof signUp>, err: unknown): Promise<void> {
    await form.handleSubmit(() => Promise.reject(err))(submitEvent());
}

describe('server field errors in RFC 9457 shape', () => {
    it('land on their fields, and what matches no field is the form\'s error', async () => {
        const form = signUp();
        await rejectedWith(form, new HttpError(422, 'Unprocessable Entity', '/api/sign-up', problem));
        expect(form.fields.email.error(), 'the email field shows nothing of the server\'s refusal').toBe('Already registered');
        expect(form.fields['items.0.name'].error(), 'a row field missed its message').toBe('Required');
        expect(form.fields['items.1.name'].error()).toBeUndefined();
        expect(form.formError(), 'the message for no field went nowhere').toBe('Try later');
        expect(form.valid(), 'a form the server refused reads as valid').toBe(false);
        expect(form.errors()).toMatchObject({ email: 'Already registered', 'items.0.name': 'Required' });
        expect(form.state()).toBe('error');
        expect(form.submitError(), 'submitError is still the raw rejection').toBeInstanceOf(HttpError);
    });

    it('a problem thrown as it is, not wrapped in an HttpError, lands too', async () => {
        const form = signUp();
        await rejectedWith(form, { errors: { email: 'Taken' } });
        expect(form.fields.email.error()).toBe('Taken');
    });

    it('editing a field clears its message and leaves the others', async () => {
        const form = signUp();
        await rejectedWith(form, new HttpError(422, 'Unprocessable Entity', '/api/sign-up', problem));
        form.fields.email.onChange('bob@example.test');
        expect(form.fields.email.error(), 'the server\'s message outlived the edit').toBeUndefined();
        expect(form.fields['items.0.name'].error()).toBe('Required');
        expect(form.formError()).toBe('Try later');
    });

    it('a new submit clears them all before it validates', async () => {
        const form = signUp();
        await rejectedWith(form, new HttpError(422, 'Unprocessable Entity', '/api/sign-up', problem));
        let seenDuringSubmit: unknown[] = [];
        await form.handleSubmit(() => {
            seenDuringSubmit = [form.fields.email.error(), form.fields['items.0.name'].error(), form.formError()];
            return Promise.resolve();
        })(submitEvent());
        expect(seenDuringSubmit, 'the old server errors were still there during the next submit').toEqual([undefined, undefined, undefined]);
        expect(form.valid()).toBe(true);
        expect(form.state()).toBe('success');
    });

    it('control — a plain Error leaves every field as it was, and no form error', async () => {
        const form = signUp();
        await rejectedWith(form, new Error('network'));
        expect(form.fields.email.error()).toBeUndefined();
        expect(form.formError()).toBeUndefined();
        expect(form.valid()).toBe(true);
        expect(form.state()).toBe('error');
    });

    it('a field\'s own validator wins over the server\'s message', async () => {
        const form = createForm({
            initialValues: { email: '' },
            validators: { email: [(v: unknown) => (v ? undefined : 'Required here')] },
        });
        await form.handleSubmit(() => Promise.reject({ errors: { email: 'Taken' } }))(submitEvent());
        // The submit stopped on its own validation: nothing reached the server.
        expect(form.fields.email.error()).toBe('Required here');
    });
});
