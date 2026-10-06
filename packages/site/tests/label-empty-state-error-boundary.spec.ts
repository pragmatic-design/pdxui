/**
 * Small accessibility checks on the site, in Chromium.
 *
 * - The labels on /components/pdx-label render no empty for="" and name their controls.
 * - pdx-empty-state's title is a heading, not plain text.
 * - The error-boundary "Component Wrapper" demo can be made to throw, and its Retry brings the
 *   widget back, not an empty boundary.
 */
import { test, expect } from '@playwright/test';

test('pdx-label: no empty for, and the labels name their controls', async ({ page }) => {
    await page.goto('/components/pdx-label', { waitUntil: 'networkidle' });
    await expect(page.locator('pdx-label label[for=""]')).toHaveCount(0);
    const tied = await page.locator('pdx-label label').evaluateAll(labels => labels.filter(l => {
        const f = l.getAttribute('for');
        return (f && document.getElementById(f)) || (l.id && document.querySelector(`[aria-labelledby~="${l.id}"]`));
    }).length);
    expect(tied).toBeGreaterThanOrEqual(10);
});

test('pdx-empty-state: the title is a heading', async ({ page }) => {
    await page.goto('/components/pdx-empty-state', { waitUntil: 'networkidle' });
    const titles = page.locator('pdx-empty-state .pdx-empty-state-title');
    expect(await titles.count()).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: 'No documents' }).first()).toBeVisible();
});

test('pdx-error-boundary: Make it throw shows the fallback, and Retry after the fix brings the widget back', async ({ page }) => {
    await page.goto('/components/pdx-error-boundary', { waitUntil: 'networkidle' });
    const boundary = page.locator('pdx-error-boundary').first();
    await expect(boundary.getByText('Dashboard widget — healthy')).toBeVisible();
    await page.getByRole('button', { name: 'Make it throw' }).click();
    const alert = boundary.getByRole('alert');
    await expect(alert).toContainText('Dashboard widget crashed.');
    await expect(alert).toContainText('Dashboard data source returned HTTP 500');

    // Retry while it is still broken fails again.
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(boundary.getByRole('alert')).toContainText('Dashboard data source returned HTTP 500');

    await page.getByRole('button', { name: 'Fix the data source' }).click();
    await boundary.getByRole('alert').getByRole('button', { name: 'Retry' }).click();
    await expect(boundary.getByRole('alert')).toHaveCount(0);
    await expect(boundary.getByText('Dashboard widget — healthy')).toBeVisible();
});
