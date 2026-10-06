// A value TYPED into pdx-number-input must produce pdx-change when the edit is committed (blur or
// Enter), as the native input's `change` does — not only pdx-input, or a handler on pdx-change
// («Fired when the value changes», says the catalogue) loses everything typed and hears only
// steppers, arrow keys and the wheel. And typing updates the host's `value`, which pdx-inline-edit
// type="number" reads on the native `input` event to save what was typed.

import { describe, it, expect, beforeEach } from 'vitest';
import { required } from '@pdxui/core';
import '../../src/number-input/pdx-number-input';
import '../../src/inline-edit/pdx-inline-edit';

type NumberInput = HTMLElement & { value: number | null };

async function frames(n = 2): Promise<void> {
    for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r));
}

/** Wait until `pick()` finds something, frame by frame. */
async function until<T>(pick: () => T | null | undefined, what: string): Promise<T> {
    for (let i = 0; i < 30; i++) {
        const found = pick();
        if (found) return found;
        await new Promise(r => requestAnimationFrame(r));
    }
    throw new Error(`never appeared: ${what}`);
}

async function mountNumber(attrs: Record<string, string> = {}): Promise<{ el: NumberInput; input: HTMLInputElement }> {
    const el = document.createElement('pdx-number-input') as NumberInput;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    const input = await until(() => el.querySelector('input'), 'the inner input');
    await until(() => (input.onkeydown ? input : null), 'the input handlers');
    return { el, input };
}

