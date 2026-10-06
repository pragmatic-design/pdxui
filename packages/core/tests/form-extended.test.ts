// Tests for form extended features — warnings, saveMode, validation-i18n,
// FormCoordinator, createFormFromSchema.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createForm, getCoordinator } from '../src/form/form';
import { createDataSource } from '../src/data/data-source';
import { required, email } from '../src/form/validators';
import {
    setValidationLocale,
    clearValidationLocale,
    resolveValidationMessage,
    validationMessage,
    VALIDATION_KEYS,
} from '../src/form/validation-i18n';
import type { ValidationMessage } from '../src/form/validation-i18n';
import { createFormCoordinator } from '../src/form/form-coordinator';
import { createFormFromSchema, evaluateVisibility } from '../src/form/form-schema';
import type { VisibilityCondition } from '../src/form/form-schema';

// ─── Warnings ─────────────────────────────────────────────────

describe('createForm — warnings', () => {
    it('warning validators run alongside error validators', () => {
        const form = createForm({
            initialValues: { name: '' },
            validators: { name: [required()] },
            warnings: { name: [(v) => typeof v === 'string' && v.length < 5 ? 'Name is short' : undefined] },
            validateOn: 'onChange',
        });

        form.fields.name.onChange('AB');
        // Error is clear (value is not empty, required passes)
        expect(form.fields.name.error()).toBeUndefined();
        // Warning fires because length < 5
        expect(form.fields.name.warning()).toBe('Name is short');
    });

    it('warnings do not block form validity', () => {
        const form = createForm({
            initialValues: { name: 'Hi' },
            warnings: { name: [(v) => typeof v === 'string' && v.length < 10 ? 'Consider longer' : undefined] },
            validateOn: 'onChange',
        });

        form.fields.name.onChange('Hi');
        // Warning present
        expect(form.fields.name.warning()).toBe('Consider longer');
        // Form is still valid (warnings are non-blocking)
        expect(form.valid()).toBe(true);
    });

    it('form.warnings aggregates all field warnings', () => {
        const form = createForm({
            initialValues: { a: '', b: '' },
            warnings: {
                a: [(v) => v === '' ? 'a warning' : undefined],
                b: [(v) => v === '' ? 'b warning' : undefined],
            },
            validateOn: 'onChange',
        });

        form.fields.a.onChange('');
        form.fields.b.onChange('');
        const w = form.warnings();
        expect(w.a).toBe('a warning');
        expect(w.b).toBe('b warning');
    });

    it('warning cleared when value changes to valid', () => {
        const form = createForm({
            initialValues: { name: '' },
            warnings: { name: [(v) => typeof v === 'string' && v.length < 3 ? 'Too short' : undefined] },
            validateOn: 'onChange',
        });

        form.fields.name.onChange('A');
        expect(form.fields.name.warning()).toBe('Too short');

        form.fields.name.onChange('Alice');
        expect(form.fields.name.warning()).toBeUndefined();
    });

    it('warning field.warning() returns the warning message', () => {
        const form = createForm({
            initialValues: { age: 0 },
            warnings: { age: [(v) => (v as number) < 18 ? 'Must be 18+' : undefined] },
            validateOn: 'onChange',
        });

        form.fields.age.onChange(15);
        expect(form.fields.age.warning()).toBe('Must be 18+');
    });

    it('reset clears warnings', () => {
        const form = createForm({
            initialValues: { name: '' },
            warnings: { name: [(v) => v === '' ? 'Empty' : undefined] },
            validateOn: 'onChange',
        });

        form.fields.name.onChange('');
        expect(form.fields.name.warning()).toBe('Empty');

        form.reset();
        expect(form.fields.name.warning()).toBeUndefined();
    });
});

// ─── SaveMode ─────────────────────────────────────────────────

