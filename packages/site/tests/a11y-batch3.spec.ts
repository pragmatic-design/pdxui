/**
 * Small accessibility checks on the site, measured in Chromium.
 *
 * Pagination keeps focus on every page change instead of dropping it to <body>; the OTP/PIN cells
 * are a group; the page header demo puts no more h1s on a page that has its own.
 */
import { test, expect } from '@playwright/test';

test('pagination: paging from the keyboard keeps focus on Next', async ({ page }) => {
    await page.goto('/components/pdx-pagination', { waitUntil: 'networkidle' });
    const pager = page.locator('pdx-pagination').first();
    const next = pager.getByRole('button', { name: 'Next page' });
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(pager.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    await expect(next).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(pager.getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-current', 'page');
    await expect(next).toBeFocused();
});

test('OTP and PIN: the cells are a named group', async ({ page }) => {
    await page.goto('/components/pdx-otp-input', { waitUntil: 'networkidle' });
    const group = page.getByRole('group', { name: 'Verification code' }).first();
    await expect(group.getByRole('textbox').first()).toHaveAccessibleName(/^Digit 1 of \d$/);

    // The masked PIN entry is the same page's `mask` section (#286). Its form field's label names the
    // group, over the «PIN» default (measured without a field in responsive's otp-input-mask.spec.ts).
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Masked PIN' }) });
    const pin = section.getByRole('group', { name: '4-digit PIN', exact: true });
    await expect(pin.locator('input').first()).toHaveAttribute('autocomplete', 'off');
    await expect(pin.locator('input').first()).toHaveAttribute('type', 'password');
});

test('page header: the examples are h3s under the page sections, not more h1s', async ({ page }) => {
    await page.goto('/components/pdx-page-header', { waitUntil: 'networkidle' });
    await expect(page.locator('pdx-page-header h3')).toHaveCount(2);
    await expect(page.locator('pdx-page-header h1')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Patients', level: 3 })).toBeVisible();
});
