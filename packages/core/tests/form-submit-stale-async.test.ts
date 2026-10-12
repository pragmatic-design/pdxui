// A submit never sends a value it did not validate (#253; beta spec, data.md, F4).
//
// The async validators of a submit run on the values the submit started with. When a field changed
// during that wait, the stale guard (rightly) dropped the answer about the old value — and dropped
// meant "no error", so the submit went on and `getValues()` read the new value, which no validator,
// sync or async, had seen. A value edited while the submit is validating now stops that submit: it
// returns invalid, and the next submit validates the new value.

import { describe, it, expect, vi } from 'vitest';
import { createForm, required } from '../src/index';
import { createFormCoordinator } from '../src/form/form-coordinator';

/** An async validator whose answers the test gives by hand, one per call, in order. */
function heldValidator() {
    const pending: ((err: string | undefined) => void)[] = [];
    const seen: unknown[] = [];
    const validator = (value: unknown) => {
        seen.push(value);
        return new Promise<string | undefined>((resolve) => { pending.push(resolve); });
    };
    return { validator, seen, answer: (err?: string) => pending.shift()!(err) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function signUp(check: ReturnType<typeof heldValidator>) {
    return createForm({
        initialValues: { username: 'ann' },
        validators: { username: [required()] },
        asyncValidators: { username: check.validator },
    });
}

describe('a value edited while the submit is validating', () => {
    it('stops that submit, and leaves the form idle', async () => {
        const check = heldValidator();
        const form = signUp(check);
        const save = vi.fn();

        const submitting = form.handleSubmit(save)(new Event('submit'));
        await flush();
        expect(check.seen, 'the async check never started').toEqual(['ann']);

        form.fields.username.onChange('ann!');
        check.answer(undefined); // "ann" is free — an answer about a value the field has left
        await submitting;

        expect(save, 'the submit sent a value no validator had seen').not.toHaveBeenCalled();
        expect(form.state()).toBe('idle');
    });

    it('the next submit validates the new value, and sends it', async () => {
        const check = heldValidator();
        const form = signUp(check);
        const save = vi.fn();

        const first = form.handleSubmit(save)(new Event('submit'));
        await flush();
        form.fields.username.onChange('ann!');
        check.answer(undefined);
        await first;

        const second = form.handleSubmit(save)(new Event('submit'));
        await flush();
        expect(check.seen.at(-1), 'the second submit did not check the new value').toBe('ann!');
        check.answer(undefined);
        await second;
        expect(save).toHaveBeenCalledTimes(1);
        expect(save.mock.calls[0][0]).toEqual({ username: 'ann!' });
    });

    it('shows the new value\'s sync error at once, as an edit would', async () => {
        const check = heldValidator();
        const form = signUp(check);
        const save = vi.fn();

        const submitting = form.handleSubmit(save)(new Event('submit'));
        await flush();
        form.fields.username.onChange('');
        check.answer(undefined);
        await submitting;

        expect(save).not.toHaveBeenCalled();
        expect(form.fields.username.error(), 'the emptied field shows no error').toBeTruthy();
    });

    it('control: a value that does not change submits as before', async () => {
        const check = heldValidator();
        const form = signUp(check);
        const save = vi.fn();

        const submitting = form.handleSubmit(save)(new Event('submit'));
        await flush();
        check.answer(undefined);
        await submitting;

        expect(save).toHaveBeenCalledWith({ username: 'ann' });
    });

    it('stops a coordinated submit too', async () => {
        const check = heldValidator();
        const form = signUp(check);
        const coordinator = createFormCoordinator();
        coordinator.register('account', form);
        const save = vi.fn();

        const submitting = coordinator.submitAll(save);
        await flush();
        form.fields.username.onChange('ann!');
        check.answer(undefined);

        expect(await submitting, 'submitAll reported success').toBe(false);
        expect(save).not.toHaveBeenCalled();
    });
});