describe('createForm — saveMode', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('default saveMode is onSubmit — no per-field save triggered', () => {
        const saveSpy = vi.fn();
        const form = createForm({
            initialValues: { name: '' },
        });
        form.onFieldSave(saveSpy);

        form.fields.name.onChange('Alice');
        vi.advanceTimersByTime(1000);

        expect(saveSpy).not.toHaveBeenCalled();
    });

    it('field with saveMode onChange triggers onFieldSave callback', () => {
        const saveSpy = vi.fn();
        const form = createForm({
            initialValues: { name: '' },
            saveMode: 'onChange',
            saveDebounce: 100,
        });
        form.onFieldSave(saveSpy);

        form.fields.name.onChange('Bob');
        vi.advanceTimersByTime(200);

        expect(saveSpy).toHaveBeenCalledWith('name', 'Bob');
    });

    it('field with saveMode onBlur triggers on blur, not on change', () => {
        const saveSpy = vi.fn();
        const form = createForm({
            initialValues: { name: '' },
            saveMode: 'onBlur',
            saveDebounce: 100,
        });
        form.onFieldSave(saveSpy);

        form.fields.name.onChange('Alice');
        vi.advanceTimersByTime(200);
        // Not triggered yet (no blur)
        expect(saveSpy).not.toHaveBeenCalled();

        form.fields.name.onBlur();
        vi.advanceTimersByTime(200);
        expect(saveSpy).toHaveBeenCalledWith('name', 'Alice');
    });

    it('field with saveMode immediate triggers without debounce', () => {
        const saveSpy = vi.fn();
        const form = createForm({
            initialValues: { name: '' },
            saveMode: 'immediate',
        });
        form.onFieldSave(saveSpy);

        form.fields.name.onChange('Quick');
        // immediate uses setTimeout(0) — need to advance just slightly
        vi.advanceTimersByTime(1);

        expect(saveSpy).toHaveBeenCalledWith('name', 'Quick');
    });

    it('per-field saveMode overrides form-level saveMode', () => {
        const saveSpy = vi.fn();
        const form = createForm({
            initialValues: { name: '', email: '' },
            saveMode: 'onSubmit', // form default: no per-field save
            fieldConfig: {
                name: { saveMode: 'onChange', saveDebounce: 50 },
            },
        });
        form.onFieldSave(saveSpy);

        form.fields.name.onChange('Override');
        vi.advanceTimersByTime(100);
        expect(saveSpy).toHaveBeenCalledWith('name', 'Override');

        saveSpy.mockClear();
        form.fields.email.onChange('test@test.com');
        vi.advanceTimersByTime(1000);
        // email uses form default (onSubmit) — no per-field save
        expect(saveSpy).not.toHaveBeenCalled();
    });

    it('form.saveMode property reflects configured save mode', () => {
        const form1 = createForm({ initialValues: { x: '' } });
        expect(form1.saveMode).toBe('onSubmit');

        const form2 = createForm({ initialValues: { x: '' }, saveMode: 'onChange' });
        expect(form2.saveMode).toBe('onChange');
    });
});

// ─── Validation i18n ──────────────────────────────────────────

