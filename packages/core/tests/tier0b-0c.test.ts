// Regression tests for Tier 0B (component strings, toast) and 0C (compound, adaptive, skeleton)
import { describe, it, expect } from 'vitest';
import { registerComponentStrings, setComponentStrings, getComponentString, setLocaleStrings, clearComponentStrings, getComponentStrings } from '../src/i18n/component-strings';
import { createToastQueue } from '../src/component/toast-queue';

describe('ComponentStrings', () => {
    it('registers and retrieves strings', () => {
        clearComponentStrings();
        registerComponentStrings('select', { placeholder: 'Choose...' });
        const ph = getComponentString('select', 'placeholder');
        expect(ph()).toBe('Choose...');
    });

    it('overrides with setComponentStrings', () => {
        clearComponentStrings();
        registerComponentStrings('select', { placeholder: 'Choose...' });
        setComponentStrings('select', { placeholder: 'Scegli...' });
        expect(getComponentString('select', 'placeholder')()).toBe('Scegli...');
    });

    it('returns fallback for missing key', () => {
        clearComponentStrings();
        expect(getComponentString('select', 'missing', 'default')()).toBe('default');
    });

    it('setLocaleStrings updates multiple components', () => {
        clearComponentStrings();
        setLocaleStrings({
            select: { placeholder: 'Seleziona...' },
            datepicker: { today: 'Oggi' },
        });
        expect(getComponentString('select', 'placeholder')()).toBe('Seleziona...');
        expect(getComponentString('datepicker', 'today')()).toBe('Oggi');
    });

    it('getComponentStrings returns all strings', () => {
        clearComponentStrings();
        registerComponentStrings('dialog', { close: 'Close', confirm: 'OK' });
        expect(getComponentStrings('dialog')()).toEqual({ close: 'Close', confirm: 'OK' });
    });
});

describe('ToastQueue', () => {
    it('adds and dismisses', () => {
        const q = createToastQueue({ defaultDuration: 0 });
        const id = q.add({ message: 'Hello' });
        expect(q.count()).toBe(1);
        q.dismiss(id);
        expect(q.count()).toBe(0);
    });

    it('respects maxVisible', () => {
        const q = createToastQueue({ maxVisible: 2, defaultDuration: 0 });
        q.add({ message: 'A' });
        q.add({ message: 'B' });
        q.add({ message: 'C' });
        expect(q.count()).toBe(2);
        expect(q.items()[0].message).toBe('B');
    });

    it('convenience methods set type', () => {
        const q = createToastQueue({ defaultDuration: 0 });
        q.success('ok');
        q.error('fail');
        expect(q.items()[0].type).toBe('success');
        expect(q.items()[1].type).toBe('error');
    });

    it('clear removes all', () => {
        const q = createToastQueue({ defaultDuration: 0 });
        q.add({ message: 'A' });
        q.add({ message: 'B' });
        q.clear();
        expect(q.count()).toBe(0);
    });

    it('update changes in place', () => {
        const q = createToastQueue({ defaultDuration: 0 });
        const id = q.add({ message: 'Loading...' });
        q.update(id, { message: 'Done!', type: 'success' });
        expect(q.items()[0].message).toBe('Done!');
        expect(q.items()[0].type).toBe('success');
    });
});
