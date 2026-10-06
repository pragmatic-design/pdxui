// Category 4 — Cross-prop visual contracts: geometry for prop COMBINATIONS, not just defaults.
import { test } from '@playwright/test';
import { mount, SUBJECT, expect } from './helpers';

async function radii(page: any, sel: string) {
    return page.$eval(sel, (el: Element) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
            tl: parseFloat(cs.borderTopLeftRadius), tr: parseFloat(cs.borderTopRightRadius),
            br: parseFloat(cs.borderBottomRightRadius), bl: parseFloat(cs.borderBottomLeftRadius),
            w: r.width, h: r.height, right: r.right, top: r.top, bottom: r.bottom,
        };
    });
}

test.describe('cross-prop visual', () => {
    // controls="right" stacks ▲▼ on the right; their outer corners must follow the group radius,
    // and the inner (shared) edge must be square — no corner-radius conflict with the input wrap.
    test('number-input controls="right": stacked steppers honour the group radius', async ({ page }) => {
        await mount(page, 'pdx-number-input', { theme: 'neutral', attrs: { controls: 'right' } });
        const group = await radii(page, `${SUBJECT} .pdx-input-group`);
        const up = await radii(page, `${SUBJECT} .pdx-number-btn-stack button:nth-child(1)`);
        const down = await radii(page, `${SUBJECT} .pdx-number-btn-stack button:nth-child(2)`);

        // The stack's right edge aligns with the group's right edge (the buttons are the right end).
        expect(Math.abs(up.right - group.right)).toBeLessThanOrEqual(2);
        // Top button: top-right rounded to the group radius; bottom-right square (shared with ▼).
        expect(up.tr).toBeGreaterThanOrEqual(Math.min(4, group.tr));
        expect(up.br).toBeLessThanOrEqual(1.5);
        // Bottom button: bottom-right rounded; top-right square (shared with ▲).
        expect(down.br).toBeGreaterThanOrEqual(Math.min(4, group.br));
        expect(down.tr).toBeLessThanOrEqual(1.5);
    });

    async function heightOf(page: any, tag: string, size: string, sel: string): Promise<number> {
        await mount(page, tag, { attrs: { size }, text: 'x' });
        return page.$eval(sel, (el: Element) => el.getBoundingClientRect().height);
    }

    // size is a visual contract: sm ≤ md ≤ lg, and lg must be strictly taller than sm
    // (catches a `size` prop that is declared but does nothing to the rendered geometry).
    test('button: size scales the control height (sm ≤ md ≤ lg, lg > sm)', async ({ page }) => {
        const sm = await heightOf(page, 'pdx-button', 'sm', `${SUBJECT} button`);
        const md = await heightOf(page, 'pdx-button', 'md', `${SUBJECT} button`);
        const lg = await heightOf(page, 'pdx-button', 'lg', `${SUBJECT} button`);
        expect(sm).toBeLessThanOrEqual(md + 0.5);
        expect(md).toBeLessThanOrEqual(lg + 0.5);
        expect(lg).toBeGreaterThan(sm);
    });

    test('input: size scales the control height (sm ≤ md ≤ lg, lg > sm)', async ({ page }) => {
        const sm = await heightOf(page, 'pdx-input', 'sm', `${SUBJECT} .pdx-input-wrap`);
        const md = await heightOf(page, 'pdx-input', 'md', `${SUBJECT} .pdx-input-wrap`);
        const lg = await heightOf(page, 'pdx-input', 'lg', `${SUBJECT} .pdx-input-wrap`);
        expect(sm).toBeLessThanOrEqual(md + 0.5);
        expect(md).toBeLessThanOrEqual(lg + 0.5);
        expect(lg).toBeGreaterThan(sm);
    });

    // error is a visual state: the wrapper border must change colour vs the default.
    test('input error: border colour differs from the default state', async ({ page }) => {
        await mount(page, 'pdx-input');
        const base = await page.$eval(`${SUBJECT} .pdx-input-wrap`, (el) => getComputedStyle(el).borderColor);
        await mount(page, 'pdx-input', { attrs: { error: '' } });
        const err = await page.$eval(`${SUBJECT} .pdx-input-wrap`, (el) => getComputedStyle(el).borderColor);
        expect(err).not.toBe(base);
    });
});