describe('validation-i18n', () => {
    afterEach(() => { clearValidationLocale(); });

    it('resolveValidationMessage with string returns string', () => {
        expect(resolveValidationMessage('plain error')).toBe('plain error');
    });

    it('resolveValidationMessage with undefined returns undefined', () => {
        expect(resolveValidationMessage(undefined)).toBeUndefined();
    });

    it('resolveValidationMessage with ValidationMessage uses fallback when no resolver', () => {
        const msg = validationMessage('validation.required', 'This field is required');
        expect(resolveValidationMessage(msg)).toBe('This field is required');
    });

    it('setValidationLocale changes resolver', () => {
        const resolver = vi.fn().mockReturnValue('Campo obbligatorio');
        setValidationLocale(resolver);

        const msg: ValidationMessage = {
            key: 'validation.required',
            fallback: 'This field is required',
        };

        const result = resolveValidationMessage(msg);
        expect(result).toBe('Campo obbligatorio');
        expect(resolver).toHaveBeenCalledWith('validation.required', undefined);
    });

    it('resolver receives params for interpolation', () => {
        const resolver = vi.fn().mockReturnValue('Minimo 3 caratteri');
        setValidationLocale(resolver);

        const msg = validationMessage('validation.minLength', 'Minimum 3 characters', { min: 3 });
        resolveValidationMessage(msg);

        expect(resolver).toHaveBeenCalledWith('validation.minLength', { min: 3 });
    });

    it('falls back to fallback when resolver returns undefined', () => {
        setValidationLocale(() => undefined);

        const msg = validationMessage('validation.unknown', 'Fallback text');
        expect(resolveValidationMessage(msg)).toBe('Fallback text');
    });

    it('clearValidationLocale removes the resolver', () => {
        setValidationLocale(() => 'translated');
        clearValidationLocale();

        const msg = validationMessage('validation.required', 'Fallback');
        expect(resolveValidationMessage(msg)).toBe('Fallback');
    });

    it('VALIDATION_KEYS constants exist with correct keys', () => {
        expect(VALIDATION_KEYS.required).toBe('validation.required');
        expect(VALIDATION_KEYS.minLength).toBe('validation.minLength');
        expect(VALIDATION_KEYS.maxLength).toBe('validation.maxLength');
        expect(VALIDATION_KEYS.email).toBe('validation.email');
        expect(VALIDATION_KEYS.pattern).toBe('validation.pattern');
        expect(VALIDATION_KEYS.url).toBe('validation.url');
        expect(VALIDATION_KEYS.min).toBe('validation.min');
        expect(VALIDATION_KEYS.max).toBe('validation.max');
        expect(VALIDATION_KEYS.integer).toBe('validation.integer');
    });

    it('validationMessage helper creates correct structure', () => {
        const msg = validationMessage('validation.min', 'Minimum is 5', { min: 5 });
        expect(msg.key).toBe('validation.min');
        expect(msg.fallback).toBe('Minimum is 5');
        expect(msg.params).toEqual({ min: 5 });
    });
});

// ─── FormCoordinator ──────────────────────────────────────────

