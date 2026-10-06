/**
 * pdx-masked-input's presets on the site, measured in Chromium.
 *
 * phone-intl takes a one-digit country code (15551234567 → "+1 (555) 123-4567", not
 * "+15 (551) 234-567"); the time preset opens a numeric keyboard; the date preset marks month 13
 * invalid.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/components/pdx-masked-input', { waitUntil: 'networkidle' });
});

test('phone-intl takes a one-digit country code', async ({ page }) => {
    const field = page.getByRole('textbox', { name: 'Phone (International)' });
    await field.pressSequentially('15551234567');
    await expect(field).toHaveValue('+1 (555) 123-4567');
});

test('the time field opens a numeric keyboard', async ({ page }) => {
    await expect(page.getByRole('textbox', { name: 'Time (HH:MM)' })).toHaveAttribute('inputmode', 'numeric');
});

test('an impossible date is kept as typed and marked invalid', async ({ page }) => {
    const field = page.getByRole('textbox', { name: 'Date (MM/DD/YYYY)' });
    await field.pressSequentially('13452024');
    await expect(field).toHaveValue('13/45/2024');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    // Wait for the clear before typing again. `fill('')` dispatches one input event and
    // `pressSequentially` does not wait for it, so under load the keys can land while the mask is
    // still FULL from the line above — and a full mask has no room, so all eight digits are
    // dropped and the field still reads 13/45/2024. It is also worth asserting on its
    // own: that clearing a masked field empties it.
    await field.fill('');
    await expect(field).toHaveValue('');
    await field.pressSequentially('12252024');
    await expect(field).toHaveValue('12/25/2024');
    await expect(field).not.toHaveAttribute('aria-invalid', 'true');
});
