/**
 * pdx-dropdown-menu on the site, measured in Chromium.
 *
 * The component does not read `{ divider: true }`, nor `checked` / `radioGroup` with no `type`: written
 * that way, every divider is a blank menuitem the arrows land on, and "Checkbox & radio items" shows
 * four plain menuitems that close the menu on click. Tab closes the menu, ArrowUp on the trigger opens
 * it on the last item, and the trigger has aria-controls.
 */
import { test, expect, type Page } from '@playwright/test';

const openOptions = async (page: Page) => {
    await page.goto('/components/pdx-dropdown-menu', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'View options' }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    return menu;
};

test('the options menu has radio and checkbox items, and a separator the arrows skip', async ({ page }) => {
    const menu = await openOptions(page);
    await expect(menu.getByRole('menuitem')).toHaveCount(0);
    await expect(menu.getByRole('separator')).toHaveCount(1);
    await expect(menu.getByRole('menuitemradio', { name: 'Grid view' })).toHaveAttribute('aria-checked', 'true');
    await expect(menu.getByRole('menuitemradio', { name: 'List view' })).toHaveAttribute('aria-checked', 'false');
    await expect(menu.getByRole('menuitemcheckbox', { name: 'Compact rows' })).toHaveAttribute('aria-checked', 'false');
    await expect(menu.getByRole('menuitemcheckbox', { name: 'Show grid lines' })).toHaveAttribute('aria-checked', 'true');

    // Focus opens on the first item; two ArrowDowns reach "Compact rows" across the separator.
    await expect(menu.getByRole('menuitemradio', { name: 'Grid view' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const compact = menu.getByRole('menuitemcheckbox', { name: 'Compact rows' });
    await expect(compact).toBeFocused();

    // Space toggles it once, and the menu stays open.
    await page.keyboard.press(' ');
    await expect(compact).toHaveAttribute('aria-checked', 'true');
    await expect(menu).toBeVisible();
    await expect(page.getByText('Last toggle:').locator('strong')).toHaveText('compact → true');
});

test('the trigger controls the open menu', async ({ page }) => {
    const menu = await openOptions(page);
    const id = await menu.getAttribute('id');
    expect(id).toBeTruthy();
    await expect(page.getByRole('button', { name: 'View options' })).toHaveAttribute('aria-controls', id!);
});

test('ArrowUp opens on the last item, and Tab closes and moves on from the trigger', async ({ page }) => {
    await page.goto('/components/pdx-dropdown-menu', { waitUntil: 'networkidle' });
    const trigger = page.getByRole('button', { name: 'Actions' }).first();
    const focusedName = () => page.evaluate(() => {
        const a = document.activeElement as HTMLElement;
        return `${a.tagName} ${a.textContent?.trim().slice(0, 30)}`;
    });

    // Where Tab goes from the trigger with the menu closed: the same place it must go from the open menu.
    await trigger.focus();
    await page.keyboard.press('Tab');
    const afterTrigger = await focusedName();
    expect(afterTrigger).not.toMatch(/^BODY/);

    await trigger.focus();
    await page.keyboard.press('ArrowUp');
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(await focusedName()).toBe(afterTrigger);
});
