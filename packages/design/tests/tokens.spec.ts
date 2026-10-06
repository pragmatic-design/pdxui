import { test, expect } from '@playwright/test';
import { getToken, setHtmlAttr } from './helpers';

const URL = '/demo/test-harness.html';

test.beforeEach(async ({ page }) => {
    await page.goto(URL);
});

// ==========================================================================
// Token integrity: every --pdx-* token must resolve to a value
// ==========================================================================

test.describe('token integrity', () => {
    const requiredTokens = [
        // Spacing
        '--pdx-space-2xs', '--pdx-space-xs', '--pdx-space-sm', '--pdx-space-md',
        '--pdx-space-lg', '--pdx-space-xl', '--pdx-space-2xl',
        // Typography
        '--pdx-font-sans', '--pdx-font-heading', '--pdx-font-mono',
        '--pdx-text-xs', '--pdx-text-sm', '--pdx-text-base', '--pdx-text-lg',
        '--pdx-text-xl', '--pdx-text-2xl', '--pdx-text-3xl', '--pdx-text-display',
        '--pdx-line-tight', '--pdx-line-normal', '--pdx-line-loose',
        '--pdx-weight-normal', '--pdx-weight-medium', '--pdx-weight-semibold', '--pdx-weight-bold',
        // Radius
        '--pdx-radius-sm', '--pdx-radius-md', '--pdx-radius-lg', '--pdx-radius-xl', '--pdx-radius-full',
        // Max-width
        '--pdx-max-xs', '--pdx-max-sm', '--pdx-max-md', '--pdx-max-lg', '--pdx-max-xl', '--pdx-max-2xl',
        // Z-index
        '--pdx-z-dropdown', '--pdx-z-sticky', '--pdx-z-overlay', '--pdx-z-modal', '--pdx-z-toast',
        // Transition
        '--pdx-ease', '--pdx-duration',
        // Density
        '--pdx-density-factor',
        // Color hues
        '--pdx-hue-primary', '--pdx-hue-accent', '--pdx-hue-danger', '--pdx-hue-warning', '--pdx-hue-success',
    ];

    for (const token of requiredTokens) {
        test(`${token} has a resolved value`, async ({ page }) => {
            const val = await getToken(page, token);
            expect(val).not.toBe('');
        });
    }
});

// ==========================================================================
// Spacing scale is monotonically increasing
// ==========================================================================

test.describe('spacing scale', () => {
    test('spacing values increase: 2xs < xs < sm < md < lg < xl < 2xl', async ({ page }) => {
        // Tokens use calc() so we measure via a real element's computed gap
        const steps = ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'];

        const values = await page.evaluate((steps) => {
            return steps.map(s => {
                const el = document.createElement('pdx-stack');
                el.setAttribute('gap', s);
                el.style.position = 'absolute';
                el.style.visibility = 'hidden';
                document.body.appendChild(el);
                const val = parseFloat(getComputedStyle(el).gap);
                el.remove();
                return val;
            });
        }, steps);

        for (let i = 0; i < values.length - 1; i++) {
            expect(values[i]).toBeLessThan(values[i + 1]);
        }
    });
});

// ==========================================================================
// Z-index scale is monotonically increasing
// ==========================================================================

test.describe('z-index scale', () => {
    test('z-index values increase: dropdown < sticky < overlay < modal < toast', async ({ page }) => {
        const steps = ['--pdx-z-dropdown', '--pdx-z-sticky', '--pdx-z-overlay',
            '--pdx-z-modal', '--pdx-z-toast'];

        const values: number[] = [];
        for (const step of steps) {
            const val = await getToken(page, step);
            values.push(parseInt(val));
        }

        for (let i = 0; i < values.length - 1; i++) {
            expect(values[i]).toBeLessThan(values[i + 1]);
        }
    });
});

// ==========================================================================
// Max-width scale
// ==========================================================================

test.describe('max-width scale', () => {
    test('max-width values increase: xs < sm < md < lg < xl < 2xl', async ({ page }) => {
        const steps = ['--pdx-max-xs', '--pdx-max-sm', '--pdx-max-md',
            '--pdx-max-lg', '--pdx-max-xl', '--pdx-max-2xl'];

        const values: number[] = [];
        for (const step of steps) {
            const val = await getToken(page, step);
            values.push(parseFloat(val));
        }

        for (let i = 0; i < values.length - 1; i++) {
            expect(values[i]).toBeLessThan(values[i + 1]);
        }
    });
});

// ==========================================================================
// Theme hue overrides
// ==========================================================================

test.describe('theme hue overrides', () => {
    test('pragmatic theme changes primary hue', async ({ page }) => {
        const defaultHue = await getToken(page, '--pdx-hue-primary');
        await setHtmlAttr(page, 'pdx-theme', 'pragmatic');
        const pragmaticHue = await getToken(page, '--pdx-hue-primary');
        expect(defaultHue).not.toBe(pragmaticHue);
    });

    test('corporate theme changes primary hue', async ({ page }) => {
        const defaultHue = await getToken(page, '--pdx-hue-primary');
        await setHtmlAttr(page, 'pdx-theme', 'corporate');
        const corpHue = await getToken(page, '--pdx-hue-primary');
        expect(defaultHue).not.toBe(corpHue);
    });

    test('playful theme changes primary hue', async ({ page }) => {
        const defaultHue = await getToken(page, '--pdx-hue-primary');
        await setHtmlAttr(page, 'pdx-theme', 'playful');
        const playHue = await getToken(page, '--pdx-hue-primary');
        expect(defaultHue).not.toBe(playHue);
    });

    test('all 4 themes have distinct primary hues', async ({ page }) => {
        const hues: string[] = [];
        for (const theme of ['neutral', 'pragmatic', 'corporate', 'playful']) {
            await setHtmlAttr(page, 'pdx-theme', theme);
            hues.push(await getToken(page, '--pdx-hue-primary'));
        }
        const unique = new Set(hues);
        expect(unique.size).toBe(4);
    });
});
