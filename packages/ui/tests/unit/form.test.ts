// Tests for pdx-form, pdx-form-field, pdx-form-actions, pdx-form-section components.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';

// Import components to register them
import '../../src/form/pdx-form';
import '../../src/form-field/pdx-form-field';
import '../../src/form-actions/pdx-form-actions';
import '../../src/form-section/pdx-form-section';

// ─── pdx-form ─────────────────────────────────────────────────

describe('pdx-form', () => {
    beforeEach(cleanup);

    it('renders a <form> element', async () => {
        const el = await mount('pdx-form');
        await tick(50);
        const form = el.querySelector('form');
        expect(form).toBeTruthy();
    });

    it('renders form with novalidate attribute', async () => {
        const el = await mount('pdx-form');
        await tick(50);
        const form = el.querySelector('form');
        expect(form?.hasAttribute('novalidate')).toBe(true);
    });

    it('applies pdx-form class to form element', async () => {
        const el = await mount('pdx-form');
        await tick(50);
        const form = el.querySelector('form');
        expect(form?.classList.contains('pdx-form')).toBe(true);
    });

    it('applies autocomplete attribute from prop', async () => {
        const el = await mount('pdx-form', { autocomplete: 'on' });
        await tick(50);
        const form = el.querySelector('form');
        expect(form?.getAttribute('autocomplete')).toBe('on');
    });

    it('defaults autocomplete to off', async () => {
        const el = await mount('pdx-form');
        await tick(50);
        const form = el.querySelector('form');
        expect(form?.getAttribute('autocomplete')).toBe('off');
    });
});

// ─── pdx-form-field ──────────────────────────────────────────

describe('pdx-form-field', () => {
    beforeEach(cleanup);

    it('renders wrapper div with pdx-form-field class', async () => {
        const el = await mount('pdx-form-field');
        await tick(50);
        const wrapper = el.querySelector('.pdx-form-field');
        expect(wrapper).toBeTruthy();
    });

    it('renders label when label prop is set', async () => {
        const el = await mount('pdx-form-field', { label: 'Username' });
        await tick(50);
        const label = el.querySelector('.pdx-field-label');
        expect(label).toBeTruthy();
        expect(label?.textContent).toContain('Username');
    });

    it('renders hint text when hint prop is set', async () => {
        const el = await mount('pdx-form-field', { hint: 'Enter your name' });
        await tick(50);
        const hint = el.querySelector('.pdx-field-hint');
        expect(hint).toBeTruthy();
        expect(hint?.textContent).toContain('Enter your name');
    });

    it('renders description when description prop is set', async () => {
        const el = await mount('pdx-form-field', { description: 'A longer explanation' });
        await tick(50);
        const desc = el.querySelector('.pdx-field-description');
        expect(desc).toBeTruthy();
        expect(desc?.textContent).toContain('A longer explanation');
    });

    it('shows error when error and touched props are set', async () => {
        const el = await mount('pdx-form-field', { error: 'Required', touched: '' });
        await tick(50);
        const wrapper = el.querySelector('.pdx-form-field');
        expect(wrapper?.classList.contains('has-error')).toBe(true);
        const errorEl = el.querySelector('.pdx-field-error');
        expect(errorEl).toBeTruthy();
        expect(errorEl?.textContent).toContain('Required');
    });

    it('shows error when showError is forced', async () => {
        const el = await mount('pdx-form-field');
        (el as any).error = 'Forced error';
        (el as any).showError = true;
        await tick(50);
        const wrapper = el.querySelector('.pdx-form-field');
        expect(wrapper?.classList.contains('has-error')).toBe(true);
    });

    it('does not show error when not touched and showError is false', async () => {
        const el = await mount('pdx-form-field');
        (el as any).error = 'Hidden error';
        await tick(50);
        const wrapper = el.querySelector('.pdx-form-field');
        expect(wrapper?.classList.contains('has-error')).toBe(false);
    });

    it('shows warning class and message when warning prop is set', async () => {
        const el = await mount('pdx-form-field', { warning: 'Consider a longer name' });
        await tick(50);
        const wrapper = el.querySelector('.pdx-form-field');
        expect(wrapper?.classList.contains('has-warning')).toBe(true);
        const warningEl = el.querySelector('.pdx-field-warning');
        expect(warningEl).toBeTruthy();
        expect(warningEl?.textContent).toContain('Consider a longer name');
    });

    it('shows success class when success prop is set', async () => {
        const el = await mount('pdx-form-field', { success: 'Looks good!' });
        await tick(50);
        const wrapper = el.querySelector('.pdx-form-field');
        expect(wrapper?.classList.contains('has-success')).toBe(true);
    });

    it('applies horizontal class when horizontal prop is set', async () => {
        const el = await mount('pdx-form-field', { horizontal: '' });
        await tick(50);
        const wrapper = el.querySelector('.pdx-form-field');
        expect(wrapper?.classList.contains('pdx-form-field-horizontal')).toBe(true);
    });

    it('applies required class on label when required prop is set', async () => {
        const el = await mount('pdx-form-field', { label: 'Email', required: '' });
        await tick(50);
        const label = el.querySelector('.pdx-field-label');
        expect(label?.classList.contains('pdx-field-required')).toBe(true);
    });

    it('applies disabled class when disabled prop is set', async () => {
        const el = await mount('pdx-form-field', { disabled: '' });
        await tick(50);
        const wrapper = el.querySelector('.pdx-form-field');
        expect(wrapper?.classList.contains('disabled')).toBe(true);
    });

    it('error element has role="alert"', async () => {
        const el = await mount('pdx-form-field', { error: 'Bad', touched: '' });
        await tick(50);
        const errorEl = el.querySelector('.pdx-field-error');
        expect(errorEl?.getAttribute('role')).toBe('alert');
    });

    it('error takes priority over warning', async () => {
        const el = await mount('pdx-form-field');
        (el as any).error = 'Error msg';
        (el as any).warning = 'Warning msg';
        (el as any).touched = true;
        await tick(50);
        const wrapper = el.querySelector('.pdx-form-field');
        expect(wrapper?.classList.contains('has-error')).toBe(true);
        expect(wrapper?.classList.contains('has-warning')).toBe(false);
    });
});

