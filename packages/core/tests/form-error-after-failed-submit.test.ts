// After a failed submit, correcting a field must clear its error message.
//
// Press Save with the required fields empty, then fill them in one by one: the red messages must
// go. Otherwise the submit eventually succeeds — so the form KNOWS the values are valid — while every
// field still shows the error it had. The screen and the state disagree, and the screen is the one
// the user believes.
//
// In the browser `pdx-change`/`pdx-input`/`pdx-blur` all reach the form with the right value, so
// the events are not where this breaks; what happens to them is.

import { describe, it, expect } from 'vitest';
import { createForm } from '../src/form/form';
import { required } from '../src/form/validators';

interface Job extends Record<string, unknown> { customer: string; address: string }

function makeForm() {
    return createForm<Job>({
        initialValues: { customer: '', address: '' },
        validators: {
            customer: [required('Customer is required')],
            address: [required('Address is required')],
        },
    });
}

describe('an error raised by validate() clears when the field is corrected', () => {
    it('raises the errors on a failed validate', async () => {
        const form = makeForm();
        expect(await form.validate(), 'an empty form must not validate').toBe(false);
        expect(form.fields.customer.error()).toBe('Customer is required');
        expect(form.fields.address.error()).toBe('Address is required');
    });

    it('clears one field\'s error when that field is filled and blurred', async () => {
        const form = makeForm();
        await form.validate();

        form.fields.customer.onChange('Condominio Vittoria');
        form.fields.customer.onBlur();

        expect(form.fields.customer.error(), 'a corrected field must not keep its message').toBeUndefined();
        expect(form.fields.address.error(), 'and the untouched one keeps its own').toBe('Address is required');
    });

    it('clears it on typing alone, without waiting for a blur', async () => {
        // The message is already on screen, so every keystroke is the user answering it. Making them
        // leave the field to see it go is the behaviour being reported as strange.
        const form = makeForm();
        await form.validate();

        form.fields.customer.onChange('Condominio Vittoria');

        expect(form.fields.customer.error(), 'a visible error must react to the correction').toBeUndefined();
    });

    it('puts the error back if the correction is undone', async () => {
        // The guard against "clear and never look again": emptying the field must raise it once more.
        const form = makeForm();
        await form.validate();
        form.fields.customer.onChange('Condominio Vittoria');
        form.fields.customer.onChange('');

        expect(form.fields.customer.error(), 'still required').toBe('Customer is required');
    });

    it('stays quiet on a field nobody has touched or validated', async () => {
        // And the control in the other direction: typing into a fresh form must not start throwing
        // messages at someone who has not finished typing. `validateOn` defaults to onBlur for a
        // reason, and this change must not turn it into onChange for everybody.
        const form = makeForm();
        form.fields.customer.onChange('C');
        expect(form.fields.customer.error(), 'no submit, no blur, no message').toBeUndefined();
        expect(form.fields.address.error()).toBeUndefined();
    });
});