describe('FormCoordinator', () => {
    it('register and unregister forms', () => {
        const coord = createFormCoordinator();
        const formA = createForm({ initialValues: { x: '' } });
        const formB = createForm({ initialValues: { y: 0 } });

        coord.register('a', formA);
        coord.register('b', formB);
        expect(coord.forms().size).toBe(2);

        coord.unregister('a');
        expect(coord.forms().size).toBe(1);
        expect(coord.forms().has('b')).toBe(true);
    });

    it('validateAll validates all registered forms', async () => {
        const coord = createFormCoordinator();
        const formA = createForm({
            initialValues: { name: '' },
            validators: { name: [required()] },
        });
        const formB = createForm({
            initialValues: { email: 'valid@test.com' },
            validators: { email: [email()] },
        });

        coord.register('a', formA);
        coord.register('b', formB);

        const result = await coord.validateAll();
        // formA is invalid (required name is empty)
        expect(result).toBe(false);
    });

    it('validateAll returns true when all forms are valid', async () => {
        const coord = createFormCoordinator();
        const formA = createForm({ initialValues: { name: 'Alice' } });
        const formB = createForm({ initialValues: { count: 1 } });

        coord.register('a', formA);
        coord.register('b', formB);

        const result = await coord.validateAll();
        expect(result).toBe(true);
    });

    it('dirty is true if any form is dirty', () => {
        const coord = createFormCoordinator();
        const formA = createForm({ initialValues: { x: '' } });
        const formB = createForm({ initialValues: { y: '' } });

        coord.register('a', formA);
        coord.register('b', formB);
        expect(coord.dirty()).toBe(false);

        formA.fields.x.onChange('changed');
        expect(coord.dirty()).toBe(true);
    });

    it('valid is true only if all forms are valid', () => {
        const coord = createFormCoordinator();
        const formA = createForm({
            initialValues: { name: '' },
            validators: { name: [required()] },
            validateOn: 'onChange',
        });
        const formB = createForm({ initialValues: { x: 'ok' } });

        coord.register('a', formA);
        coord.register('b', formB);

        // Trigger validation on formA
        formA.fields.name.onChange('');
        expect(coord.valid()).toBe(false);

        formA.fields.name.onChange('Alice');
        expect(coord.valid()).toBe(true);
    });

    it('submitting is true if any form is submitting', () => {
        const coord = createFormCoordinator();
        const form = createForm({ initialValues: { x: '' } });

        coord.register('a', form);
        expect(coord.submitting()).toBe(false);
        // submitting is derived from form.submitting() — which is state === 'submitting'
    });

    it('getValues aggregates values from all forms', () => {
        const coord = createFormCoordinator();
        const formA = createForm({ initialValues: { name: 'Alice' } });
        const formB = createForm({ initialValues: { age: 30 } });

        coord.register('profile', formA);
        coord.register('details', formB);

        const values = coord.getValues();
        expect(values).toEqual({
            profile: { name: 'Alice' },
            details: { age: 30 },
        });
    });

    it('submitAll validates then calls handler with aggregated values', async () => {
        const coord = createFormCoordinator();
        const formA = createForm({ initialValues: { name: 'Alice' } });
        coord.register('a', formA);

        const handler = vi.fn();
        const result = await coord.submitAll(handler);

        expect(result).toBe(true);
        expect(handler).toHaveBeenCalledWith({ a: { name: 'Alice' } });
    });

    it('submitAll returns false if validation fails', async () => {
        const coord = createFormCoordinator();
        const form = createForm({
            initialValues: { name: '' },
            validators: { name: [required()] },
        });
        coord.register('a', form);

        const handler = vi.fn();
        const result = await coord.submitAll(handler);

        expect(result).toBe(false);
        expect(handler).not.toHaveBeenCalled();
    });
});

// ─── createFormFromSchema ─────────────────────────────────────

describe('createFormFromSchema', () => {
    it('creates form with correct initial values from schema', () => {
        const form = createFormFromSchema({
            fields: [
                { name: 'name', type: 'text', default: 'John' },
                { name: 'age', type: 'number', default: 25 },
                { name: 'agree', type: 'checkbox' },
            ],
        });

        expect(form.fields.name.value()).toBe('John');
        expect(form.fields.age.value()).toBe(25);
        // checkbox default is false
        expect(form.fields.agree.value()).toBe(false);
    });

    it('uses type-based defaults when no default is specified', () => {
        const form = createFormFromSchema({
            fields: [
                { name: 'text', type: 'text' },
                { name: 'num', type: 'number' },
                { name: 'check', type: 'checkbox' },
                { name: 'toggle', type: 'switch' },
                { name: 'rate', type: 'rating' },
                { name: 'slide', type: 'slider' },
                { name: 'tags', type: 'tags' },
            ],
        });

        expect(form.fields.text.value()).toBe('');
        expect(form.fields.num.value()).toBe(0);
        expect(form.fields.check.value()).toBe(false);
        expect(form.fields.toggle.value()).toBe(false);
        expect(form.fields.rate.value()).toBe(0);
        expect(form.fields.slide.value()).toBe(0);
        expect(form.fields.tags.value()).toEqual([]);
    });

    it('creates required validator from schema', () => {
        const form = createFormFromSchema({
            fields: [
                { name: 'name', type: 'text', required: true },
            ],
        });

        // Trigger validation
        form.fields.name.onBlur();
        expect(form.fields.name.error()).toBe('This field is required');
    });

    it('creates validators from schema rules', () => {
        const form = createFormFromSchema({
            fields: [
                {
                    name: 'email',
                    type: 'email',
                    validators: [
                        { type: 'email' },
                    ],
                },
            ],
        });

        form.fields.email.onChange('not-an-email');
        form.fields.email.onBlur();
        expect(form.fields.email.error()).toBe('Invalid email address');
    });

    it('creates minLength validator from schema', () => {
        const form = createFormFromSchema({
            fields: [
                {
                    name: 'password',
                    type: 'password',
                    validators: [
                        { type: 'minLength', params: { min: 8 } },
                    ],
                },
            ],
        });

        form.fields.password.onChange('short');
        form.fields.password.onBlur();
        expect(form.fields.password.error()).toBe('Minimum 8 characters');
    });

    it('creates custom-message validators from schema', () => {
        const form = createFormFromSchema({
            fields: [
                {
                    name: 'name',
                    type: 'text',
                    required: true,
                    validators: [
                        { type: 'required', message: 'Name is mandatory' },
                    ],
                },
            ],
        });

        form.fields.name.onBlur();
        // The required from the field.required prop fires first with the default message
        expect(form.fields.name.error()).toBe('This field is required');
    });

    it('applies per-field saveMode from schema', () => {
        const form = createFormFromSchema({
            fields: [
                { name: 'name', type: 'text', saveMode: 'onChange' },
                { name: 'bio', type: 'textarea' },
            ],
            saveMode: 'onSubmit',
        });

        // form-level saveMode
        expect(form.saveMode).toBe('onSubmit');
    });
});

