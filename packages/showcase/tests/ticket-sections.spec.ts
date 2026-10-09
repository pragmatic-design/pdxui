/**
 * The ticket detail's section menu commands its body.
 *
 * The menu decides what the body shows: the attachments are an entry, not always on screen; History
 * is not a toggle that appends its chart under them; an intervention or the billing does not land
 * under both; and on open, the section on screen is the entry that is current.
 *
 * The rule, the one the customer and employee details keep: exactly one entry is current,
 * and the body shows that entry and nothing else.
 */
import { test, expect, type Page } from './fixture';

const menu = (page: Page) => page.locator('[data-test="detail-menu"]');
/** Every entry the menu marks as the one the visitor is on. */
const current = (page: Page) => menu(page).locator('[aria-current]:not([aria-current="false"])');
const attachments = (page: Page) => page.locator('[data-test="attachments"]');
const history = (page: Page) => page.locator('[data-test="history"]');
const intervention = (page: Page) => page.locator('[data-test="ticket"] [data-test="intervention"]');

async function open(page: Page, path: string): Promise<void> {
    await page.goto(path);
    await expect(page.locator('[data-test="ticket"] h1')).toBeVisible();
}

test('the ticket opens on its attachments, and the menu says so', async ({ page }) => {
    await open(page, '/tickets/1');
    await expect(current(page), 'the body shows a section the menu does not mark').toHaveCount(1);
    await expect(current(page)).toHaveText(/Attachments/);
    await expect(attachments(page)).toBeVisible();
    await expect(history(page)).toBeHidden();
});

test('History replaces the attachments, it is not appended under them', async ({ page }) => {
    await open(page, '/tickets/1');
    await menu(page).locator('[data-test="tab-history"]').click();
    await expect(history(page)).toBeVisible();
    await expect(attachments(page), 'the attachments stayed under the history').toBeHidden();
    await expect(current(page)).toHaveCount(1);
    await expect(current(page)).toHaveText(/History/);
});

test('an intervention is the whole body, and the only entry that is current', async ({ page }) => {
    await open(page, '/tickets/1/interventions/2');
    await expect(intervention(page).locator('h2')).toHaveText('Intervention 2');
    await expect(attachments(page), 'the attachments stayed on screen under a child route').toBeHidden();
    await expect(history(page)).toBeHidden();
    await expect(current(page)).toHaveCount(1);
    await expect(current(page)).toHaveText(/Intervention 2/);
});

test('from an intervention, Attachments goes back to the ticket and shows only them', async ({ page }) => {
    await open(page, '/tickets/1/interventions/2');
    await menu(page).locator('[data-test="tab-attachments"]').click();
    await expect(page).toHaveURL(/\/tickets\/1$/);
    await expect(attachments(page)).toBeVisible();
    await expect(intervention(page), 'the child route stayed in the body').toHaveCount(0);
    await expect(current(page)).toHaveCount(1);
    await expect(current(page)).toHaveText(/Attachments/);
});
