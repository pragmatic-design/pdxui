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

    it('marks checkbox/switch as checked controls, on their model\'s event (#480)', () => {
        for (const tag of ['pdx-checkbox', 'pdx-switch']) {
            expect(getFormControlConfig(tag)).toMatchObject({ checked: true, valueProp: 'checked', valueEvent: 'checked-change', valueExpr: 'e.detail?.value' });
        }
    });

    it('describes a control that declares a model by its model (#480)', () => {
        expect(getFormControlConfig('pdx-toggle')).toMatchObject({ valueProp: 'pressed', valueEvent: 'pressed-change', valueExpr: 'e.detail?.value' });
        for (const tag of ['pdx-radio-group', 'pdx-checkbox-group', 'pdx-segmented', 'pdx-slider', 'pdx-rating']) {
            expect(getFormControlConfig(tag)?.valueEvent, tag).toBe('value-change');
        }
    });

    it('control: one with no model yet keeps the default alpha event', () => {
        expect(getFormControlConfig('pdx-select')).toEqual({});
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
