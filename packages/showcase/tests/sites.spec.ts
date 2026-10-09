/**
 * Sites: a list and a detail of their own.
 *
 * Fourteen sites are data the employees' assignments pick from, and they have a list and a page of
 * their own. A site is closed, never
 * deleted; its detail says who works there now and which tickets were opened there.
 */
import { test, expect, type Page } from './fixture';
import { clearAllButSession } from './session';

const rows = (page: Page) => page.locator('[data-test="grid"] [role="row"]').filter({ has: page.locator('[role="gridcell"]') });

async function openList(page: Page): Promise<void> {
    await page.goto('/sites');
    await expect(page.locator('[data-test="sites"]')).toBeVisible();
    await expect(rows(page).first()).toBeVisible();
}

async function openSite(page: Page, id = 1): Promise<void> {
    await page.goto(`/sites/${id}`);
    await expect(page.locator('[data-test="site"]')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearAllButSession(page);
});

test('the catalogue opens the sites: fourteen rows, and the list header with its views', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-test="side-all"]').click();
    await page.locator('[data-test="catalog"] [data-test="cat-sites"]').click();
    await expect(page).toHaveURL(/\/sites$/);
    await expect(rows(page)).toHaveCount(14);
    await expect(page.locator('[data-test="list-header"] [data-test="view-picker"]')).toBeVisible();
});

test('the list says how many people each site has now, and whether it is open', async ({ page }) => {
    await openList(page);
    const verona = rows(page).filter({ hasText: 'Verona Nord' });
    await expect(verona.locator('[data-field="people"]')).toHaveText('3');
    await expect(verona.locator('[data-field="status"]')).toHaveText('Active');
});

test('a row opens the site, and its People are exactly the ones assigned there — the list\'s count', async ({ page }) => {
    await openList(page);
    const count = Number(await rows(page).filter({ hasText: 'Milano Centrale' }).locator('[data-field="people"]').innerText());
    await rows(page).filter({ hasText: 'Milano Centrale' }).locator('[role="gridcell"]').first().click();
    await expect(page).toHaveURL(/\/sites\/3$/);
    await expect(page.locator('h1')).toHaveText('Milano Centrale');

    await page.locator('[data-test="section-people"]').click();
    const people = page.locator('[data-test="people"] [data-test="person"]');
    await expect(people).toHaveCount(count);
    expect(count, 'the premise: someone works there').toBeGreaterThan(0);
    // Each one is a way to their record.
    await people.first().click();
    await expect(page).toHaveURL(/\/employees\/\d+\/personal$/);
});

test('control — a site nobody is assigned to says so, and lists no one', async ({ page }) => {
    await openSite(page, 14);
    await page.locator('[data-test="section-people"]').click();
    await expect(page.locator('[data-test="people"] [data-test="person"]')).toHaveCount(0);
    await expect(page.locator('[data-test="people"] [data-test="no-people"]')).toBeVisible();
});

test('Tickets lists the tickets opened at the site, each a way to it', async ({ page }) => {
    await openSite(page, 1);
    await page.locator('[data-test="section-tickets"]').click();
    const tickets = page.locator('[data-test="tickets"] [data-test="site-ticket"]');
    await expect(tickets).toHaveText([/T-1000/, /T-1028/]);
    await tickets.first().click();
    await expect(page).toHaveURL(/\/tickets\/1$/);
});

test('Details save themselves: a new phone is there after going away and back', async ({ page }) => {
    await openSite(page, 2);
    const phone = page.locator('[data-test="details"] [data-test="phone"] input');
    await phone.fill('045 9990001');
    await expect(page.locator('[data-test="save-status"]')).toHaveText('Saved');
    // Away and back inside the app: a page load would start the simulated server again.
    await page.locator('[data-test="crumbs"] a', { hasText: 'Sites' }).click();
    await expect(rows(page).first()).toBeVisible();
    await rows(page).filter({ hasText: 'Verona Sud' }).locator('[role="gridcell"]').first().click();
    await expect(page.locator('[data-test="site"]')).toBeVisible();
    await expect(phone).toHaveValue('045 9990001');
});

test('control — a site with no name is refused on its field, and not saved', async ({ page }) => {
    await openSite(page, 2);
    await page.locator('[data-test="details"] [data-test="name"] input').fill('');
    await expect(page.locator('[data-test="save-status"]')).toHaveText('Not saved');
    await page.locator('[data-test="crumbs"] a', { hasText: 'Sites' }).click();
    await expect(rows(page).filter({ hasText: 'Verona Sud' }), 'the refused name reached the store').toHaveCount(1);
});

test('the list\'s views are its own: one saved on /sites is not offered on /customers', async ({ page }) => {
    await openList(page);
    await page.locator('[data-test="view-menu"] button').first().click();
    await page.getByRole('menuitem', { name: 'Save as…', exact: true }).click();
    const dialog = page.locator('[data-test="view-name-dialog"] .pdx-dialog-panel');
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Sites only');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();

    // The chosen view's option carries a ✓ after its name.
    await page.locator('[data-test="view-picker"] [role="combobox"]').click();
    await expect(page.getByRole('option', { name: /^Sites only/ })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto('/customers');
    await expect(page.locator('[data-test="customers"]')).toBeVisible();
    await page.locator('[data-test="view-picker"] [role="combobox"]').click();
    await expect(page.getByRole('option').first(), 'the customers picker did not open').toBeVisible();
    await expect(page.getByRole('option', { name: /^Sites only/ })).toHaveCount(0);
});

test('New opens a modal: a name and a city, and the site is in the list', async ({ page }) => {
    await openList(page);
    await page.locator('[data-test="new"] button').click();
    const dialog = page.locator('[data-test="create-dialog"] .pdx-dialog-panel');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: /Name/ }).fill('Venezia Mestre');
    await dialog.getByRole('textbox', { name: /City/ }).fill('Venezia');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-test="total"]')).toHaveText('15 sites');
});

test('control — there is no delete anywhere on the entity', async ({ page }) => {
    await openList(page);
    await expect(page.getByRole('button', { name: /delete|remove|archive/i })).toHaveCount(0);
    await openSite(page, 1);
    await expect(page.getByRole('button', { name: /delete|remove|archive/i })).toHaveCount(0);
});
