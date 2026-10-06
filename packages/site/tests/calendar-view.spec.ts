/**
 * pdx-calendar on its gallery page, measured in Chromium: the range demos open on their June range,
 * not an empty month; the two-month demo stacks each title above its grid, not beside it; and a day
 * cell is named by its full date, not "15".
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/components/pdx-calendar', { waitUntil: 'networkidle' });
});

test('the range demo opens on its range, June 2026', async ({ page }) => {
    const cal = page.locator('pdx-calendar[mode="range"]').first();
    await expect(cal.getByRole('grid').first()).toHaveAccessibleName('June 2026');
    await expect(cal.locator('.pdx-cal-in-range, .pdx-cal-range-start, .pdx-cal-range-end')).toHaveCount(9);
});

test('the two-month demo puts each title above its grid, and names the span', async ({ page }) => {
    const cal = page.locator('pdx-calendar[numberofmonths="2"]');
    await expect(cal.locator('.pdx-cal-title')).toHaveText(/June\s.\sJuly 2026/);
    const months = cal.locator('.pdx-cal-month');
    await expect(months).toHaveCount(2);
    for (const i of [0, 1]) {
        const title = (await months.nth(i).locator('.pdx-cal-sub-header').boundingBox())!;
        const grid = (await months.nth(i).getByRole('grid').boundingBox())!;
        expect(title.y + title.height).toBeLessThanOrEqual(grid.y + 1);
    }
    const [g1, g2] = [(await months.nth(0).getByRole('grid').boundingBox())!, (await months.nth(1).getByRole('grid').boundingBox())!];
    expect(g1.x + g1.width).toBeLessThanOrEqual(g2.x + 1);
});

test('a day cell is named by its full date, and the root is not an application', async ({ page }) => {
    const cal = page.locator('pdx-calendar[mode="range"]').first();
    await expect(cal.getByRole('gridcell', { name: /June 15, 2026|15 June 2026/ })).toHaveText('15');
    await expect(cal.locator('[role="application"]')).toHaveCount(0);
    await expect(cal.getByRole('group', { name: 'Calendar' })).toHaveCount(1);
});
