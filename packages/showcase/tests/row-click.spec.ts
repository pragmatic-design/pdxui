/**
 * A click on a row opens the record.
 *
 * The row's eye button opens the drawer, and the row itself opens the same drawer: a row that does
 * nothing on a click opens no side detail and no page detail.
 *
 * The two controls are the point of this file as much as the first row: a row click that fires for
 * EVERY click in the row would pass it, and would also open a drawer on top of a selection or a menu.
 */
import { test, expect, type Page } from './fixture';

const dataRows = (page: Page) => page.locator('[data-test="grid"] [role="row"]').filter({ has: page.locator('[role="gridcell"]') });
const drawer = (page: Page) => page.getByRole('dialog', { name: 'Edit' });

async function openTickets(page: Page): Promise<void> {
    await page.goto('/tickets');
    await expect(page.locator('[data-test="tickets"]')).toBeVisible();
    await expect(dataRows(page).first()).toBeVisible();
}

test('a click on a plain cell opens that record in the drawer', async ({ page }) => {
    await openTickets(page);
    const before = page.url();

    await dataRows(page).first().getByRole('gridcell', { name: 'Northwind' }).click();

    await expect(drawer(page), 'the row click opened nothing').toBeVisible();
    await expect(drawer(page).locator('input[name="customer"]'), 'the drawer opened on another record').toHaveValue('Northwind Traders');
    expect(page.url(), 'the row navigated away from the list').toBe(before);
    // Opening is not selecting, for the row as for the eye.
    await expect(page.locator('[data-test="bulk"]'), 'the row click selected the row').toBeHidden();
});

test('the row says it can be clicked', async ({ page }) => {
    await openTickets(page);
    const cursor = await dataRows(page).first().getByRole('gridcell', { name: 'Northwind' })
        .evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor, 'a clickable row looks like text').toBe('pointer');
});

test('control — the selection checkbox selects, and opens nothing', async ({ page }) => {
    await openTickets(page);
    await dataRows(page).first().locator('input[type="checkbox"]').check();

    await expect(page.locator('[data-test="bulk"]')).toBeVisible();
    await expect(drawer(page), 'ticking the checkbox opened the drawer').toBeHidden();
});

test('control — the row menu opens its menu, and no drawer', async ({ page }) => {
    await openTickets(page);
    await dataRows(page).first().getByRole('button', { name: /actions/i }).click();

    await expect(page.getByRole('menu'), 'the row menu did not open').toBeVisible();
    await expect(drawer(page), 'opening the row menu opened the drawer too').toBeHidden();
});
