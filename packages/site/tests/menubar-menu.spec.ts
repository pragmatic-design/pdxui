/**
 * Menubar and menu on the site, measured in Chromium.
 *
 * A click on a menubar item leaves open the menu its own hover has just opened; the pdx-menu page
 * shows a pdx-menu; and ArrowLeft in a submenu closes the submenu and leaves its parent open.
 */
import { test, expect } from '@playwright/test';

// The default is `click`: the first bar on the page is the default one, the second
// the one that sets trigger="hover".
test('menubar: by default the pointer opens nothing, a click does, and then the pointer switches menus', async ({ page }) => {
    await page.goto('/components/pdx-menubar', { waitUntil: 'networkidle' });
    const bar = page.locator('pdx-menubar').first();
    const file = bar.locator('[data-menubar-key]').first();
    const edit = bar.locator('[data-menubar-key]').nth(1);

    await file.hover();
    await expect(file).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.pdx-menubar-panel')).toHaveCount(0);

    await file.click();
    await expect(file).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.pdx-menubar-panel')).toBeVisible();

    await edit.hover();
    await expect(edit).toHaveAttribute('aria-expanded', 'true');
    await expect(file).toHaveAttribute('aria-expanded', 'false');
});

test('menubar trigger="hover": moving onto File and clicking it leaves its menu open', async ({ page }) => {
    await page.goto('/components/pdx-menubar', { waitUntil: 'networkidle' });
    const hoverBar = page.locator('pdx-menubar[trigger="hover"]').first();
    const file = hoverBar.locator('[data-menubar-key]').first();
    await file.hover();
    await expect(file).toHaveAttribute('aria-expanded', 'true');
    await file.click();
    await expect(file).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.pdx-menubar-panel')).toBeVisible();
});

test('menu page: pdx-menu opens from its button, and ArrowLeft leaves a submenu', async ({ page }) => {
    await page.goto('/components/pdx-menu', { waitUntil: 'networkidle' });
    const menus = page.locator('pdx-menu');
    expect(await menus.count()).toBeGreaterThan(0);
    // Closed until asked: a menu open at load would take focus from the page.
    await expect(menus.first()).toBeHidden();

    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    const image = page.getByRole('menuitem', { name: 'Image', exact: true });
    await expect(image).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const shapes = page.getByRole('menuitem', { name: 'Shapes', exact: true });
    await expect(shapes).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('menuitem', { name: 'Rectangle', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(shapes).toBeFocused();
    await expect(page.getByRole('menuitem', { name: 'Rectangle', exact: true })).toHaveCount(0);

    // Escape on the menu closes it and returns to its button.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Insert', exact: true })).toBeFocused();
});