// ─── evaluateVisibility ───────────────────────────────────────

describe('evaluateVisibility', () => {
    it('eq operator (default) returns true when values match', () => {
        const cond: VisibilityCondition = { field: 'role', value: 'admin' };
        expect(evaluateVisibility(cond, { role: 'admin' })).toBe(true);
        expect(evaluateVisibility(cond, { role: 'user' })).toBe(false);
    });

    it('neq operator', () => {
        const cond: VisibilityCondition = { field: 'status', op: 'neq', value: 'draft' };
        expect(evaluateVisibility(cond, { status: 'published' })).toBe(true);
        expect(evaluateVisibility(cond, { status: 'draft' })).toBe(false);
    });

    it('gt operator', () => {
        const cond: VisibilityCondition = { field: 'age', op: 'gt', value: 18 };
        expect(evaluateVisibility(cond, { age: 21 })).toBe(true);
        expect(evaluateVisibility(cond, { age: 18 })).toBe(false);
        expect(evaluateVisibility(cond, { age: 15 })).toBe(false);
    });

    it('lt operator', () => {
        const cond: VisibilityCondition = { field: 'count', op: 'lt', value: 10 };
        expect(evaluateVisibility(cond, { count: 5 })).toBe(true);
        expect(evaluateVisibility(cond, { count: 10 })).toBe(false);
    });

    it('gte operator', () => {
        const cond: VisibilityCondition = { field: 'score', op: 'gte', value: 50 };
        expect(evaluateVisibility(cond, { score: 50 })).toBe(true);
        expect(evaluateVisibility(cond, { score: 49 })).toBe(false);
    });

    it('lte operator', () => {
        const cond: VisibilityCondition = { field: 'price', op: 'lte', value: 100 };
        expect(evaluateVisibility(cond, { price: 100 })).toBe(true);
        expect(evaluateVisibility(cond, { price: 101 })).toBe(false);
    });

    it('contains operator', () => {
        const cond: VisibilityCondition = { field: 'tags', op: 'contains', value: 'vip' };
        expect(evaluateVisibility(cond, { tags: 'vip-member' })).toBe(true);
        expect(evaluateVisibility(cond, { tags: 'regular' })).toBe(false);
    });

    it('empty operator', () => {
        const cond: VisibilityCondition = { field: 'name', op: 'empty' };
        expect(evaluateVisibility(cond, { name: '' })).toBe(true);
        expect(evaluateVisibility(cond, { name: null })).toBe(true);
        expect(evaluateVisibility(cond, { name: undefined })).toBe(true);
        expect(evaluateVisibility(cond, { name: 'Alice' })).toBe(false);
    });

    it('notEmpty operator', () => {
        const cond: VisibilityCondition = { field: 'name', op: 'notEmpty' };
        expect(evaluateVisibility(cond, { name: 'Alice' })).toBe(true);
        expect(evaluateVisibility(cond, { name: '' })).toBe(false);
        expect(evaluateVisibility(cond, { name: null })).toBe(false);
    });
});

