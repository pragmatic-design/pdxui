// `precision` decides both the rounding and how many decimals are drawn, so a value with fewer
// decimals than `precision` is padded: pdx-inline-edit would open its number editor on "29.500" for
// 29.5. A `trim-zeros` prop shows only the decimals the value has — the rounding, and the value
// emitted, are unchanged.
import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/number-input/pdx-number-input';
import '../../src/inline-edit/pdx-inline-edit';

type NumberInput = HTMLElement & { value: number | null };

/** Wait until `pick()` finds something, frame by frame. */
async function until<T>(pick: () => T | null | undefined, what: string): Promise<T> {
    for (let i = 0; i < 30; i++) {
        const found = pick();
        if (found) return found;
        await new Promise(r => requestAnimationFrame(r));
    }
    throw new Error(`never appeared: ${what}`);
}

async function mountNumber(attrs: Record<string, string>): Promise<{ el: NumberInput; input: HTMLInputElement }> {
    const el = document.createElement('pdx-number-input') as NumberInput;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    const input = await until(() => el.querySelector('input'), 'the inner input');
    await until(() => (input.onkeydown ? input : null), 'the input handlers');
    return { el, input };
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('pdx-number-input trim-zeros', () => {
    it('shows only the decimals the value has', async () => {
        const { input } = await mountNumber({ precision: '3', 'trim-zeros': '', value: '29.5', locale: 'en-US' });
        expect(input.value).toBe('29.5');
    });

    it('still rounds to `precision`, and commits the rounded value', async () => {
        const { el, input } = await mountNumber({ precision: '3', 'trim-zeros': '', value: '29.1234', locale: 'en-US' });
        expect(input.value).toBe('29.123');
        input.value = '29.1234';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new FocusEvent('blur'));
        expect(el.value, 'trim-zeros must not change what is committed').toBe(29.123);
    });

    it('an integer shows no decimal point', async () => {
        const { input } = await mountNumber({ precision: '2', 'trim-zeros': '', value: '30', locale: 'en-US' });
        expect(input.value).toBe('30');
    });

    it('without the prop nothing changes: the zeros are padded as before', async () => {
        const { input } = await mountNumber({ precision: '3', value: '29.5', locale: 'en-US' });
        expect(input.value).toBe('29.500');
    });

    it('a half-typed "29." is not reformatted under the cursor', async () => {
        // Typing must not go through the display formatter: it would eat the decimal point the
        // moment it is typed, and the next digit would land in the wrong place.
        const { input } = await mountNumber({ precision: '3', 'trim-zeros': '', value: '29', locale: 'en-US' });
        input.value = '29.';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        expect(input.value).toBe('29.');
    });
});

describe('pdx-inline-edit opens its number editor on the value, not on padded zeros', () => {
    it('29.5 opens as "29.5"', async () => {
        const el = document.createElement('pdx-inline-edit') as HTMLElement & { value: unknown };
        el.setAttribute('type', 'number');
        el.setAttribute('value', '29.5');
        el.setAttribute('locale', 'en-US');
        document.body.appendChild(el);
        const display = await until(() => el.querySelector<HTMLElement>('.pdx-inline-edit-display'), 'the display');
        display.click();
        // The editor's input exists a frame before it is filled: wait for the text, not the node.
        const input = await until(() => {
            const i = el.querySelector<HTMLInputElement>('pdx-number-input input');
            return i && i.value ? i : null;
        }, 'the editor with its value');
        expect(input.value).toBe('29.5');
    });
});
