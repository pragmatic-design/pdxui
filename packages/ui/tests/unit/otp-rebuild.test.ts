// pdx-otp-input rebuilds its cells when a prop or the value changes after the first build (#659).
//
// The build finds its container and writes the container's state classes. Written over the class it
// found it by, the next build found no container and did nothing: a length set after mount, or a
// value from outside, never reached the cells.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/otp-input/pdx-otp-input';

type Otp = HTMLElement & { value: string };

/** Mounted, with its first build done: `length` cells drawn. */
async function mountOtp(length: number): Promise<Otp> {
    const el = document.createElement('pdx-otp-input') as Otp;
    el.setAttribute('length', String(length));
    document.body.appendChild(el);
    for (let i = 0; i < 8 && el.querySelectorAll('.pdx-otp-cell').length < length; i++) await tick(50);
    return el;
}

const cells = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLInputElement>('.pdx-otp-cell'));

describe('pdx-otp-input after its first build', () => {
    beforeEach(cleanup);

    it('a length set after mount draws that many cells', async () => {
        const el = await mountOtp(4);
        expect(cells(el)).toHaveLength(4);
        el.setAttribute('length', '6');
        await tick(50); await tick(50);
        expect(cells(el)).toHaveLength(6);
    });

    it('a value set from outside shows in the cells', async () => {
        const el = await mountOtp(4);
        el.value = '1234';
        await tick(50); await tick(50);
        expect(cells(el).map((c) => c.value)).toEqual(['1', '2', '3', '4']);
    });

    // The error is a state of the host now (#286), not a class on the wrapper: the rebuild it causes
    // marks each cell aria-invalid, and the wrapper keeps the size rules' root.
    it('an error set after mount rebuilds the cells aria-invalid, and keeps the size rules\' root', async () => {
        const el = await mountOtp(4);
        el.setAttribute('error', '');
        await tick(50); await tick(50);
        const root = el.querySelector(':scope > [data-part="root"]');
        expect(cells(el).map((c) => c.getAttribute('aria-invalid'))).toEqual(['true', 'true', 'true', 'true']);
        expect(root?.classList.contains('pdx-otp-wrap')).toBe(true);
    });
});
