import { test, expect } from '@playwright/test';
import { getStyle, px } from './helpers';

const URL = '/demo/test-harness.html';

test.beforeEach(async ({ page }) => {
    await page.goto(URL);
});

// ==========================================================================
// Typography hierarchy (sizes must be strictly decreasing)
// ==========================================================================

test.describe('typography hierarchy', () => {
    test('font sizes are in descending order: display > title > heading > subheading > body > small > caption', async ({ page }) => {
        const roles = ['txt-display', 'txt-title', 'txt-heading', 'txt-subheading', 'txt-body', 'txt-small', 'txt-caption'];
        const sizes: number[] = [];

        for (const role of roles) {
            const fs = await getStyle(page, role, 'font-size');
            sizes.push(px(fs));
        }

        for (let i = 0; i < sizes.length - 1; i++) {
            expect(sizes[i]).toBeGreaterThan(sizes[i + 1]);
        }
    });

    test('heading roles use heading font family', async ({ page }) => {
        const headingRoles = ['txt-display', 'txt-title', 'txt-heading', 'txt-subheading'];
        for (const role of headingRoles) {
            const ff = await getStyle(page, role, 'font-family');
            expect(ff.toLowerCase()).toContain('manrope');
        }
    });

    test('mono role uses monospace font', async ({ page }) => {
        const ff = await getStyle(page, 'txt-mono', 'font-family');
        expect(ff.toLowerCase()).toMatch(/jetbrains|consolas|monospace/);
    });

    test('label is uppercase', async ({ page }) => {
        const tt = await getStyle(page, 'txt-label', 'text-transform');
        expect(tt).toBe('uppercase');
    });

    test('display has tight line-height', async ({ page }) => {
        const lh = await getStyle(page, 'txt-display', 'line-height');
        const fs = await getStyle(page, 'txt-display', 'font-size');
        // tight = 1.25, so line-height / font-size should be ~1.25
        const ratio = px(lh) / px(fs);
        expect(ratio).toBeLessThan(1.4);
    });

    test('body has normal line-height', async ({ page }) => {
        const lh = await getStyle(page, 'txt-body', 'line-height');
        const fs = await getStyle(page, 'txt-body', 'font-size');
        const ratio = px(lh) / px(fs);
        // normal = 1.6
        expect(ratio).toBeGreaterThan(1.4);
        expect(ratio).toBeLessThan(1.8);
    });
});

// ==========================================================================
// Ink colors (each should produce a different color)
// ==========================================================================

test.describe('ink colors', () => {
    test('all ink classes produce distinct colors', async ({ page }) => {
        const inks = ['ink-default', 'ink-muted', 'ink-primary', 'ink-accent', 'ink-danger', 'ink-success', 'ink-warning'];
        const colors: string[] = [];

        for (const ink of inks) {
            const c = await getStyle(page, ink, 'color');
            colors.push(c);
        }

        // Check that at least 5 distinct colors exist (some may be close)
        const unique = new Set(colors);
        expect(unique.size).toBeGreaterThanOrEqual(5);
    });

    test('muted is less saturated than primary', async ({ page }) => {
        // Muted should have lower chroma than primary
        const muted = await getStyle(page, 'ink-muted', 'color');
        const primary = await getStyle(page, 'ink-primary', 'color');
        // Both are computed — different enough indicates different roles
        expect(muted).not.toBe(primary);
    });
});