// ─── pdx-form-actions ─────────────────────────────────────────

describe('pdx-form-actions', () => {
    beforeEach(cleanup);

    it('renders wrapper with pdx-form-actions class', async () => {
        const el = await mount('pdx-form-actions');
        await tick(50);
        const wrapper = el.querySelector('.pdx-form-actions');
        expect(wrapper).toBeTruthy();
    });

    it('renders submit button with default label', async () => {
        const el = await mount('pdx-form-actions');
        await tick(50);
        const submitBtn = el.querySelector('button[type="submit"]');
        expect(submitBtn).toBeTruthy();
        expect(submitBtn?.textContent).toContain('Submit');
    });

    it('renders reset button with default label', async () => {
        const el = await mount('pdx-form-actions');
        await tick(50);
        const resetBtn = el.querySelector('button[type="reset"]');
        expect(resetBtn).toBeTruthy();
        expect(resetBtn?.textContent).toContain('Reset');
    });

    it('uses custom submit label when set programmatically', async () => {
        const el = await mount('pdx-form-actions');
        (el as any).submitLabel = 'Save';
        await tick(50);
        const submitBtn = el.querySelector('button[type="submit"]');
        expect(submitBtn?.textContent).toContain('Save');
    });

    it('hides reset button when resetLabel is set to none', async () => {
        const el = await mount('pdx-form-actions');
        (el as any).resetLabel = 'none';
        await tick(50);
        const resetBtn = el.querySelector('button[type="reset"]');
        expect(resetBtn).toBeNull();
    });

    it('applies alignment class', async () => {
        const el = await mount('pdx-form-actions', { align: 'center' });
        await tick(50);
        const wrapper = el.querySelector('.pdx-form-actions');
        expect(wrapper?.classList.contains('pdx-form-actions-center')).toBe(true);
    });

    it('submit button has pdx-primary class', async () => {
        const el = await mount('pdx-form-actions');
        await tick(50);
        const submitBtn = el.querySelector('button[type="submit"]');
        expect(submitBtn?.classList.contains('pdx-primary')).toBe(true);
    });

    it('reset button has pdx-ghost class', async () => {
        const el = await mount('pdx-form-actions');
        await tick(50);
        const resetBtn = el.querySelector('button[type="reset"]');
        expect(resetBtn?.classList.contains('pdx-ghost')).toBe(true);
    });
});

// ─── pdx-form-section ─────────────────────────────────────────

describe('pdx-form-section', () => {
    beforeEach(cleanup);

    it('renders fieldset element', async () => {
        const el = await mount('pdx-form-section');
        await tick(50);
        const fieldset = el.querySelector('fieldset');
        expect(fieldset).toBeTruthy();
    });

    it('renders with pdx-form-section class', async () => {
        const el = await mount('pdx-form-section');
        await tick(50);
        const fieldset = el.querySelector('.pdx-form-section');
        expect(fieldset).toBeTruthy();
    });

    it('renders legend when label prop is set', async () => {
        const el = await mount('pdx-form-section', { label: 'Personal Info' });
        await tick(50);
        const legend = el.querySelector('legend');
        expect(legend).toBeTruthy();
        expect(legend?.textContent).toContain('Personal Info');
    });

    it('has role="group" on fieldset', async () => {
        const el = await mount('pdx-form-section');
        await tick(50);
        const fieldset = el.querySelector('fieldset');
        expect(fieldset?.getAttribute('role')).toBe('group');
    });

    it('sets aria-label from label prop', async () => {
        const el = await mount('pdx-form-section', { label: 'Address' });
        await tick(50);
        const fieldset = el.querySelector('fieldset');
        expect(fieldset?.getAttribute('aria-label')).toBe('Address');
    });

    it('renders content slot area', async () => {
        const el = await mount('pdx-form-section');
        await tick(50);
        const content = el.querySelector('.pdx-form-section-content');
        expect(content).toBeTruthy();
    });

    it('applies hidden class when active is false', async () => {
        const el = await mount('pdx-form-section');
        (el as any).active = false;
        await tick(50);
        const fieldset = el.querySelector('.pdx-form-section');
        expect(fieldset?.classList.contains('pdx-form-section-hidden')).toBe(true);
    });
});
