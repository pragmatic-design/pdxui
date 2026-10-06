// pdx-otp-input completion detection. Completion = every slot filled — not a guard like
// `val.indexOf('') === -1`, which is ALWAYS false (indexOf('') returns 0) and would never
// fire pdx-complete.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/otp-input/pdx-otp-input';

async function mountOtp(length: number): Promise<HTMLElement> {
    const el = document.createElement('pdx-otp-input');
    el.setAttribute('length', String(length));
    document.body.appendChild(el);
    for (let i = 0; i < 8 && el.querySelectorAll('.pdx-otp-cell').length < length; i++) await tick(50);
    return el;
}

describe('otp-input fires pdx-complete when all slots are filled', () => {
    beforeEach(cleanup);

    it('emits pdx-complete on the last digit', async () => {
        const el = await mountOtp(4);
        const cells = Array.from(el.querySelectorAll('.pdx-otp-cell')) as HTMLInputElement[];
        expect(cells.length).toBe(4);

        let completed: string | undefined;
        el.addEventListener('pdx-complete', ((e: CustomEvent) => { completed = e.detail?.value; }) as EventListener);

        const digits = ['1', '2', '3', '4'];
        for (let i = 0; i < cells.length; i++) {
            cells[i].value = digits[i];
            cells[i].dispatchEvent(new Event('input', { bubbles: true }));
            await tick();
        }

        expect(completed).toBe('1234');
    });

    it('does NOT fire pdx-complete while slots are still empty', async () => {
        const el = await mountOtp(4);
        const cells = Array.from(el.querySelectorAll('.pdx-otp-cell')) as HTMLInputElement[];
        expect(cells.length).toBe(4);

        let fired = false;
        el.addEventListener('pdx-complete', () => { fired = true; });

        cells[0].value = '1';
        cells[0].dispatchEvent(new Event('input', { bubbles: true }));
        await tick();

        expect(fired).toBe(false);
    });
});
