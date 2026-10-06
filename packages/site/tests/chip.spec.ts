/**
 * The chip page from the keyboard, measured with getByRole in Chromium: a selectable chip is pressed
 * with Space, plain chips are not tab stops, every × says what it removes (not just "Remove"), a
 * keyboard removal leaves focus on the next × rather than on <body>, and the avatar chips really go
 * away instead of only logging.
 */
import { test, expect } from '@playwright/test';

test('Space presses a selectable chip', async ({ page }) => {
    await page.goto('/components/pdx-chip', { waitUntil: 'networkidle' });
    const sports = page.getByRole('button', { name: 'Sports', exact: true });
    await expect(sports).toHaveAttribute('aria-pressed', 'false');
    await sports.focus();
    await page.keyboard.press('Space');
    await expect(sports).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Selected: Music, Sports, Travel, Tech')).toBeVisible();
});

test('a plain chip is not a tab stop; a removable one is its × only, named after it', async ({ page }) => {
    await page.goto('/components/pdx-chip', { waitUntil: 'networkidle' });
    const plainStops = await page.locator('pdx-chip:not([selectable]):not([removable]) [tabindex="0"]').count();
    expect(plainStops, 'plain chips with a tab stop').toBe(0);
    await expect(page.getByRole('button', { name: 'Remove React' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
});

test('removing a tag from the keyboard moves focus to the next ×', async ({ page }) => {
    await page.goto('/components/pdx-chip', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Remove Vue' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Remove Vue' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove Angular' })).toBeFocused();
});

test('the avatar and team chips remove for real', async ({ page }) => {
    await page.goto('/components/pdx-chip', { waitUntil: 'networkidle' });
    const before = await page.getByRole('button', { name: 'Remove Jane Doe' }).count();
    expect(before, 'Jane Doe in the avatar row and the team card').toBe(2);
    await page.getByRole('button', { name: 'Remove Jane Doe' }).first().click();
    await expect(page.getByRole('button', { name: 'Remove Jane Doe' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Remove Mary Kim' }).click();
    await expect(page.getByRole('button', { name: 'Remove Mary Kim' })).toHaveCount(0);
});
