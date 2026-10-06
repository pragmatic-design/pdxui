/**
 * The data-grid page as a grid, measured with getByRole in Chromium: a named grid, one tab stop that
 * the arrows and Ctrl+End move whether or not the grid is editable, a sortable header that Enter
 * sorts and aria-sort reports (not a div with a click handler), a paginated grid that counts all its
 * rows, and an empty grid that says so rather than reading "1–0 of 0" with an active page 1.
 */
import { test, expect } from '@playwright/test';

test('the arrows move the one tab stop, and Enter on a header sorts it', async ({ page }) => {
    await page.goto('/components/pdx-data-grid', { waitUntil: 'networkidle' });
    const grid = page.getByRole('grid', { name: 'Employees', exact: true });
    const name = grid.locator('[role="columnheader"][data-field="name"]');
    const sort = name.getByRole('button', { name: 'Name', exact: true });
    await expect(name).toHaveAttribute('aria-sort', 'none');
    await expect(grid.locator('[role="row"] [tabindex="0"]')).toHaveCount(1);

    await sort.focus();
    await page.keyboard.press('Enter');
    await expect(name).toHaveAttribute('aria-sort', 'ascending');
    await expect(sort, 'focus survives the header rebuild').toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(grid.getByRole('gridcell', { name: 'Alice Johnson' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(grid.getByRole('gridcell', { name: 'alice@acme.com' })).toBeFocused();
    await page.keyboard.press('Control+End');
    const lastRow = grid.getByRole('row').last();
    await expect(lastRow).toContainText('Henry Wilson');
    await expect(lastRow.getByRole('gridcell').last()).toBeFocused();
    await expect(grid.locator('[role="row"] [tabindex="0"]')).toHaveCount(1);
});

test('a paginated grid counts every row, and the second page knows where it starts', async ({ page }) => {
    await page.goto('/components/pdx-data-grid', { waitUntil: 'networkidle' });
    const grid = page.getByRole('grid', { name: 'Products' });
    await expect(grid).toHaveAttribute('aria-rowcount', '101');
    await expect(grid.getByRole('row').nth(1)).toHaveAttribute('aria-rowindex', '2');
    const host = page.locator('pdx-data-grid').filter({ has: grid });
    await host.getByRole('button', { name: 'Next page' }).click();
    await expect(grid.getByRole('row').nth(1)).toContainText('Product 11');
    await expect(grid.getByRole('row').nth(1)).toHaveAttribute('aria-rowindex', '12');
});

test('an empty grid is a status, and its pager offers no page', async ({ page }) => {
    await page.goto('/components/pdx-data-grid', { waitUntil: 'networkidle' });
    const grid = page.getByRole('grid', { name: 'Archived employees' });
    const host = page.locator('pdx-data-grid').filter({ has: grid });
    await expect(host.getByRole('status')).toContainText('No records found');
    await expect(host.locator('.pdx-pagination-info')).toHaveText('0 of 0');
    await expect(host.locator('[aria-current="page"]')).toHaveCount(0);
});
