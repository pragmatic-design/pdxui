/**
 * <pdx-fieldset disabled> on the site, measured in Chromium.
 *
 * The prop reaches the inner <fieldset> as the native attribute — a prop declared and read by nothing
 * leaves the "Disabled Section" demo's input taking typing. The native attribute disables every
 * control inside it, a pdx-input's inner <input> included.
 */
import { test, expect } from '@playwright/test';

test('the Disabled Section refuses typing', async ({ page }) => {
    await page.goto('/components/pdx-fieldset', { waitUntil: 'networkidle' });
    const section = page.locator('pdx-fieldset[legend="Disabled Section"]');
    await expect(section.locator('fieldset')).toHaveAttribute('disabled', '');
    const input = section.getByRole('textbox');
    await expect(input).toBeDisabled();
    // A disabled control takes no focus and no text: a forced fill is refused.
    await expect(input.fill('typed', { timeout: 1000 })).rejects.toThrow();
    await expect(input).toHaveValue('');
    // Another fieldset on the page is untouched.
    await expect(page.locator('pdx-fieldset:not([disabled]) fieldset').first()).not.toHaveAttribute('disabled', '');
});
