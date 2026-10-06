// `<pdx-number-input>`: a negative value is negative to a screen reader, the sign colours the
// number, and the spinbutton keys PageUp/PageDown/Home/End.
//
// aria-valuenow is the signed number, not the formatted, unsigned display string ("75.50" for
// −75.5), and an untouched field carries it too; the sign button is a "Negative" toggle, not named
// by its glyph "−"; colorBySign colours the number; and PageUp/PageDown/Home/End move it.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';

import '../../src/number-input/pdx-number-input';

type NumberInput = HTMLElement & { value: number | null; allowNegative?: boolean };

async function mountHtml(html: string): Promise<NumberInput> {
    document.body.innerHTML = html;
    await tick(50);
    return document.body.firstElementChild as NumberInput;
}
const input = (el: Element) => el.querySelector('input') as HTMLInputElement;
const sign = (el: Element) => el.querySelector('.pdx-number-sign') as HTMLButtonElement | null;
function key(el: Element, k: string): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    input(el).dispatchEvent(e);
    return e;
}

describe('pdx-number-input value to assistive technology', () => {
    beforeEach(cleanup);

    it('a negative value: valuenow is the signed number, valuetext the formatted one', async () => {
        const el = await mountHtml('<pdx-number-input value="-75.5" allow-negative precision="2" aria-label="Balance"></pdx-number-input>');
        expect(el.value).toBe(-75.5);
        expect(input(el).getAttribute('aria-valuenow')).toBe('-75.5');
        expect(input(el).getAttribute('aria-valuetext')).toMatch(/^[-−]75\.50$/);
    });

    it('an untouched field has valuenow from the first render', async () => {
        const el = await mountHtml('<pdx-number-input value="1234.5" precision="2" aria-label="Amount"></pdx-number-input>');
        expect(input(el).getAttribute('aria-valuenow')).toBe('1234.5');
        expect(input(el).getAttribute('aria-valuetext')).toBe('1,234.50');
    });

    it('an empty field has neither', async () => {
        const el = await mountHtml('<pdx-number-input aria-label="Amount"></pdx-number-input>');
        expect(input(el).hasAttribute('aria-valuenow')).toBe(false);
        expect(input(el).hasAttribute('aria-valuetext')).toBe(false);
    });

    it('the sign button is a "Negative" toggle, pressed while the value is negative', async () => {
        const el = await mountHtml('<pdx-number-input value="-75.5" allow-negative precision="1" aria-label="Balance"></pdx-number-input>');
        const btn = sign(el)!;
        expect(btn.getAttribute('aria-label')).toBe('Negative');
        expect(btn.getAttribute('aria-pressed')).toBe('true');
        btn.click();
        await tick(10);
        expect(el.value).toBe(75.5);
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        expect(input(el).getAttribute('aria-valuenow')).toBe('75.5');
    });

    it('allow-negative set as a property keeps the sign too', async () => {
        document.body.innerHTML = '';
        const el = document.createElement('pdx-number-input') as NumberInput;
        el.allowNegative = true;
        el.setAttribute('value', '-3');
        document.body.appendChild(el);
        await tick(50);
        // Not clamped to 0, and the sign button is there: allow-negative read from the attribute
        // spelling only would lose the sign for kebab-case and for a property both.
        expect(input(el).getAttribute('aria-valuenow')).toBe('-3');
        expect(sign(el)).not.toBeNull();
    });
});

describe('pdx-number-input colorBySign', () => {
    beforeEach(cleanup);

    it('the wrapper class follows the sign as it changes', async () => {
        const el = await mountHtml('<pdx-number-input value="-5" allow-negative color-by-sign aria-label="Delta"></pdx-number-input>');
        const wrap = el.querySelector('.pdx-input-wrap')!;
        expect(wrap.classList.contains('pdx-number-negative')).toBe(true);
        sign(el)!.click();
        await tick(10);
        expect(wrap.classList.contains('pdx-number-negative')).toBe(false);
        expect(wrap.classList.contains('pdx-number-positive')).toBe(true);
    });
});

describe('pdx-number-input spinbutton keys', () => {
    beforeEach(cleanup);

    it('PageUp/PageDown step by ten steps; End and Home go to max and min', async () => {
        const el = await mountHtml('<pdx-number-input value="42" min="0" max="100" controls="right" aria-label="Qty"></pdx-number-input>');
        expect(key(el, 'PageUp').defaultPrevented).toBe(true);
        expect(el.value).toBe(52);
        key(el, 'PageDown');
        key(el, 'PageDown');
        expect(el.value).toBe(32);
        expect(key(el, 'End').defaultPrevented).toBe(true);
        expect(el.value).toBe(100);
        expect(input(el).getAttribute('aria-valuenow')).toBe('100');
        key(el, 'Home');
        expect(el.value).toBe(0);
    });

    it('with no max, End keeps its text-editing meaning', async () => {
        const el = await mountHtml('<pdx-number-input value="42" controls="right" aria-label="Qty"></pdx-number-input>');
        expect(key(el, 'End').defaultPrevented).toBe(false);
        expect(el.value).toBe(42);
    });
});
