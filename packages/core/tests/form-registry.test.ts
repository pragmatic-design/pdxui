// Coverage (C): form-registry — custom form-control registration.

import { describe, it, expect } from 'vitest';
import {
    registerFormControl,
    registerFormFieldType,
    isFormControl,
    getFormControlConfig,
    getFieldTypeTag,
    getRegisteredFormControls,
} from '../src/form/form-registry';

describe('form registry', () => {
    it('registers built-in controls at import time', () => {
        expect(isFormControl('pdx-input')).toBe(true);
        expect(isFormControl('pdx-checkbox')).toBe(true);
        expect(isFormControl('pdx-select')).toBe(true);
    });

    it('marks text inputs with textInput + pdx-input event', () => {
        const cfg = getFormControlConfig('pdx-input');
        expect(cfg?.textInput).toBe(true);
        expect(cfg?.valueEvent).toBe('pdx-input');
    });

    it('marks checkbox/switch as checked controls', () => {
        expect(getFormControlConfig('pdx-checkbox')?.checked).toBe(true);
        expect(getFormControlConfig('pdx-switch')?.checked).toBe(true);
    });

    it('captures special event names (toggle)', () => {
        const cfg = getFormControlConfig('pdx-toggle');
        expect(cfg?.valueEvent).toBe('pressedchange');
        expect(cfg?.valueExpr).toBe('e.detail?.pressed');
    });

    it('registers a custom control (case-insensitive)', () => {
        registerFormControl('My-Date-Picker', { valueEvent: 'change' });
        expect(isFormControl('my-date-picker')).toBe(true);
        expect(getFormControlConfig('MY-DATE-PICKER')?.valueEvent).toBe('change');
    });

    it('defaults config to {} when omitted', () => {
        registerFormControl('pdx-bare-control');
        expect(getFormControlConfig('pdx-bare-control')).toEqual({});
    });

    it('maps schema field types to tags (lowercased)', () => {
        registerFormFieldType('datepicker', 'My-Date-Picker');
        expect(getFieldTypeTag('datepicker')).toBe('my-date-picker');
        expect(getFieldTypeTag('unknown-type')).toBeUndefined();
    });

    it('isFormControl is false for unregistered tags', () => {
        expect(isFormControl('div')).toBe(false);
    });

    it('lists all registered controls (built-ins + custom)', () => {
        const all = getRegisteredFormControls();
        expect(all).toContain('pdx-input');
        expect(all).toContain('my-date-picker');
        expect(all.length).toBeGreaterThan(10);
    });
});
