// pdx-checkbox: the host follows the user, and aria-checked says "mixed" only while it is.
//
// aria-checked is bound to the `indeterminate` prop, so a click writes `checked` and `indeterminate`:
// otherwise a clicked indeterminate box is checked and still announces "mixed", and `el.checked`
// keeps its initial value.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/checkbox/pdx-checkbox';

type Box = HTMLElement & { checked: boolean; indeterminate: boolean };

async function mountBox(attrs = ''): Promise<{ el: Box; input: HTMLInputElement }> {
    document.body.innerHTML = `<pdx-checkbox label="Select all" ${attrs}></pdx-checkbox>`;
    await tick();
    const el = document.querySelector('pdx-checkbox') as Box;
    return { el, input: el.querySelector('input[type="checkbox"]') as HTMLInputElement };
}

beforeEach(cleanup);

describe('pdx-checkbox follows the user', () => {
    it('an indeterminate box, clicked, is checked and no longer mixed — on the input, the host and aria-checked', async () => {
        const { el, input } = await mountBox('indeterminate');
        expect(input.indeterminate, 'the fixture: the input starts indeterminate').toBe(true);
        expect(input.getAttribute('aria-checked')).toBe('mixed');

        input.click();
        await tick();
        expect(input.checked).toBe(true);
        expect(input.indeterminate).toBe(false);
        expect(input.getAttribute('aria-checked'), 'a checked box announced "mixed"').not.toBe('mixed');
        expect(el.checked).toBe(true);
        expect(el.indeterminate).toBe(false);
    });

    it('a plain box clicked twice reads el.checked false → true → false', async () => {
        const { el, input } = await mountBox();
        const seen = [el.checked];
        input.click();
        await tick();
        seen.push(el.checked);
        input.click();
        await tick();
        seen.push(el.checked);
        expect(seen).toEqual([false, true, false]);
    });

    it('a parent setting checked = false after a user click unchecks it', async () => {
        const { el, input } = await mountBox();
        input.click();
        await tick();
        expect(el.checked).toBe(true);
        el.checked = false;
        await tick();
        expect(input.checked).toBe(false);
    });

    it('a parent setting indeterminate after a click makes it mixed again', async () => {
        const { el, input } = await mountBox('indeterminate');
        input.click();
        await tick();
        el.indeterminate = true;
        await tick();
        expect(input.indeterminate).toBe(true);
        expect(input.getAttribute('aria-checked')).toBe('mixed');
    });
});
