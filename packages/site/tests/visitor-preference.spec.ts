/**
 * The site keeps the visitor's scheme and theme, in the cookie it shares with the builder (#29).
 *
 * The scheme was not kept at all: `toggleScheme` set the attribute, and every load started dark
 * again. The theme was kept in localStorage, which themebuilder.pdxui.com cannot read. Both now go
 * through brand/preference.ts; the cookie is read on load and written on every change.
 */
import { test, expect } from './fixture';
import { PREFERENCE_COOKIE } from '../../../brand/preference';

const cookieOf = async (page: import('@playwright/test').Page): Promise<string> =>
    decodeURIComponent((await page.context().cookies()).find(c => c.name === PREFERENCE_COOKIE)?.value ?? '');

test('a scheme chosen on the site survives a reload', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('pdx-scheme', 'dark');
    await page.locator('.scheme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('pdx-scheme', 'light');
    await expect.poll(() => cookieOf(page)).toContain('"scheme":"light"');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('pdx-scheme', 'light');
    await expect(page.locator('.scheme-toggle')).toHaveText('☾');
});

test('a theme chosen on the site is written to the shared cookie and read back', async ({ page }) => {
    await page.goto('/');
    await page.locator('.theme-select').selectOption('material');
    await expect.poll(() => cookieOf(page)).toContain('"theme":"material"');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('pdx-theme', 'material');
    await expect(page.locator('.theme-select')).toHaveValue('material');
});

test('a choice made in the builder is what the site opens with', async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: PREFERENCE_COOKIE, value: encodeURIComponent(JSON.stringify({ scheme: 'light', theme: 'fluent' })), url: baseURL! }]);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('pdx-scheme', 'light');
    await expect(page.locator('html')).toHaveAttribute('pdx-theme', 'fluent');
});
