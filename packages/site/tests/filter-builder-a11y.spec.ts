/**
 * pdx-filter-builder's add flow on the site, measured in Chromium.
 *
 * "+ Add Filter" opens a named dialog and moves focus into it; the value popover (shared with the
 * grid) is named too; Escape closes either; after Apply focus lands on the new chip, not on <body>.
 */
import { test, expect } from '@playwright/test';

test('Enter opens a named dialog with focus inside; Escape returns to the button', async ({ page }) => {
    await page.goto('/components/pdx-filter-builder', { waitUntil: 'networkidle' });
    const add = page.locator('pdx-filter-builder').first().locator('.pdx-fb-add-btn');
    await expect(add).toHaveAttribute('aria-haspopup', 'dialog');
    await add.focus();
    await page.keyboard.press('Enter');
    const picker = page.getByRole('dialog', { name: 'Add filter' });
    await expect(picker).toBeVisible();
    await expect(add).toHaveAttribute('aria-expanded', 'true');
    expect(await picker.evaluate(p => p.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(add).toBeFocused();
    await expect(add).toHaveAttribute('aria-expanded', 'false');
});

test('Category = Books from the keyboard: the value dialog is named, Apply filters and focuses the chip', async ({ page }) => {
    await page.goto('/components/pdx-filter-builder', { waitUntil: 'networkidle' });
    const builder = page.locator('pdx-filter-builder').first();
    const grid = page.locator('pdx-data-grid').first();
    const add = builder.locator('.pdx-fb-add-btn');
    await add.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog', { name: 'Add filter' }).getByRole('button', { name: 'Category' }).focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Category' });
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate(d => d.contains(document.activeElement))).toBe(true);
    await dialog.getByRole('checkbox', { name: 'Books' }).focus();
    await page.keyboard.press('Space');
    await dialog.getByRole('button', { name: 'Apply' }).focus();
    await page.keyboard.press('Enter');

    await expect(dialog).toHaveCount(0);
    await expect(builder.locator('.pdx-fb-chip')).toHaveCount(1);
    await expect(builder.locator('.pdx-fb-chip-remove')).toBeFocused();
    await expect(grid.locator('[role="row"]:has([role="gridcell"])')).toHaveCount(10);

    // Removing the only chip: focus on "+ Add Filter".
    await page.keyboard.press('Enter');
    await expect(builder.locator('.pdx-fb-chip')).toHaveCount(0);
    await expect(add).toBeFocused();
});

// A chip's label is a button: a span with a click listener would let a filter be removed from the
// keyboard but not changed.
test('a chip is edited from the keyboard: Books becomes Sports, and the grid follows', async ({ page }) => {
    await page.goto('/components/pdx-filter-builder', { waitUntil: 'networkidle' });
    const builder = page.locator('pdx-filter-builder').first();
    const grid = page.locator('pdx-data-grid').first();
    await builder.locator('.pdx-fb-add-btn').focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog', { name: 'Add filter' }).getByRole('button', { name: 'Category' }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Category' });
    await dialog.getByRole('checkbox', { name: 'Books' }).focus();
    await page.keyboard.press('Space');
    await dialog.getByRole('button', { name: 'Apply' }).focus();
    await page.keyboard.press('Enter');
    await expect(builder.locator('.pdx-fb-chip-remove')).toBeFocused();

    // Shift+Tab from the chip's ✕ reaches its label, a button named after the filter.
    await page.keyboard.press('Shift+Tab');
    const label = builder.getByRole('button', { name: /^Edit filter: Category/ });
    await expect(label).toBeFocused();
    await expect(builder.getByRole('button', { name: /^Remove filter: Category/ })).toHaveCount(1);
    // Still drawn as the chip's text: no button chrome.
    const look = await label.evaluate((b) => {
        const s = getComputedStyle(b), chip = getComputedStyle(b.parentElement!);
        return { font: s.fontSize === chip.fontSize, border: s.borderTopStyle, bg: s.backgroundColor };
    });
    expect(look).toEqual({ font: true, border: 'none', bg: 'rgba(0, 0, 0, 0)' });

    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: 'Books' })).toBeChecked();
    await dialog.getByRole('checkbox', { name: 'Books' }).focus();
    await page.keyboard.press('Space');
    await dialog.getByRole('checkbox', { name: 'Sports' }).focus();
    await page.keyboard.press('Space');
    await dialog.getByRole('button', { name: 'Apply' }).focus();
    await page.keyboard.press('Enter');

    await expect(dialog).toHaveCount(0);
    await expect(builder.getByRole('button', { name: /^Edit filter: Category/ })).toContainText('Sports');
    const categories = grid.locator('[role="row"] [role="gridcell"][data-field="category"]');
    await expect(categories.first()).toHaveText('Sports');
    const texts = await categories.allTextContents();
    expect(texts.length).toBeGreaterThan(0);
    expect(new Set(texts)).toEqual(new Set(['Sports']));
});
