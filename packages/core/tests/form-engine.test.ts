import { describe, it, expect } from 'vitest';
import { createFormEngine } from '../src/data/form-engine';
import { waitUntil } from './wait-until';

describe('FormEngine', () => {
    it('registers fields with initial values', () => {
        const form = createFormEngine();
        const name = form.field('name', { initialValue: 'John' });
        expect(name.value()).toBe('John');
        expect(name.dirty()).toBe(false);
        expect(name.touched()).toBe(false);
        expect(form.state.dirty()).toBe(false);
    });

    it('tracks dirty state on value change', () => {
        const form = createFormEngine();
        const name = form.field('name', { initialValue: '' });
        name.set('Alice');
        expect(name.dirty()).toBe(true);
        expect(name.value()).toBe('Alice');
        expect(form.state.dirty()).toBe(true);
    });

    it('tracks touched state on blur', () => {
        const form = createFormEngine();
        const name = form.field('name', { initialValue: '' });
        expect(name.touched()).toBe(false);
        name.touch();
        expect(name.touched()).toBe(true);
    });

    it('validates with sync rules', async () => {
        const form = createFormEngine();
        const name = form.field('name', {
            initialValue: '',
            rules: [(v) => v ? null : 'Required'],
        });
        const errors = await name.validate();
        expect(errors).toEqual(['Required']);
        expect(name.errors()).toEqual(['Required']);
        expect(form.state.valid()).toBe(false);
    });

    it('validates with async rules', async () => {
        const form = createFormEngine();
        const email = form.field('email', {
            initialValue: 'bad',
            rules: [async (v) => String(v).includes('@') ? null : 'Invalid email'],
        });
        const errors = await email.validate();
        expect(errors).toEqual(['Invalid email']);
    });

    it('cross-field validation has access to all form values', async () => {
        const form = createFormEngine();
        form.field('password', { initialValue: 'abc123' });
        const confirm = form.field('confirmPassword', {
            initialValue: 'different',
            rules: [(_v, all) => _v === all.password ? null : 'Passwords must match'],
            validateOnChange: false,
        });
        const errors = await confirm.validate();
        expect(errors).toEqual(['Passwords must match']);
    });

    it('validate() checks all fields', async () => {
        const form = createFormEngine();
        form.field('a', { initialValue: '', rules: [(v) => v ? null : 'Required'] });
        form.field('b', { initialValue: '', rules: [(v) => v ? null : 'Required'] });
        const valid = await form.validate();
        expect(valid).toBe(false);
        expect(form.state.errors()).toEqual({ a: ['Required'], b: ['Required'] });
    });

    it('submit calls handler only if valid', async () => {
        const form = createFormEngine();
        const name = form.field('name', { initialValue: '', rules: [(v) => v ? null : 'Required'] });
        let called = false;
        const ok = await form.submit(() => { called = true; });
        expect(ok).toBe(false);
        expect(called).toBe(false);
        expect(form.state.submitted()).toBe(true);

        name.set('John');
        const ok2 = await form.submit(() => { called = true; });
        expect(ok2).toBe(true);
        expect(called).toBe(true);
    });

    it('reset restores all fields to initial values', async () => {
        const form = createFormEngine();
        const name = form.field('name', { initialValue: 'init' });
        name.set('changed');
        name.touch();
        expect(name.dirty()).toBe(true);
        form.reset();
        expect(name.value()).toBe('init');
        expect(name.dirty()).toBe(false);
        expect(name.touched()).toBe(false);
    });

    it('getValues returns all current values', () => {
        const form = createFormEngine();
        form.field('a', { initialValue: 1 });
        form.field('b', { initialValue: 'hello' });
        expect(form.getValues()).toEqual({ a: 1, b: 'hello' });
    });

    it('setValues updates multiple fields', () => {
        const form = createFormEngine();
        const a = form.field('a', { initialValue: 0 });
        const b = form.field('b', { initialValue: '' });
        form.setValues({ a: 42, b: 'world' });
        expect(a.value()).toBe(42);
        expect(b.value()).toBe('world');
    });

    it('validates on change by default', async () => {
        const form = createFormEngine();
        const name = form.field('name', {
            initialValue: '',
            rules: [(v) => v ? null : 'Required'],
        });
        name.set('x');
        // Wait for microtask
        await new Promise(r => setTimeout(r, 10)); // SLEEP-OK: asserts a valid field produced NO errors, so there is nothing to wait for
        expect(name.errors()).toEqual([]);
        name.set('');
        await waitUntil(() => name.errors().length > 0, 'the validator to report the empty field');
        expect(name.errors()).toEqual(['Required']);
    });
});
