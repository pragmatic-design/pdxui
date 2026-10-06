import { test, expect } from '@playwright/test';
import { getStyle, getColorRgba, getToken, setHtmlAttr, contrastRatio } from './helpers';

const URL = '/demo/test-harness.html';

test.beforeEach(async ({ page }) => {
    await page.goto(URL);
});

// ==========================================================================
// Scheme switching (light / dark / auto)
// ==========================================================================

test.describe('scheme switching', () => {
    test('light scheme produces light background', async ({ page }) => {
        await setHtmlAttr(page, 'pdx-scheme', 'light');
        const [r, g, b] = await getColorRgba(page, 'surface-base', 'background-color');
        // Light background: high luminance (r,g,b > 200)
        expect(r).toBeGreaterThan(200);
        expect(g).toBeGreaterThan(200);
        expect(b).toBeGreaterThan(200);
    });

    test('dark scheme produces dark background', async ({ page }) => {
        await setHtmlAttr(page, 'pdx-scheme', 'dark');
        const [r, g, b] = await getColorRgba(page, 'surface-base', 'background-color');
        // Dark background: low luminance (r,g,b < 60)
        expect(r).toBeLessThan(60);
        expect(g).toBeLessThan(60);
        expect(b).toBeLessThan(60);
    });

    test('light text is dark, dark text is light', async ({ page }) => {
        await setHtmlAttr(page, 'pdx-scheme', 'light');
        const [lr, lg, lb] = await getColorRgba(page, 'ink-default', 'color');

        await setHtmlAttr(page, 'pdx-scheme', 'dark');
        const [dr, dg, db] = await getColorRgba(page, 'ink-default', 'color');

        // Light mode text should be darker than dark mode text
        expect(lr + lg + lb).toBeLessThan(dr + dg + db);
    });

    test('card surface changes between schemes', async ({ page }) => {
        await setHtmlAttr(page, 'pdx-scheme', 'light');
        const lightBg = await getColorRgba(page, 'surface-card', 'background-color');

        await setHtmlAttr(page, 'pdx-scheme', 'dark');
        const darkBg = await getColorRgba(page, 'surface-card', 'background-color');

        // Colors must be different
        expect(Math.abs(lightBg[0] - darkBg[0]) + Math.abs(lightBg[1] - darkBg[1])).toBeGreaterThan(50);
    });
});

// ==========================================================================
// Theme switching (neutral / pragmatic / corporate / playful)
// ==========================================================================

test.describe('theme switching', () => {
    test('each theme produces a different --pdx-color-primary token', async ({ page }) => {
        const colors: string[] = [];

        for (const theme of ['neutral', 'pragmatic', 'corporate', 'playful']) {
            await setHtmlAttr(page, 'pdx-theme', theme);
            const val = await getToken(page, '--pdx-color-primary');
            colors.push(val);
        }

        // All 4 should be distinct
        const unique = new Set(colors);
        expect(unique.size).toBe(4);
    });

    test('switching theme changes --pdx-color-primary immediately', async ({ page }) => {
        await setHtmlAttr(page, 'pdx-theme', 'neutral');
        const defaultToken = await getToken(page, '--pdx-color-primary');

        await setHtmlAttr(page, 'pdx-theme', 'pragmatic');
        const pragmaticToken = await getToken(page, '--pdx-color-primary');

        expect(defaultToken).not.toBe(pragmaticToken);
    });

    test('theme x scheme matrix: all 8 combos produce valid surfaces', async ({ page }) => {
        const themes = ['neutral', 'pragmatic', 'corporate', 'playful'];
        const schemes = ['light', 'dark'];

        for (const theme of themes) {
            for (const scheme of schemes) {
                await setHtmlAttr(page, 'pdx-theme', theme);
                await setHtmlAttr(page, 'pdx-scheme', scheme);

                const bg = await getColorRgba(page, 'surface-card', 'background-color');
                const text = await getColorRgba(page, 'surface-card', 'color');

                // Background and text must be different enough
                const diff = Math.abs(bg[0] - text[0]) + Math.abs(bg[1] - text[1]) + Math.abs(bg[2] - text[2]);
                expect(diff).toBeGreaterThan(100);
            }
        }
    });
});

// ==========================================================================
// Density
// ==========================================================================

test.describe('density', () => {
    test('compact density reduces gap', async ({ page }) => {
        await setHtmlAttr(page, 'pdx-density', 'normal');
        const normalGap = await getStyle(page, 'density-stack', 'gap');

        await setHtmlAttr(page, 'pdx-density', 'compact');
        const compactGap = await getStyle(page, 'density-stack', 'gap');

        // Compact gap should be smaller
        expect(parseFloat(compactGap)).toBeLessThan(parseFloat(normalGap));
    });

    test('comfort density increases gap', async ({ page }) => {
        await setHtmlAttr(page, 'pdx-density', 'normal');
        const normalGap = await getStyle(page, 'density-stack', 'gap');

        await setHtmlAttr(page, 'pdx-density', 'comfort');
        const comfortGap = await getStyle(page, 'density-stack', 'gap');

        // Comfort gap should be larger
        expect(parseFloat(comfortGap)).toBeGreaterThan(parseFloat(normalGap));
    });

    test('density factor values are correct', async ({ page }) => {
        await setHtmlAttr(page, 'pdx-density', 'compact');
        const compact = await getToken(page, '--pdx-density-factor');
        expect(compact).toBe('0.75');

        await setHtmlAttr(page, 'pdx-density', 'normal');
        const normal = await getToken(page, '--pdx-density-factor');
        expect(normal).toBe('1');

        await setHtmlAttr(page, 'pdx-density', 'comfort');
        const comfort = await getToken(page, '--pdx-density-factor');
        expect(comfort).toBe('1.25');
    });
});

// ==========================================================================
// WCAG Contrast ratios
// ==========================================================================

test.describe('contrast (WCAG AA)', () => {
    const themes = ['neutral', 'pragmatic', 'corporate', 'playful'];
    const schemes: ('light' | 'dark')[] = ['light', 'dark'];

    for (const theme of themes) {
        for (const scheme of schemes) {
            test(`${theme}/${scheme}: text on surface-card >= 4.5:1`, async ({ page }) => {
                await setHtmlAttr(page, 'pdx-theme', theme);
                await setHtmlAttr(page, 'pdx-scheme', scheme);

                const bg = await getColorRgba(page, 'surface-card', 'background-color');
                const text = await getColorRgba(page, 'surface-card', 'color');

                const ratio = contrastRatio(
                    [bg[0], bg[1], bg[2]],
                    [text[0], text[1], text[2]]
                );

                expect(ratio).toBeGreaterThanOrEqual(4.5);
            });

            test(`${theme}/${scheme}: primary button text on bg >= 3:1`, async ({ page }) => {
                await setHtmlAttr(page, 'pdx-theme', theme);
                await setHtmlAttr(page, 'pdx-scheme', scheme);

                const bg = await getColorRgba(page, 'btn-primary', 'background-color');
                const text = await getColorRgba(page, 'btn-primary', 'color');

                const ratio = contrastRatio(
                    [bg[0], bg[1], bg[2]],
                    [text[0], text[1], text[2]]
                );

                expect(ratio).toBeGreaterThanOrEqual(3);
            });
        }
    }
});
