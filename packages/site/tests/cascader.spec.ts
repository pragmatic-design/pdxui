/**
 * pdx-cascader on its gallery page, measured in Chromium: the keyboard reaches a leaf through the
 * columns, not just opens the panel; the lazy-loading demo loads; and the search input is named.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/components/pdx-cascader', { waitUntil: 'networkidle' });
});

test('the keyboard walks down and right to a leaf, and Enter selects it', async ({ page }) => {
    const combo = page.getByRole('combobox', { name: 'Select location' });
    await combo.focus();
    await page.keyboard.press('ArrowDown');                 // opens on Europe
    await expect(combo).toHaveAttribute('aria-expanded', 'true');
    for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown']) await page.keyboard.press(k);   // Italy, Rome, Milan
    const activeId = await combo.getAttribute('aria-activedescendant');
    await expect(page.locator(`[id="${activeId}"]`)).toHaveText('Milan');
    await page.keyboard.press('Enter');
    await expect(combo).toHaveAttribute('aria-expanded', 'false');
    await expect(combo).toContainText('Europe / Italy / Milan');
    await expect(combo).toBeFocused();
});

test('the lazy-loading demo loads a country\'s regions when it is opened', async ({ page }) => {
    const combo = page.getByRole('combobox', { name: 'Pick a region' });
    await combo.click();
    await page.getByRole('option', { name: 'Italy' }).click();
    await expect(page.getByRole('option', { name: 'Tuscany' })).toBeVisible();
});

test('the search input is named, and its results are options', async ({ page }) => {
    const combo = page.getByRole('combobox', { name: 'Search location...' });
    await combo.click();
    const search = page.getByRole('textbox', { name: 'Search options' });
    await search.fill('rom');
    await expect(page.getByRole('listbox', { name: 'Search results' }).getByRole('option')).toHaveText(['Europe / Italy / Rome']);
});
