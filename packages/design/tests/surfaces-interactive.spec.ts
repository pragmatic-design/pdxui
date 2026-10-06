import { test, expect } from '@playwright/test';
import { getStyle, getColorRgba, setHtmlAttr, px } from './helpers';

const URL = '/demo/test-harness.html';

test.beforeEach(async ({ page }) => {
    await page.goto(URL);
});

// ==========================================================================
// Surface classes
// ==========================================================================

test.describe('surfaces', () => {
    test('surface-card has border, radius, and padding', async ({ page }) => {
        const borderWidth = await getStyle(page, 'surface-card', 'border-width');
        const borderRadius = await getStyle(page, 'surface-card', 'border-radius');
        const padding = await getStyle(page, 'surface-card', 'padding');

        expect(px(borderWidth)).toBeGreaterThan(0);
        expect(px(borderRadius)).toBeGreaterThan(0);
        expect(px(padding)).toBeGreaterThan(0);
    });

    test('surface-card has shadow or non-zero border (visual differentiation)', async ({ page }) => {
        const boxShadow = await getStyle(page, 'surface-card', 'box-shadow');
        const borderWidth = await getStyle(page, 'surface-card', 'border-width');
        // Must have at least shadow OR border to differentiate from bg
        const hasShadow = boxShadow !== 'none' && boxShadow !== '';
        const hasBorder = px(borderWidth) > 0;
        expect(hasShadow || hasBorder).toBe(true);
    });

    test('surface-inset has background different from surface-card', async ({ page }) => {
        await setHtmlAttr(page, 'pdx-scheme', 'light');
        const cardBg = await getColorRgba(page, 'surface-card', 'background-color');
        const insetBg = await getColorRgba(page, 'surface-inset', 'background-color');

        const diff = Math.abs(cardBg[0] - insetBg[0])
            + Math.abs(cardBg[1] - insetBg[1])
            + Math.abs(cardBg[2] - insetBg[2]);
        expect(diff).toBeGreaterThan(3);
    });

    test('surface-overlay has shadow or strong border', async ({ page }) => {
        const shadow = await getStyle(page, 'surface-overlay', 'box-shadow');
        const borderWidth = await getStyle(page, 'surface-overlay', 'border-width');
        const hasShadow = shadow !== 'none' && shadow !== '';
        const hasBorder = px(borderWidth) > 0;
        expect(hasShadow || hasBorder).toBe(true);
    });

    test('surface-glass has backdrop-filter', async ({ page }) => {
        const filter = await getStyle(page, 'surface-glass', 'backdrop-filter');
        expect(filter).toContain('blur');
    });

    test('all surfaces have background color in dark mode', async ({ page }) => {
        await setHtmlAttr(page, 'pdx-scheme', 'dark');
        const surfaces = ['surface-base', 'surface-card', 'surface-inset', 'surface-overlay'];

        for (const s of surfaces) {
            const bg = await getColorRgba(page, s, 'background-color');
            // All should have a non-transparent background
            expect(bg[3]).toBeGreaterThan(0.5);
        }
    });
});

// ==========================================================================
// Button variants
// ==========================================================================

test.describe('buttons', () => {
    test('all buttons are inline-flex with cursor pointer', async ({ page }) => {
        const buttons = ['btn-primary', 'btn-secondary', 'btn-ghost', 'btn-danger'];
        for (const btn of buttons) {
            expect(await getStyle(page, btn, 'display')).toBe('inline-flex');
            expect(await getStyle(page, btn, 'cursor')).toBe('pointer');
        }
    });

    test('disabled button has opacity < 1 and cursor not-allowed', async ({ page }) => {
        const opacity = await getStyle(page, 'btn-disabled', 'opacity');
        const cursor = await getStyle(page, 'btn-disabled', 'cursor');
        expect(parseFloat(opacity)).toBeLessThan(1);
        expect(cursor).toBe('not-allowed');
    });

    test('primary and danger have visible background color', async ({ page }) => {
        await setHtmlAttr(page, 'pdx-scheme', 'light');
        const primaryBg = await getColorRgba(page, 'btn-primary', 'background-color');
        const dangerBg = await getColorRgba(page, 'btn-danger', 'background-color');

        // Primary: a VISIBLE, opaque background (not transparent, not white). The Default
        // theme is deliberately vanilla (a low-chroma charcoal primary), so it cannot be
        // required to be chromatic — only to be a solid, visible fill.
        const isOpaqueFill = (c: number[]) =>
            c[3] > 0.9 && !(c[0] > 245 && c[1] > 245 && c[2] > 245); // opaque and not white
        expect(isOpaqueFill(primaryBg), `primary bg visible: ${primaryBg}`).toBe(true);

        // Danger: red → chromatic in every theme, always.
        const dangerChroma = Math.max(dangerBg[0], dangerBg[1], dangerBg[2])
            - Math.min(dangerBg[0], dangerBg[1], dangerBg[2]);
        expect(dangerChroma).toBeGreaterThan(20);
    });

    test('ghost button has transparent background', async ({ page }) => {
        const bg = await getColorRgba(page, 'btn-ghost', 'background-color');
        expect(bg[3]).toBeLessThan(0.1); // Nearly transparent
    });

    test('secondary button has visible border', async ({ page }) => {
        const borderWidth = await getStyle(page, 'btn-secondary', 'border-width');
        expect(px(borderWidth)).toBeGreaterThan(0);
    });

    test('link button (a tag) has same styling as button', async ({ page }) => {
        const btnDisplay = await getStyle(page, 'btn-primary', 'display');
        const linkDisplay = await getStyle(page, 'link-btn', 'display');
        expect(linkDisplay).toBe(btnDisplay);
    });

    test('all buttons have border-radius', async ({ page }) => {
        const buttons = ['btn-primary', 'btn-secondary', 'btn-ghost', 'btn-danger'];
        for (const btn of buttons) {
            const radius = await getStyle(page, btn, 'border-radius');
            expect(px(radius)).toBeGreaterThan(0);
        }
    });
});

// ==========================================================================
// Form inputs
// ==========================================================================

test.describe('inputs', () => {
    test('normal input has border and padding', async ({ page }) => {
        const borderWidth = await getStyle(page, 'input-normal', 'border-width');
        const padding = await getStyle(page, 'input-normal', 'padding-left');
        expect(px(borderWidth)).toBeGreaterThan(0);
        expect(px(padding)).toBeGreaterThan(0);
    });

    test('disabled input has reduced opacity', async ({ page }) => {
        const opacity = await getStyle(page, 'input-disabled', 'opacity');
        expect(parseFloat(opacity)).toBeLessThan(1);
    });

    test('error input has danger-colored border', async ({ page }) => {
        await setHtmlAttr(page, 'pdx-scheme', 'light');
        const borderColor = await getColorRgba(page, 'input-error', 'border-color');
        // Error border should be reddish (high R, low G)
        expect(borderColor[0]).toBeGreaterThan(borderColor[1]);
    });

    test('input is full width (display: block)', async ({ page }) => {
        expect(await getStyle(page, 'input-normal', 'display')).toBe('block');
    });

    test('select has no native appearance', async ({ page }) => {
        // Can't reliably test appearance:none across browsers,
        // but we can check it has a background-image (the chevron)
        const bgImage = await getStyle(page, 'select-normal', 'background-image');
        expect(bgImage).not.toBe('none');
    });

    test('textarea has min-height', async ({ page }) => {
        const minH = await getStyle(page, 'textarea-normal', 'min-height');
        expect(px(minH)).toBeGreaterThanOrEqual(90); // 6rem ~= 96px
    });
});
