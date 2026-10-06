// pdx-color-picker from the keyboard: the colour area, hue and opacity are tab stops the arrows move,
// the area is a valid slider, the popup is a named dialog that takes focus.
//
// A div role="slider" with only @pointerdown is not enough: each of the three is a tab stop the
// arrows move, so the hex field is not the one keyboard path and opacity has one. The area carries
// aria-valuenow/min/max, not only aria-valuetext (axe aria-required-attr). The panel has a role and
// a name, and opening it moves focus off the swatch.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/color-picker/pdx-color-picker';

type Picker = HTMLElement & { value: string };
type Detail = { value: string; hex: string; rgb: { a: number } };

async function mountPicker(attrs: string): Promise<{ el: Picker; inputs: Detail[]; changes: Detail[] }> {
    document.body.innerHTML = `<pdx-color-picker ${attrs}></pdx-color-picker>`;
    await tick(30);
    const el = document.querySelector('pdx-color-picker') as Picker;
    const inputs: Detail[] = [];
    const changes: Detail[] = [];
    el.addEventListener('pdx-input', (e) => inputs.push((e as CustomEvent).detail));
    el.addEventListener('pdx-change', (e) => changes.push((e as CustomEvent).detail));
    return { el, inputs, changes };
}
const press = (el: Element, key: string, shiftKey = false): KeyboardEvent => {
    const e = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    el.dispatchEvent(new KeyboardEvent('keyup', { key, shiftKey, bubbles: true }));
    return e;
};

beforeEach(cleanup);

describe('the sliders are tab stops the arrow keys move', () => {
    it('hue: tabindex 0; ArrowRight +1 emits pdx-input, keyup commits; Shift ×10; Home/End', async () => {
        const { el, inputs, changes } = await mountPicker('inline value="#ff0000"');
        const hue = el.querySelector('.pdx-color-hue-slider') as HTMLElement;
        expect(hue.getAttribute('tabindex')).toBe('0');
        expect(hue.getAttribute('aria-valuenow')).toBe('0');

        const e = press(hue, 'ArrowRight');
        await tick();
        expect(e.defaultPrevented).toBe(true);
        expect(hue.getAttribute('aria-valuenow')).toBe('1');
        expect(inputs).toHaveLength(1);
        expect(changes).toHaveLength(1);

        press(hue, 'ArrowRight', true);
        await tick();
        expect(hue.getAttribute('aria-valuenow')).toBe('11');
        press(hue, 'End');
        await tick();
        expect(hue.getAttribute('aria-valuenow')).toBe('360');
        press(hue, 'Home');
        await tick();
        expect(hue.getAttribute('aria-valuenow')).toBe('0');
    });

    it('the colour area is a slider with a value: ArrowUp raises brightness and changes the colour', async () => {
        const { el, changes } = await mountPicker('inline value="#804040"');
        const area = el.querySelector('.pdx-color-spectrum') as HTMLElement;
        expect(area.getAttribute('tabindex')).toBe('0');
        expect(area.getAttribute('aria-valuemin')).toBe('0');
        expect(area.getAttribute('aria-valuemax')).toBe('100');
        expect(area.getAttribute('aria-valuenow')).toBe('50');     // saturation of #804040
        expect(area.getAttribute('aria-valuetext')).toMatch(/^Saturation 50%, brightness 50%/);

        press(area, 'ArrowUp');
        await tick();
        expect(changes).toHaveLength(1);
        expect(changes[0].hex).not.toBe('#804040');
        expect(area.getAttribute('aria-valuetext')).toMatch(/brightness 51%/);

        press(area, 'ArrowRight');
        await tick();
        expect(area.getAttribute('aria-valuenow')).toBe('51');
    });

    it('opacity: a tab stop, ArrowLeft lowers it by 1%', async () => {
        const { el, changes } = await mountPicker('inline show-alpha value="#3b82f6"');
        const alpha = el.querySelector('.pdx-color-alpha-slider') as HTMLElement;
        expect(alpha.getAttribute('tabindex')).toBe('0');
        press(alpha, 'ArrowLeft');
        await tick();
        expect(alpha.getAttribute('aria-valuenow')).toBe('0.99');
        expect(alpha.getAttribute('aria-valuetext')).toBe('99%');
        expect(changes[0].rgb.a).toBe(0.99);
    });

    it('disabled: no slider is a tab stop, and the arrows do nothing', async () => {
        const { el, changes } = await mountPicker('inline disabled value="#ff0000"');
        const hue = el.querySelector('.pdx-color-hue-slider') as HTMLElement;
        expect(hue.getAttribute('tabindex')).toBe('-1');
        press(hue, 'ArrowRight');
        await tick();
        expect(changes).toHaveLength(0);
    });
});

describe('the host follows the user', () => {
    it('after typing a hex and committing it, el.value is the typed value', async () => {
        const { el } = await mountPicker('inline value="#3b82f6"');
        const input = el.querySelector('.pdx-color-hex-input') as HTMLInputElement;
        input.value = '#ff0000';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await tick();
        expect(el.value).toBe('#ff0000');
    });
});

describe('the popup is a named dialog that takes focus', () => {
    it('the swatch says it opens a dialog; opening moves focus to the colour area; Escape brings it back', async () => {
        const { el } = await mountPicker('value="#3b82f6"');
        const swatch = el.querySelector('.pdx-color-swatch') as HTMLButtonElement;
        const panel = el.querySelector('.pdx-color-panel') as HTMLElement;
        expect(swatch.getAttribute('aria-haspopup')).toBe('dialog');
        expect(panel.getAttribute('role')).toBe('dialog');
        expect(panel.getAttribute('aria-label')).toBeTruthy();

        swatch.focus();
        swatch.click();
        await tick(30);
        expect(document.activeElement, 'focus stayed on the swatch').toBe(el.querySelector('.pdx-color-spectrum'));

        document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await tick();
        expect(swatch.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(swatch);
    });

    it('inline, the panel is not a dialog', async () => {
        const { el } = await mountPicker('inline value="#3b82f6"');
        expect(el.querySelector('.pdx-color-panel')!.hasAttribute('role')).toBe(false);
    });
});
