/**
 * The date-picker page from the keyboard, measured with getByRole in Chromium: "2024 only" opens a
 * named dialog on December 2024 — not on today's month, with every day disabled — with focus on a day
 * that can be picked, a keyboard pick is one pdx-change, not two, and focus comes back to the trigger
 * rather than dropping to <body>.
 */
import { test, expect } from '@playwright/test';

test('"2024 only" opens a named dialog on the last allowed month, and a pick is one event', async ({ page }) => {
    await page.goto('/components/pdx-date-picker', { waitUntil: 'networkidle' });
    const trigger = page.getByRole('combobox', { name: '2024 only' });
    const host = page.locator('pdx-date-picker').filter({ has: trigger });
    await host.evaluate((el) => {
        (window as unknown as { __changes: unknown[] }).__changes = [];
        el.addEventListener('pdx-change', (e) => (window as unknown as { __changes: unknown[] }).__changes.push((e as CustomEvent).detail));
    });

    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = host.getByRole('dialog', { name: 'Choose date' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('grid')).toHaveAccessibleName('December 2024');
    const focused = dialog.locator(':focus');
    await expect(focused).toHaveAttribute('role', 'gridcell');
    await expect(focused).not.toHaveAttribute('aria-disabled', 'true');

    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    const changes = await page.evaluate(() => (window as unknown as { __changes: unknown[] }).__changes);
    expect(changes).toEqual([{ value: '2024-12-30' }]);
});
