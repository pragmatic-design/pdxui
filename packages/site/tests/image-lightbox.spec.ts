/**
 * pdx-image's lightbox on the site, measured in Chromium.
 *
 * The trigger is a named button, not the <img> itself; the overlay is a named modal dialog with a
 * close button; focus moves into it, and after Escape it returns to the trigger, not the page host.
 */
import { test, expect } from '@playwright/test';

test('the lightbox opens from the keyboard as a named modal dialog, and Escape returns to the image', async ({ page }) => {
    // Not networkidle: the page's images come from an external host, and the lightbox needs only
    // their URL, not the pixels.
    await page.goto('/components/pdx-image', { waitUntil: 'domcontentloaded' });
    const trigger = page.getByRole('button', { name: 'View Lightbox', exact: true });
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Mountain landscape' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    const close = dialog.getByRole('button', { name: 'Close' });
    await expect(close).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();   // the only control: the trap keeps focus on it

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // The close button, from the keyboard.
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
});
