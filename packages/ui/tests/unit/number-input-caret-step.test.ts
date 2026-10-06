// pdx-number-input: the arrows can step the digit before the caret, on request.
//
// ↑/↓ add one `step`; a free mode where the increment follows the caret is `stepBy`. Tied to
// `controls="none"`, a VISUAL prop, it would be out of reach for fields with steppers, which step by
// `step`. `step-mode` asks for it explicitly: `auto` (the default), `fixed`, `caret`. And the caret
// stays on the digit it was on, counted from the number's end: put back at the same OFFSET, it would
// land on another digit once the number grows one (99 → 109) or gains a group separator
// (999 → 1,099).

import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/number-input/pdx-number-input';

type NumberInput = HTMLElement & { value: number | null };

async function until<T>(pick: () => T | null | undefined, what: string): Promise<T> {
    for (let i = 0; i < 30; i++) {
        const found = pick();
        if (found) return found;
        await new Promise(r => requestAnimationFrame(r));
    }
    throw new Error(`never appeared: ${what}`);
}

async function mount(attrs: Record<string, string>): Promise<{ el: NumberInput; input: HTMLInputElement }> {
    const el = document.createElement('pdx-number-input') as NumberInput;
    el.setAttribute('locale', 'en-US');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    const input = await until(() => el.querySelector('input'), 'the inner input');
    await until(() => (input.onkeydown ? input : null), 'the input handlers');
    await until(() => (input.value !== '' ? input : null), 'the displayed value');
    return { el, input };
}

/** Put the caret at `pos` and press `key`. */
function press(input: HTMLInputElement, pos: number, key: 'ArrowUp' | 'ArrowDown', shiftKey = false): void {
    input.focus();
    input.setSelectionRange(pos, pos);
    input.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('step-mode="caret" — the digit before the caret, with the steppers shown', () => {
    it('caret after the tens of 123: ↑ gives 133', async () => {
        const { el, input } = await mount({ value: '123', 'step-mode': 'caret' });
        press(input, 2, 'ArrowUp');                 // 12|3
        expect(el.value).toBe(133);
    });

    it('caret after the first decimal of 1.25: ↑ gives 1.35', async () => {
        const { el, input } = await mount({ value: '1.25', step: '0.01', 'step-mode': 'caret' });
        press(input, 3, 'ArrowUp');                 // 1.2|5
        expect(el.value).toBe(1.35);
    });

    it('a caret right against the decimal point steps the first decimal, as the field always did', async () => {
        const { el, input } = await mount({ value: '1.25', step: '0.01', 'step-mode': 'caret' });
        press(input, 2, 'ArrowUp');                 // 1.|25
        expect(el.value).toBe(1.35);
    });

    it('Shift steps ten of that digit', async () => {
        const { el, input } = await mount({ value: '123', 'step-mode': 'caret' });
        press(input, 2, 'ArrowUp', true);           // 12|3, ×10 of the tens
        expect(el.value).toBe(223);
    });

    it('max clamps, as for the step', async () => {
        const { el, input } = await mount({ value: '95', max: '100', 'step-mode': 'caret' });
        press(input, 1, 'ArrowUp');                 // 9|5 → 105, clamped
        expect(el.value).toBe(100);
    });
});

describe('the caret stays on its digit when the number changes length', () => {
    it('99 with the caret after the tens: ↑ gives 109, the caret after its tens', async () => {
        const { el, input } = await mount({ value: '99', 'step-mode': 'caret' });
        press(input, 1, 'ArrowUp');                 // 9|9
        expect(el.value).toBe(109);
        expect(input.value).toBe('109');
        expect(input.selectionStart, 'the caret moved to another digit').toBe(2);   // 10|9
        // And the next ↑ steps the same digit again.
        press(input, input.selectionStart!, 'ArrowUp');
        expect(el.value).toBe(119);
    });

    it('999 with the caret after the hundreds: ↑ gives 1,099, the caret after its hundreds', async () => {
        const { el, input } = await mount({ value: '999', 'step-mode': 'caret' });
        press(input, 1, 'ArrowUp');                 // 9|99
        expect(el.value).toBe(1099);
        expect(input.value).toBe('1,099');
        expect(input.selectionStart, 'the group separator moved the caret').toBe(3); // 1,0|99
    });
});

describe('the mode is said, and the wheel follows it', () => {
    it('in caret mode the field describes what the arrows do; in fixed mode it says nothing', async () => {
        const { input: caret } = await mount({ value: '1', 'step-mode': 'caret' });
        expect(caret.getAttribute('aria-description')).toBe('The arrow keys change the digit before the cursor');
        document.body.innerHTML = '';
        const { input: fixed } = await mount({ value: '1' });
        expect(fixed.hasAttribute('aria-description')).toBe(false);
    });

    it('with steppers and no step-mode, the wheel steps by `step` like the arrows, not by the caret', async () => {
        const { el, input } = await mount({ value: '123', 'allow-wheel': '' });
        input.focus();
        input.setSelectionRange(1, 1);              // 1|23: the hundreds, were the caret read
        input.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true }));
        expect(el.value).toBe(124);
    });

    it('with step-mode="caret", the wheel steps the digit before the caret', async () => {
        const { el, input } = await mount({ value: '123', 'allow-wheel': '', 'step-mode': 'caret' });
        input.focus();
        input.setSelectionRange(2, 2);              // 12|3
        input.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true }));
        expect(el.value).toBe(133);
    });
});

describe('the default is unchanged', () => {
    it('control — with the steppers and no step-mode, ↑ adds `step` wherever the caret is', async () => {
        const { el, input } = await mount({ value: '123' });
        press(input, 1, 'ArrowUp');                 // 1|23: the caret says nothing
        expect(el.value).toBe(124);
    });

    it('control — step-mode="fixed" steps by `step` even without steppers', async () => {
        const { el, input } = await mount({ value: '123', controls: 'none', 'step-mode': 'fixed' });
        press(input, 1, 'ArrowUp');
        expect(el.value).toBe(124);
    });

    it('control — controls="none" alone still steps the digit, as it did (auto)', async () => {
        const { el, input } = await mount({ value: '123', controls: 'none' });
        press(input, 2, 'ArrowUp');                 // 12|3
        expect(el.value).toBe(133);
    });
});