function type(input: HTMLInputElement, text: string): void {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function record(el: HTMLElement, name: string): unknown[] {
    const seen: unknown[] = [];
    el.addEventListener(name, (e) => seen.push((e as CustomEvent).detail?.value));
    return seen;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('pdx-number-input commits a typed value', () => {
    it('typing then blur emits exactly one pdx-change with the typed value, and reflects it', async () => {
        const { el, input } = await mountNumber({ step: '0.1' });
        const changes = record(el, 'pdx-change');
        type(input, '2.5');
        input.dispatchEvent(new FocusEvent('blur'));
        expect(changes).toEqual([2.5]);
        expect(el.value).toBe(2.5);
    });

    it('Enter after typing commits once', async () => {
        const { el, input } = await mountNumber({ step: '0.1' });
        const changes = record(el, 'pdx-change');
        type(input, '7.3');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        input.dispatchEvent(new FocusEvent('blur'));
        expect(changes).toEqual([7.3]);
    });

    it('focus and blur with no edit emit nothing', async () => {
        const { el, input } = await mountNumber();
        const changes = record(el, 'pdx-change');
        input.dispatchEvent(new FocusEvent('focus'));
        input.dispatchEvent(new FocusEvent('blur'));
        expect(changes).toEqual([]);
    });

    it('the control: ArrowUp emits pdx-change at once, as before', async () => {
        const { el, input } = await mountNumber();
        const changes = record(el, 'pdx-change');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
        expect(changes).toEqual([1]);
    });

    it('typing emits pdx-input on each keystroke, as before', async () => {
        const { el, input } = await mountNumber();
        const inputs = record(el, 'pdx-input');
        type(input, '4');
        type(input, '42');
        expect(inputs).toEqual([4, 42]);
    });
});

// pdx-number-input can be empty, as the native <input type="number"> can. `null`, `undefined`, ''
// and NaN show an empty field, not «0» (or `min`), a cleared field stays empty on blur, and the
// placeholder shows: a number nobody entered would look like data.
describe('pdx-number-input can be empty', () => {
    it('with no value the field is empty, the placeholder shows, and value is null', async () => {
        const { el, input } = await mountNumber({ placeholder: 'Dose' });
        expect(input.value, 'an empty field shows a number').toBe('');
        expect(input.placeholder).toBe('Dose');
        expect(el.value).toBeNull();
    });

    it('with min="1" and no value the field is still empty, not «1»', async () => {
        const { el, input } = await mountNumber({ min: '1' });
        expect(input.value).toBe('');
        expect(el.value).toBeNull();
    });

    it('value set to null, undefined, \'\' or NaN after mount empties the field', async () => {
        for (const empty of [null, undefined, '', NaN]) {
            const { el, input } = await mountNumber();
            el.value = 5;
            await frames();
            expect(input.value).toBe('5');
            (el as unknown as { value: unknown }).value = empty;
            await frames();
            expect(input.value, `value = ${String(empty)} did not empty the field`).toBe('');
            el.remove();
        }
    });

    it('clearing a field holding 5 and leaving it emits pdx-change {value: null} and keeps it empty', async () => {
        const { el, input } = await mountNumber();
        el.value = 5;
        await frames();
        const changes = record(el, 'pdx-change');
        type(input, '');
        input.dispatchEvent(new FocusEvent('blur'));
        expect(changes).toEqual([null]);
        expect(input.value, 'the cleared field snapped back to a number').toBe('');
        expect(el.value).toBeNull();
    });

    it('leaving an empty field empty emits nothing', async () => {
        const { el, input } = await mountNumber();
        const changes = record(el, 'pdx-change');
        input.dispatchEvent(new FocusEvent('focus'));
        input.dispatchEvent(new FocusEvent('blur'));
        expect(changes).toEqual([]);
    });

    it('ArrowUp on an empty field starts from min: min="1" gives 1', async () => {
        const { el, input } = await mountNumber({ min: '1' });
        const changes = record(el, 'pdx-change');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
        expect(changes).toEqual([1]);
        expect(input.value).toBe('1');
    });

    it('the stepper on an empty field with no min starts from 0: + gives 1', async () => {
        const { el } = await mountNumber();
        const changes = record(el, 'pdx-change');
        const plus = el.querySelector<HTMLButtonElement>('button[aria-label="Increase"]')!;
        plus.click();
        expect(changes).toEqual([1]);
    });

    it('the control: value 0 shows «0», and zero is not empty', async () => {
        const { el, input } = await mountNumber();
        el.value = 0;
        await frames();
        expect(input.value).toBe('0');
        expect(el.value).toBe(0);
    });

    it('a required validator sees an empty field as missing, and a zero as present', async () => {
        const { el, input } = await mountNumber();
        el.value = 5;
        await frames();
        type(input, '');
        input.dispatchEvent(new FocusEvent('blur'));
        expect(required()(el.value), 'an emptied field passed «required»').toBeTruthy();
        el.value = 0;
        await frames();
        expect(required()(el.value)).toBeUndefined();
    });
});

describe('pdx-inline-edit type="number" saves what was typed', () => {
    // An integer on purpose: this measures the event wiring only. The decimals are measured below.
    it('edit 29.5 → type 31 → Enter: pdx-change carries 31, not the starting value', async () => {
        const edit = document.createElement('pdx-inline-edit') as HTMLElement & { value: unknown };
        edit.setAttribute('type', 'number');
        document.body.appendChild(edit);
        edit.value = 29.5;
        const display = await until(() => edit.querySelector<HTMLElement>('.pdx-inline-edit-display'), 'the display');
        const saved = record(edit, 'pdx-change');
        display.click();
        const input = await until(() => edit.querySelector<HTMLInputElement>('pdx-number-input input'), 'the number editor');
        await frames(3); // the inline editor wires its own Enter handler two frames after building
        type(input, '31');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(saved.at(-1)).toBe(31);
    });
});

describe('pdx-inline-edit keeps the decimals typed into a number or currency', () => {
    // A number editor with no step and no precision means step 1 → 0 decimals, and roundTo() would
    // round every typed value to an integer.
    async function editTo(attrs: Record<string, string>, start: number, typed: string): Promise<unknown> {
        const edit = document.createElement('pdx-inline-edit') as HTMLElement & { value: unknown };
        for (const [k, v] of Object.entries(attrs)) edit.setAttribute(k, v);
        document.body.appendChild(edit);
        edit.value = start;
        const display = await until(() => edit.querySelector<HTMLElement>('.pdx-inline-edit-display'), 'the display');
        const saved = record(edit, 'pdx-change');
        display.click();
        const input = await until(() => edit.querySelector<HTMLInputElement>('pdx-number-input input'), 'the number editor');
        await frames(3);
        type(input, typed);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        return saved.at(-1);
    }

    it('type="number": 29.5 edited to «30.2» saves 30.2', async () => {
        expect(await editTo({ type: 'number' }, 29.5, '30.2')).toBe(30.2);
    });

    it('type="currency" EUR: 12.5 edited to «12.75» saves 12.75', async () => {
        expect(await editTo({ type: 'currency', currency: 'EUR', locale: 'en-US' }, 12.5, '12.75')).toBe(12.75);
    });

    it('type="currency" JPY: the currency has no minor unit, «1200.4» saves 1200', async () => {
        expect(await editTo({ type: 'currency', currency: 'JPY', locale: 'en-US' }, 1000, '1200.4')).toBe(1200);
    });

    it('control — precision="0" still rounds «30.2» to 30', async () => {
        expect(await editTo({ type: 'number', precision: '0' }, 29.5, '30.2')).toBe(30);
    });
});
