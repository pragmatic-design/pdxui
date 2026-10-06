/**
 * pdx-toolbar and pdx-toggle on the site, in Chromium.
 *
 * On /components/pdx-toolbar each demo toolbar is one tab stop, the arrows move between its
 * controls, each toolbar has its own name rather than "Toolbar", and its icon-only buttons are named.
 * On /components/pdx-toggle the formatting toggles are named by what they do, not "B", "I", "U", "S".
 */
import { test, expect } from '@playwright/test';

test('each demo toolbar is named, one tab stop, and every control has a name', async ({ page }) => {
    await page.goto('/components/pdx-toolbar', { waitUntil: 'networkidle' });
    for (const name of ['Text formatting', 'File actions', 'Row actions']) {
        const toolbar = page.getByRole('toolbar', { name });
        await expect(toolbar).toBeVisible();
        await expect(toolbar.locator('[tabindex="0"]')).toHaveCount(1);
        const buttons = toolbar.getByRole('button');
        const n = await buttons.count();
        expect(n).toBeGreaterThan(1);
        await expect(toolbar.locator('button[tabindex="-1"]')).toHaveCount(n - 1);
        for (let i = 0; i < n; i++) await expect(buttons.nth(i)).toHaveAccessibleName(/\S/);
    }
});

test('the arrows move between the controls, and Tab leaves the toolbar', async ({ page }) => {
    await page.goto('/components/pdx-toolbar', { waitUntil: 'networkidle' });
    const toolbar = page.getByRole('toolbar', { name: 'Row actions' });
    await toolbar.getByRole('button', { name: 'Edit' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(toolbar.getByRole('button', { name: 'Copy' })).toBeFocused();
    await page.keyboard.press('End');
    await expect(toolbar.getByRole('button', { name: 'Upload' })).toBeFocused();
    await page.keyboard.press('Tab');
    expect(await toolbar.evaluate((t) => t.contains(document.activeElement))).toBe(false);
    await page.keyboard.press('Shift+Tab');
    await expect(toolbar.getByRole('button', { name: 'Upload' }), 'Tab comes back to the last one used').toBeFocused();
});

test('the formatting toggles are named by what they do', async ({ page }) => {
    await page.goto('/components/pdx-toggle', { waitUntil: 'networkidle' });
    for (const name of ['Bold', 'Italic', 'Underline', 'Strikethrough']) {
        await expect(page.getByRole('button', { name, exact: true }).first()).toHaveAttribute('aria-pressed', /true|false/);
    }
});