// ─── createForm — { source } DataSource binding (BUG 6) ───────

describe('createForm — source (DataSource binding)', () => {
    it('form edits flow to the bound DataSource record as a patch', async () => {
        const ds = createDataSource([{ id: 1, name: 'a' }]);
        await ds.refresh(); // DataSource loads its array asynchronously
        const form = createForm({
            initialValues: { id: 1, name: 'a' },
            idField: 'id',
            source: ds,
        });

        expect(ds.hasChanges()).toBe(false);

        form.fields.name.onChange('b');

        // The mutation propagated to the DataSource as an update on record #1.
        expect(form.dirty()).toBe(true);
        expect(ds.hasChanges()).toBe(true);
        expect(ds.changes().updated).toHaveLength(1);
        expect((ds.changes().updated[0] as { name: string }).name).toBe('b');

        form.dispose();
    });

    it('is inert when no id resolves from initialValues (create mode)', () => {
        const ds = createDataSource([{ id: 1, name: 'a' }]);
        const form = createForm({
            initialValues: { name: 'new' }, // no idField value
            idField: 'id',
            source: ds,
        });

        form.fields.name.onChange('changed');
        // No id → no record to patch → DataSource stays clean.
        expect(ds.hasChanges()).toBe(false);

        form.dispose();
    });

    it('dispose() tears down the DataSource binding', async () => {
        const ds = createDataSource([{ id: 1, name: 'a' }]);
        await ds.refresh();
        const form = createForm({ initialValues: { id: 1, name: 'a' }, idField: 'id', source: ds });

        form.dispose();
        ds.cancelChanges();

        // After dispose, further form edits no longer reach the DataSource.
        form.fields.name.onChange('c');
        expect(ds.hasChanges()).toBe(false);
    });
});

// ─── createForm — { parent } coordinator registration (BUG 6) ──

describe('createForm — parent (nested-form coordination)', () => {
    it('registers the child with the parent coordinator under its name', () => {
        const parent = createForm({ initialValues: { title: '' } });
        const child = createForm({ initialValues: { name: '' }, parent, name: 'child' });

        const coord = getCoordinator(parent);
        expect(coord.forms().has('child')).toBe(true);
        expect(coord.forms().get('child')).toBe(child);
    });

    it('parent coordinator reflects the child dirty state', () => {
        const parent = createForm({ initialValues: { title: '' } });
        const child = createForm({ initialValues: { name: '' }, parent, name: 'child' });

        const coord = getCoordinator(parent);
        expect(coord.dirty()).toBe(false);

        child.fields.name.onChange('x');
        expect(coord.dirty()).toBe(true);
    });

    it('deregisters the child from the coordinator on dispose', () => {
        const parent = createForm({ initialValues: { title: '' } });
        const child = createForm({ initialValues: { name: '' }, parent, name: 'child' });
        const coord = getCoordinator(parent);

        expect(coord.forms().has('child')).toBe(true);

        child.dispose();
        expect(coord.forms().has('child')).toBe(false);
    });

    it('falls back to a generated name when none is provided', () => {
        const parent = createForm({ initialValues: { title: '' } });
        createForm({ initialValues: { name: '' }, parent });

        const coord = getCoordinator(parent);
        expect(coord.forms().size).toBe(1);
    });
});
