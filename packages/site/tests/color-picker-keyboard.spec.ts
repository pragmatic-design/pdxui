/**
 * pdx-color-picker from the keyboard on the site, measured with getByRole in Chromium: the swatch
 * opens a named dialog and focus lands on the colour area, not on the swatch; the arrows move it, Tab
 * reaches hue, and Escape brings focus back to the swatch. Each of the three sliders, opacity
 * included, is a tab stop with its own keys.
 */
import { test, expect } from '@playwright/test';

test('open with Enter: focus in the colour area, arrows move it, Escape returns to the swatch', async ({ page }) => {
    await page.goto('/components/pdx-color-picker', { waitUntil: 'networkidle' });
    const picker = page.locator('pdx-color-picker[value="#3b82f6"]:not([size])').first();
    const swatch = picker.locator('.pdx-color-swatch');
    await expect(swatch).toHaveAttribute('aria-haspopup', 'dialog');
    await swatch.focus();
    await page.keyboard.press('Enter');

    const dialog = picker.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName(/\S/);
    const area = dialog.getByRole('slider', { name: 'Color' });
    await expect(area).toBeFocused();
    const before = await area.getAttribute('aria-valuetext');
    await page.keyboard.press('ArrowUp');
    await expect(area).not.toHaveAttribute('aria-valuetext', before!);

    await page.keyboard.press('Tab');
    const hue = dialog.getByRole('slider', { name: 'Hue' });
    await expect(hue).toBeFocused();
    const h = Number(await hue.getAttribute('aria-valuenow'));
    await page.keyboard.press('ArrowRight');
    await expect(hue).toHaveAttribute('aria-valuenow', String(h + 1));

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(swatch).toBeFocused();
});

test('opacity is reachable and moved from the keyboard', async ({ page }) => {
    await page.goto('/components/pdx-color-picker', { waitUntil: 'networkidle' });
    const picker = page.locator('pdx-color-picker[show-alpha]').first();
    await picker.locator('.pdx-color-swatch').click();
    // The keyboard path: opening lands on the colour area (a frame after the click), then Tab, Tab.
    await expect(picker.getByRole('slider', { name: 'Color' })).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const opacity = picker.getByRole('slider', { name: 'Opacity' });
    await expect(opacity).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(opacity).toHaveAttribute('aria-valuetext', '99%');
});
