/**
 * Contracts across employees: one list, and a built-in «Ending this month».
 *
 * Inside each employee only, «what ends this month» would mean opening twelve people. This is a
 * READ model over them — changed where it lives, in the employee.
 *
 * The seed, derived: eleven employees with two contracts each — a fixed term that ended, then a
 * permanent one — and the twelfth, a new hire, with none: 22. Elena Ricci's permanent contract ends
 * twelve days from today, so «Ending this month» has exactly one row whatever day the suite runs.
 */
import { test, expect, type Page } from '@playwright/test';
import { clearAllButSession } from './session';

const rows = (page: Page) => page.locator('[data-test="grid"] [role="row"]').filter({ has: page.locator('[role="gridcell"]') });

async function openContracts(page: Page): Promise<void> {
    await page.goto('/contracts');
    await expect(page.locator('[data-test="contracts-list"]')).toBeVisible();
    await expect(rows(page).first()).toBeVisible();
}

async function chooseView(page: Page, name: string): Promise<void> {
    await page.locator('[data-test="view-picker"] [role="combobox"]').click();
    await page.getByRole('option', { name: new RegExp(`^${name}`) }).click();
}

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearAllButSession(page);
});

test('the catalogue opens every seed contract: 22, two per employee who has any', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-test="side-all"]').click();
    await page.locator('[data-test="catalog"] [data-test="cat-contracts"]').click();
    await expect(page).toHaveURL(/\/contracts$/);
    await expect(page.locator('[data-test="total"]')).toHaveText('22 contracts');
});

test('a row reads as words: the type is a label, the state a badge', async ({ page }) => {
    await openContracts(page);
    const ada = rows(page).filter({ hasText: 'Ada Rossi' });
    await expect(ada).toHaveCount(2);
    await expect(ada.locator('[data-field="type"]')).toHaveText(['Fixed-term', 'Permanent']);
    await expect(ada.locator('[data-field="state"]')).toHaveText(['Ended', 'Open']);
});

test('«Ending this month» is there out of the box, lists exactly the contract ending soon, and cannot be deleted', async ({ page }) => {
    await openContracts(page);
    await chooseView(page, 'Ending this month');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Elena Ricci');
    await expect(rows(page).first().locator('[data-field="state"]')).toHaveText('Ending soon');
    // A built-in view is used, not managed: no Delete, no Rename.
    await page.locator('[data-test="view-menu"] button').first().click();
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeDisabled();
    await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeDisabled();
});

test('control — the default view is every contract, not the built-in one', async ({ page }) => {
    await openContracts(page);
    await expect(page.locator('[data-test="view-picker"] .pdx-select-value')).toHaveText('All contracts');
    await expect(page.locator('[data-test="total"]')).toHaveText('22 contracts');
});

test('the employee cell opens their Contracts section', async ({ page }) => {
    await openContracts(page);
    await rows(page).filter({ hasText: 'Marie Laurent' }).first().locator('[data-field="employeeName"] a').click();
    await expect(page).toHaveURL(/\/employees\/2\/contracts$/);
    await expect(page.locator('[data-test="contracts"]')).toBeVisible();
});

test('ending the employment in the employee shows the contract as ended here, after away and back', async ({ page }) => {
    await page.goto('/employees/1/personal');
    await page.getByRole('button', { name: 'End employment' }).first().click();
    const ask = page.locator('[data-test="end-employment-dialog"]');
    await ask.locator('[data-test="end-employment-date"] input:not([type="hidden"])').fill('2026-06-30');
    await ask.getByRole('button', { name: 'End employment' }).click();
    await expect(page.locator('[data-test="record-status"]')).toContainText('Not active');

    // Inside the app: a page load would start the simulated server again.
    await page.locator('[data-test="side-all"]').click();
    await page.locator('[data-test="catalog"] [data-test="cat-contracts"]').click();
    const ada = rows(page).filter({ hasText: 'Ada Rossi' });
    await expect(ada.locator('[data-field="state"]')).toHaveText(['Ended', 'Ended']);
});

test('control — a read-only list: no edit, no delete, no selection', async ({ page }) => {
    await openContracts(page);
    await expect(page.getByRole('button', { name: /edit|delete|remove|archive|new/i })).toHaveCount(0);
    await expect(page.locator('[data-test="grid"] input[type="checkbox"]')).toHaveCount(0);
});
