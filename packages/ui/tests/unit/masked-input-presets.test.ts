// `<pdx-masked-input>` presets.
//
// phone-intl must not assume a two-digit country code — 15551234567 is not "+15 (551) 234-567";
// the time preset opens a numeric keyboard; and the date preset does not take "13/45/2024" as a
// complete, valid value.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';

import '../../src/masked-input/pdx-masked-input';

type Masked = HTMLElement & { value: string };

async function mountMask(mask: string): Promise<{ el: Masked; input: HTMLInputElement; changes: Record<string, unknown>[] }> {
    document.body.innerHTML = `<pdx-masked-input mask="${mask}" aria-label="Field"></pdx-masked-input>`;
    await tick(20);
    const el = document.body.firstElementChild as Masked;
    const input = el.querySelector('input') as HTMLInputElement;
    const changes: Record<string, unknown>[] = [];
    el.addEventListener('pdx-change', (e) => changes.push((e as CustomEvent).detail));
    return { el, input, changes };
}

/** Type `text` and commit it, as a user does: input, then change on blur. */
async function type(input: HTMLInputElement, text: string): Promise<void> {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await tick(20);
}

describe('pdx-masked-input phone-intl', () => {
    beforeEach(cleanup);

    it.each([
        ['15551234567', '+1 (555) 123-4567'],
        ['442071234567', '+44 (207) 123-4567'],
        ['390612345678', '+39 (061) 234-5678'],
        ['3531234567890', '+353 (123) 456-7890'],
        ['74951234567', '+7 (495) 123-4567'],
    ])('%s is formatted as %s: the country code is as long as its prefix says', async (digits, formatted) => {
        const { el, input, changes } = await mountMask('phone-intl');
        await type(input, digits);
        expect(input.value).toBe(formatted);
        expect(changes.at(-1)).toMatchObject({ value: digits, formatted });
        expect(el.value).toBe(digits);
    });

    it('a partial number shows only what was typed', async () => {
        const { input } = await mountMask('phone-intl');
        await type(input, '1555');
        expect(input.value).toBe('+1 (555');
        await type(input, '3');
        expect(input.value).toBe('+3');
    });
});

describe('pdx-masked-input keyboards', () => {
    beforeEach(cleanup);

    it.each(['time', 'date', 'phone', 'phone-intl', 'card', 'ssn', 'zip'])('%s opens a numeric keyboard', async (mask) => {
        const { input } = await mountMask(mask);
        expect(input.getAttribute('inputmode')).toBe('numeric');
    });

    it('a mask with letter slots keeps a text keyboard', async () => {
        const { input } = await mountMask('AA-###-AA');
        expect(input.getAttribute('inputmode')).toBe('text');
    });
});

describe('pdx-masked-input date and time ranges', () => {
    beforeEach(cleanup);

    it.each([
        ['date', '13452024', '13/45/2024'],
        ['date', '02302024', '02/30/2024'],
        ['date', '02292023', '02/29/2023'],
        ['time', '2460', '24:60'],
        ['time', '1275', '12:75'],
    ])('%s %s is out of range: aria-invalid and valid: false, the digits untouched', async (mask, digits, formatted) => {
        const { input, changes } = await mountMask(mask);
        await type(input, digits);
        expect(input.value).toBe(formatted);
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(changes.at(-1)).toMatchObject({ value: digits, formatted, valid: false });
    });

    it.each([
        ['date', '12252024', '12/25/2024'],
        ['date', '02292024', '02/29/2024'],
        ['time', '2359', '23:59'],
        ['time', '0000', '00:00'],
    ])('%s %s is valid', async (mask, digits, formatted) => {
        const { input, changes } = await mountMask(mask);
        await type(input, digits);
        expect(input.value).toBe(formatted);
        expect(input.hasAttribute('aria-invalid')).toBe(false);
        expect(changes.at(-1)).toMatchObject({ value: digits, formatted, valid: true });
    });

    it('an incomplete date is not judged', async () => {
        const { input, changes } = await mountMask('date');
        await type(input, '13');
        expect(input.hasAttribute('aria-invalid')).toBe(false);
        expect(changes.at(-1)).toMatchObject({ valid: true });
    });
});

// A pending rAF must not put an old value back.
//
// `onInput` schedules `requestAnimationFrame(() => input.value = masked)` with the value captured
// at that moment. Written unconditionally, it undoes anything that changes the field before the
// frame lands — a clear, a fast second keystroke, a programmatic write.
//
// In the site's `masked-input-presets.spec.ts` that shows as a `fill('')` after typing an impossible
// date leaving the field reading "13/45/2024" through five seconds of Playwright retries: the
// component, not the test racing itself.
describe('pdx-masked-input — a pending frame does not undo a later write', () => {
    beforeEach(cleanup);

    it('stays empty when cleared right after typing', async () => {
        const { input } = await mountMask('##/##/####');

        // Type, and do NOT let the frame run: this is the state a fast clear arrives in.
        input.value = '13452024';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        // Clear, as `fill('')` and the exposed clear() both do.
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        await tick(40);   // both frames have run by now
        expect(input.value, 'a pending frame restored the value that was typed before the clear').toBe('');
    });

    it('keeps the last keystroke when two arrive in one frame', async () => {
        const { input } = await mountMask('##/##/####');

        input.value = '12';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.value = '1225';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        await tick(40);
        expect(input.value, 'the first frame overwrote the second keystroke').toBe('12/25');
    });

    it('the exposed clear() survives a pending frame', async () => {
        const { el, input } = await mountMask('##/##/####');

        input.value = '13452024';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        (el as unknown as { clear(): void }).clear();

        await tick(40);
        expect(input.value, 'clear() was undone by the frame the keystroke scheduled').toBe('');
        expect(el.value, 'the host kept the cleared value').toBe('');
    });
});
