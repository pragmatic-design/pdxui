/**
 * A component prop named `title` leaves no title attribute on the host, measured on
 * the built site in Chromium.
 *
 * The prop reads `title="Revenue"`; if the attribute stayed, it would be a native tooltip over the
 * whole statistic card and the whole entity grid, repeating the heading wherever the pointer went.
 */
import { test, expect } from '@playwright/test';

test('no pdx-statistic keeps a title attribute, and the cards still show their titles', async ({ page }) => {
    await page.goto('/components/pdx-statistic', { waitUntil: 'networkidle' });
    const cards = page.locator('pdx-statistic');
    await expect(cards.first()).toContainText('Revenue');
    expect(await cards.count(), 'no statistic on the page: the check measures nothing').toBeGreaterThan(20);
    await expect(page.locator('pdx-statistic[title]')).toHaveCount(0);
});

test('the entity grid keeps no title attribute, and still shows its title', async ({ page }) => {
    await page.goto('/components/pdx-entity-grid', { waitUntil: 'networkidle' });
    const grid = page.locator('pdx-entity-grid').first();
    await expect(grid).toBeVisible();
    await expect(page.locator('pdx-entity-grid[title]')).toHaveCount(0);
    await expect(grid).toContainText('Team');
});
