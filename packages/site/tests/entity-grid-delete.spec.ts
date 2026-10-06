/**
 * pdx-entity-grid on the site, measured in Chromium.
 *
 * A click on a row's trash asks before it removes the record: without a confirmation there is no
 * undo, and a second click meant for one deletes a second row. Each row's buttons are named after
 * the row, not just "Edit" and "Delete", and the actions column has no filter button.
 */
import { test, expect } from '@playwright/test';

test('Delete asks first, names the row, and Escape keeps it', async ({ page }) => {
    await page.goto('/components/pdx-entity-grid', { waitUntil: 'networkidle' });
    const grid = page.locator('pdx-entity-grid').first();
    const del = grid.getByRole('button', { name: 'Delete Alice Johnson' });
    await expect(grid.getByRole('button', { name: 'Edit Alice Johnson' })).toBeVisible();
    await expect(grid.getByRole('button', { name: /^Filter/ })).toHaveCount(2);   // Name, Role — not the actions

    await del.click();
    const dialog = page.getByRole('alertdialog', { name: 'Delete Alice Johnson?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(del).toBeVisible();
    // The demo's event log: "#1 pdx-delete {…}" per event.
    const deleteEvents = page.getByText(/^#\d+ pdx-delete/);
    await expect(deleteEvents).toHaveCount(0);

    await del.click();
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(grid.getByRole('button', { name: 'Delete Alice Johnson' })).toHaveCount(0);
    await expect(grid.getByRole('button', { name: /^Delete / })).toHaveCount(2);
    await expect(deleteEvents).toHaveCount(1);
    await expect(deleteEvents).toContainText('"ids":[1]');
});
