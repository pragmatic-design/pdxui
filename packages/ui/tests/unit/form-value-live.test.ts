// Regression tests for form controls whose form value / observable state must reflect LIVE
// internal state after interaction — not the initial prop.
//
// happy-dom has no ElementInternals, so we polyfill attachInternals() to capture the value the
// component pushes via ctx.setFormValue() into `el.__formValue`.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';

import '../../src/checkbox/pdx-checkbox';
import '../../src/switch-toggle/pdx-switch';
import '../../src/radio/pdx-radio';
import '../../src/number-input/pdx-number-input';
import '../../src/slider/pdx-slider';
import '../../src/color-picker/pdx-color-picker';
import '../../src/mention/pdx-mention';

// ── Polyfill ElementInternals.setFormValue capture ──────────────────────────
if (!(HTMLElement.prototype as unknown as { attachInternals?: unknown }).attachInternals) {
    (HTMLElement.prototype as unknown as { attachInternals: () => unknown }).attachInternals = function (this: HTMLElement) {
        const host = this;
        return {
            setFormValue(v: unknown) { (host as unknown as { __formValue: unknown }).__formValue = v; },
            setValidity() {},
            checkValidity() { return true; },
            reportValidity() { return true; },
            get form() { return null; },
        };
    };
}

function formValue(el: HTMLElement): unknown {
    return (el as unknown as { __formValue: unknown }).__formValue;
}

async function mountEl(tag: string, attrs: Record<string, string> = {}): Promise<HTMLElement> {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    await tick(50);
    return el;
}

describe('form value reflects live state after interaction', () => {
    beforeEach(cleanup);

    it('checkbox: clicking submits the real checked value, not the initial prop', async () => {
        const el = await mountEl('pdx-checkbox', { value: 'on' });
        expect(formValue(el)).toBeNull(); // unchecked

        const input = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await tick();

        expect(formValue(el)).toBe('on');
    });

    it('switch: toggling submits the real checked value', async () => {
        const el = await mountEl('pdx-switch', { value: 'yes' });
        expect(formValue(el)).toBeNull();

        const input = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await tick();

        expect(formValue(el)).toBe('yes');
    });

    it('radio: selecting submits its value', async () => {
        const el = await mountEl('pdx-radio', { value: 'a' });
        expect(formValue(el)).toBeNull();

        const input = el.querySelector('input[type="radio"]') as HTMLInputElement;
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await tick();

        expect(formValue(el)).toBe('a');
    });

    it('number-input: typed value is submitted, not the initial prop', async () => {
        const el = await mountEl('pdx-number-input', { value: '0', max: '1000' });
        const input = el.querySelector('input') as HTMLInputElement;
        input.value = '42';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();

        expect(formValue(el)).toBe('42');
    });

    it('slider: keyboard interaction updates the submitted value', async () => {
        const el = await mountEl('pdx-slider', { value: '10', min: '0', max: '100', step: '1' });
        expect(formValue(el)).toBe('10');

        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        await tick();

        expect(formValue(el)).toBe('11');
    });

    it('color-picker (inline): editing the hex submits the picked color', async () => {
        const el = await mountEl('pdx-color-picker', { value: '#ff0000', inline: '' });
        await tick(50);
        expect(formValue(el)).toBe('#ff0000');

        const hex = el.querySelector('.pdx-color-hex-input') as HTMLInputElement;
        expect(hex).toBeTruthy();
        hex.value = '#00ff00';
        hex.dispatchEvent(new Event('change', { bubbles: true }));
        await tick();

        expect(formValue(el)).toBe('#00ff00');
    });

    it('mention: form-associated value is wired to the persistence markup', async () => {
        const el = await mountEl('pdx-mention', { value: 'hello', name: 'bio' });
        await tick(50);
        // Old code never called useFormAssociated → value was undefined (never set).
        expect(formValue(el)).toBe('hello');
    });
});

describe('number-input typed value is observable', () => {
    beforeEach(cleanup);

    it('emits pdx-input while typing (not only from stepper/arrows)', async () => {
        const el = await mountEl('pdx-number-input', { value: '0', max: '1000' });
        let received: number | undefined;
        el.addEventListener('pdx-input', ((e: CustomEvent) => { received = e.detail?.value; }) as EventListener);

        const input = el.querySelector('input') as HTMLInputElement;
        input.value = '123';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();

        expect(received).toBe(123);
    });
});

