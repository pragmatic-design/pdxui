// pdx-relative-time's wording length is `format-style` (#545). It was a prop named `style`, which the
// element defines over HTMLElement's own `style`: `el.style` was a string, and code outside the
// component that set `el.style.color` broke.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/relative-time/pdx-relative-time';

beforeEach(cleanup);

async function render(markup: string): Promise<HTMLElement> {
    document.body.innerHTML = markup;
    await tick(30);
    await tick(30);
    return document.body.firstElementChild as HTMLElement;
}

const threeHoursAgo = () => new Date(Date.now() - 3 * 3_600_000).toISOString();

describe('pdx-relative-time format-style', () => {
    it('sets the wording length, long by default', async () => {
        const long = await render(`<pdx-relative-time locale="en" datetime="${threeHoursAgo()}"></pdx-relative-time>`);
        expect(long.textContent?.trim()).toBe('3 hours ago');
        const short = await render(`<pdx-relative-time locale="en" format-style="short" datetime="${threeHoursAgo()}"></pdx-relative-time>`);
        expect(short.textContent?.trim()).toBe('3 hr. ago');
    });

    it("leaves the element's style a CSSStyleDeclaration", async () => {
        const el = await render(`<pdx-relative-time locale="en" datetime="${threeHoursAgo()}"></pdx-relative-time>`);
        el.style.color = 'red';
        expect(el.getAttribute('style')).toContain('color: red');
    });
});
