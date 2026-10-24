// inheritedForm(el): the form a section inherits, read lazily (#613).
//
// What `@form f: Schema from parent;` compiles to. Each `f.x` is one stand-in, made once, that reads
// the form above `el` when asked; called, it calls the form's member of that name.

import { describe, it, expect, beforeEach } from 'vitest';
import { createForm, provideForm, inheritedForm, effect, required } from '../src';
import { TWO_WAY_FIELD } from '../src/renderer/two-way-value';

let host: HTMLElement;
let child: HTMLElement;

beforeEach(() => {
    document.body.innerHTML = '';
    host = document.createElement('div');
    child = document.createElement('span');
    host.appendChild(child);
    document.body.appendChild(host);
});

const makeForm = () => createForm({ initialValues: { email: 'a@b.c' }, validators: { email: [required('Needed')] } });

describe('inheritedForm', () => {
    it('reads the field of the form above, and writes it', () => {
        const form = makeForm();
        provideForm(form, host);
        const f = inheritedForm<{ email: string }>(child);
        expect(f.email.value()).toBe('a@b.c');
        f.email.onChange('x@y.z');
        expect(form.email.value()).toBe('x@y.z');
        expect(f.email.required).toBe(true);
    });

    it('is the same stand-in every read, so a binding can hold it', () => {
        const f = inheritedForm<{ email: string }>(child);
        expect(f.email).toBe(f.email);
    });

    it('called, it calls the form\'s member: f.reset(), f.getValues()', () => {
        const form = makeForm();
        provideForm(form, host);
        const f = inheritedForm<{ email: string }>(child);
        f.email.onChange('changed');
        f.reset();
        expect(form.email.value()).toBe('a@b.c');
        expect(f.getValues()).toEqual({ email: 'a@b.c' });
    });

    it('without a form, it reads nothing and writes nowhere', () => {
        const f = inheritedForm<{ email: string }>(child);
        expect(f.email.value()).toBeUndefined();
        expect(f.email.required).toBe(false);
        expect(() => f.email.onChange('x')).not.toThrow();
        const twoWay = (f.email as unknown as { [TWO_WAY_FIELD]: { invalid(): boolean; hold(fn: () => void): () => void } })[TWO_WAY_FIELD];
        expect(twoWay.invalid()).toBe(false);
        expect(typeof twoWay.hold(() => {})).toBe('function');
    });

    it('an effect that read it before the form was there runs again when the form is provided', () => {
        const f = inheritedForm<{ email: string }>(child);
        const seen: unknown[] = [];
        const dispose = effect(() => { seen.push(f.email.value()); });
        expect(seen).toEqual([undefined]);
        provideForm(makeForm(), host);
        expect(seen.at(-1)).toBe('a@b.c');
        dispose();
    });

    it('is not a thenable, and a symbol is not a member', async () => {
        const f = inheritedForm(child) as unknown as Record<PropertyKey, unknown>;
        expect(f.then).toBeUndefined();
        expect(f[Symbol.toPrimitive]).toBeUndefined();
        await expect(Promise.resolve(f)).resolves.toBe(f);
    });
});
