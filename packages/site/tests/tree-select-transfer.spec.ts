/**
 * pdx-tree-select and pdx-transfer on the site, in Chromium.
 *
 * tree-select opens on Enter and then follows the keyboard (a highlight announced through
 * aria-activedescendant, Enter picks it) and writes aria-expanded "true" or "false" on every branch,
 * never ""; transfer has one tab stop per list, keeps focus on the option after a click instead of
 * <body>, and names its search fields.
 */
import { test, expect } from '@playwright/test';

test('tree-select: Enter, ↓, →, ↓, Enter picks Frontend from the keyboard', async ({ page }) => {
    await page.goto('/components/pdx-tree-select', { waitUntil: 'networkidle' });
    const combo = page.getByRole('combobox', { name: 'Department' }).first();
    await combo.focus();
    await page.keyboard.press('Enter');
    await expect(combo).toHaveAttribute('aria-expanded', 'true');
    const active = async () => page.locator(`#${await combo.getAttribute('aria-activedescendant')}`);
    await page.keyboard.press('ArrowDown');
    await expect(await active()).toContainText('Engineering');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect(await active()).toContainText('Frontend');
    await page.keyboard.press('Enter');
    await expect(combo).toHaveAttribute('aria-expanded', 'false');
    await expect(combo).toContainText('Frontend');
    await expect(combo).toBeFocused();
});

test('tree-select: branches say true or false, and the tree is named', async ({ page }) => {
    await page.goto('/components/pdx-tree-select', { waitUntil: 'networkidle' });
    const combo = page.getByRole('combobox', { name: 'Department' }).first();
    await combo.click();
    const tree = page.getByRole('tree', { name: 'Department' });
    await expect(tree).toBeVisible();
    const values = await tree.locator('[role="treeitem"][aria-expanded]').evaluateAll((items) => items.map((i) => i.getAttribute('aria-expanded')));
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(['true', 'false']).toContain(v);
});

test('transfer: one tab stop per list, focus kept after a click, search fields named', async ({ page }) => {
    await page.goto('/components/pdx-transfer', { waitUntil: 'networkidle' });
    const lists = page.locator('pdx-transfer [role="listbox"]');
    const n = await lists.count();
    expect(n).toBeGreaterThan(1);
    for (let i = 0; i < n; i++) {
        const options = await lists.nth(i).locator('[role="option"]:not([aria-disabled="true"])').count();
        if (options > 0) await expect(lists.nth(i).locator('[role="option"][tabindex="0"]')).toHaveCount(1);
    }
    const option = lists.first().getByRole('option').nth(1);
    const label = (await option.textContent())?.trim() ?? '';
    await option.click();
    const focused = page.locator(':focus');
    await expect(focused).toHaveAttribute('role', 'option');
    await expect(focused).toContainText(label);
    const searches = page.locator('pdx-transfer .pdx-transfer-search input');
    expect(await searches.count()).toBeGreaterThan(0);
    for (let i = 0; i < await searches.count(); i++) await expect(searches.nth(i)).toHaveAccessibleName(/^Search \S/);
});
