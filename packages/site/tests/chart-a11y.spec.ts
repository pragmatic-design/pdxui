/**
 * pdx-chart's accessible layer with the real canvas engine, in Chromium: the figure is
 * described by its data, the legend is buttons, the arrow keys walk and announce the points, and a
 * gauge is named with its reading. The unit test mocks the engine; this runs it.
 */
import { test, expect } from '@playwright/test';

test('the device chart: a described figure, a legend of buttons, points announced from the keyboard', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/components/chart', { waitUntil: 'networkidle' });

    const chart = page.getByRole('figure', { name: /Traffic by Device/ });
    await expect(chart).toBeVisible();
    const describedBy = await chart.getAttribute('aria-describedby');
    const table = page.locator(`[id="${describedBy}"] table`);
    await expect(table.locator('tbody tr')).toHaveCount(4);

    const legend = chart.getByRole('group', { name: 'Legend' });
    const mobile = legend.getByRole('button', { name: 'Mobile' });
    await expect(mobile).toHaveAttribute('aria-pressed', 'true');
    await mobile.click();
    await expect(mobile).toHaveAttribute('aria-pressed', 'false');
    await expect(table.locator('thead th')).not.toContainText(['Mobile']);

    await chart.focus();
    await page.keyboard.press('ArrowRight');
    await expect(chart.locator('[aria-live="polite"]')).toContainText('Q1');
    await page.keyboard.press('Escape');
    await expect(chart.locator('[aria-live="polite"]')).toHaveText('');
    expect(errors).toEqual([]);
});

test('a gauge is named with its value and range', async ({ page }) => {
    await page.goto('/components/chart', { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Specialized' }).click();
    await expect(page.getByRole('figure', { name: /: \d+(\.\d+)?%? of \d+–\d+$/ }).first()).toBeVisible();
});
