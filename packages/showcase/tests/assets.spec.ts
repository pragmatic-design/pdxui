/**
 * Assets: what a ticket is opened on.
 *
 * In a service desk a ticket is opened ON something — a printer, a scanner, a laptop — that a
 * customer owns, not on the customer alone.
 *
 * The seed is arithmetic, so the expectations here are derived, not observed:
 * - 40 assets; the first 25 are each of the five kinds for the customers 1…5, in the order
 *   printer, scanner, laptop, network, phone — asset id = (customer − 1) × 5 + kind + 1;
 * - a ticket's asset is its customer's asset of the kind its subject names. Tailspin (customer 5)
 *   has two laptop tickets, T-1004 («Laptop fan runs constantly») and T-1034 («New starter needs
 *   a laptop»), so its laptop, asset 23, has exactly those two;
 * - «Shared mailbox is read-only» names no kind, and T-1003 carries it: no asset.
 */
import { test, expect, type Page } from './fixture';
import { clearAllButSession } from './session';

const rows = (page: Page) => page.locator('[data-test="grid"] [role="row"]').filter({ has: page.locator('[role="gridcell"]') });

async function openList(page: Page): Promise<void> {
    await page.goto('/assets');
    await expect(page.locator('[data-test="assets"]')).toBeVisible();
    await expect(rows(page).first()).toBeVisible();
}

async function openAsset(page: Page, id: number): Promise<void> {
    await page.goto(`/assets/${id}`);
    await expect(page.locator('[data-test="asset"]')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearAllButSession(page);
});

test('the catalogue opens the assets, and the list counts the seed\'s forty', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-test="side-all"]').click();
    await page.locator('[data-test="catalog"] [data-test="cat-assets"]').click();
    await expect(page).toHaveURL(/\/assets$/);
    await expect(page.locator('[data-test="total"]')).toHaveText('40 assets');
    await expect(page.locator('[data-test="list-header"] [data-test="view-picker"]')).toBeVisible();
});

test('a row reads as words: the kind is a label, the customer and the site are names', async ({ page }) => {
    await openList(page);
    const first = rows(page).first();
    await expect(first.locator('[data-field="kind"]')).toHaveText('Printer');
    await expect(first.locator('[data-field="customer"]')).toHaveText('Northwind Traders');
    await expect(first.locator('[data-field="site"]')).toHaveText('Verona Nord');
    await expect(first.locator('[data-field="status"]')).toHaveText('In service');
});

test('a warranty that has ended is marked, in words as well as in colour; one still running is not', async ({ page }) => {
    await openList(page);
    const cells = page.locator('[data-test="grid"] [role="gridcell"][data-field="warrantyEnds"]');
    const ended = cells.and(page.locator('.warranty-ended'));
    await expect(ended.first()).toBeVisible();
    await expect(ended.first()).toContainText('ended');
    const colour = await ended.first().evaluate((el) => getComputedStyle(el).color);
    const plain = cells.and(page.locator(':not(.warranty-ended)'));
    await expect(plain.first(), 'control: every warranty was marked ended').toBeVisible();
    await expect(plain.first()).not.toContainText('ended');
    expect(await plain.first().evaluate((el) => getComputedStyle(el).color), 'the mark has no colour of its own').not.toBe(colour);
});

test('an asset\'s Tickets are exactly the tickets opened on it, newest first', async ({ page }) => {
    await openAsset(page, 23);
    await page.locator('[data-test="section-tickets"]').click();
    await expect(page.locator('[data-test="tickets"] [data-test="asset-ticket"]')).toHaveText([/T-1034/, /T-1004/]);
    await page.locator('[data-test="tickets"] [data-test="asset-ticket"]').first().click();
    await expect(page).toHaveURL(/\/tickets\/35$/);
});

test('the ticket links to its asset', async ({ page }) => {
    await page.goto('/tickets/5');
    const link = page.locator('[data-test="ticket-asset"]');
    await expect(link).toContainText('Lenovo ThinkPad T14');
    await link.click();
    await expect(page).toHaveURL(/\/assets\/23$/);
    await expect(page.locator('[data-test="asset"] h1')).toContainText('Lenovo ThinkPad T14');
});

test('control — a ticket without an asset shows no link, and no error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/tickets/4');
    await expect(page.locator('[data-test="ticket"] h1')).toBeVisible();
    await expect(page.locator('[data-test="ticket-asset"]')).toHaveCount(0);
    expect(errors).toEqual([]);
});

test('the picker in a new ticket offers only the chosen customer\'s assets, and the ticket keeps the one picked', async ({ page }) => {
    await page.goto('/tickets');
    await page.locator('[data-test="new"] button').click();
    const dialog = page.locator('[data-test="create-dialog"] .pdx-dialog-panel');
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="subject"]').fill('Toner light stays on');
    // Adventure Works is customer 4: its five assets are 16…20, on the list's first page.
    await dialog.locator('input[name="customer"]').fill('Adventure');

    const picker = dialog.locator('[data-test="asset-picker"]');
    const offered = picker.locator('[role="row"]').filter({ has: page.locator('[role="gridcell"]') });
    await expect(offered).toHaveCount(5);
    for (const name of await offered.locator('[data-field="customer"]').allInnerTexts()) expect(name).toBe('Adventure Works');

    await offered.first().locator('input[type="checkbox"]').check();
    await picker.getByRole('button', { name: /add/i }).click();
    await expect(dialog.locator('[data-test="asset-picked"]')).toContainText('HP LaserJet M404');
    await dialog.getByRole('button', { name: /^create$/i }).click();
    await expect(dialog).toBeHidden();

    // The ticket carries the asset: the asset's Tickets has it on top, newest first. Reached inside
    // the app — a page load would start the simulated server again, without the new ticket.
    await page.locator('[data-test="side-all"]').click();
    await page.locator('[data-test="catalog"] [data-test="cat-assets"]').click();
    await rows(page).filter({ hasText: 'PRN-4016' }).locator('[role="gridcell"]').first().click();
    await page.locator('[data-test="section-tickets"]').click();
    await expect(page.locator('[data-test="tickets"] [data-test="asset-ticket"]').first()).toContainText('Toner light stays on');
});

test('the intake offers the picked customer\'s assets, and the one picked reaches the server', async ({ page }) => {
    await page.goto('/intake');
    await expect(page.locator('[data-test="wizard"] .pdx-stepper')).toBeVisible();
    const assetRows = page.locator('[data-test="asset-picker"] [role="row"]').filter({ has: page.locator('[role="gridcell"]') });
    await expect(assetRows, 'the asset picker offers something before a customer is picked').toHaveCount(0);

    const customers = page.locator('[data-test="customer-picker"]');
    await customers.locator('[role="row"]:not(.pdx-dg-filter-row)').filter({ has: page.locator('[role="gridcell"]') })
        .first().locator('input[type="checkbox"]').check();
    await customers.locator('pdx-button[variant="primary"] button').click();
    await expect(page.locator('[data-test="customer-picked"]')).toHaveText('Northwind Traders');

    await expect(assetRows).toHaveCount(5);
    for (const name of await assetRows.locator('[data-field="customer"]').allInnerTexts()) expect(name).toBe('Northwind Traders');
    // Asked by the customer's id, not by a piece of its name: on screen the two agree.
    expect(await page.evaluate(() => window.__pdxLastAssetRequest?.filter)).toEqual([{ field: 'customerId', value: '1' }]);
    await assetRows.first().locator('input[type="checkbox"]').check();
    await page.locator('[data-test="asset-picker"] pdx-button[variant="primary"] button').click();
    await expect(page.locator('[data-test="asset-picked"]')).toContainText('HP LaserJet M404');

    // Through to the server, as the intake's own spec walks it.
    const fill = async (test: string, value: string) => {
        await page.locator(`[data-test="${test}"] input:not([type="hidden"])`).fill(value);
        await page.locator(`[data-test="${test}"] input:not([type="hidden"])`).blur();
    };
    await fill('requester', 'Anna Bianchi');
    await fill('email', 'anna@example.com');
    await page.locator('[data-wizard-next]').click();
    await fill('starts', '2026-10-10');
    await fill('ends', '2026-10-12');
    await page.locator('[data-wizard-next]').click();
    await page.locator('[data-wizard-next]').click();
    await fill('po', 'PO-7001');
    await page.locator('[data-test="submit"] button').click();
    await expect(page.locator('[data-test="submitted"]')).toBeVisible();
    expect(await page.evaluate(() => (globalThis as unknown as { __pdxLastIntake?: { intake?: { assetId?: number } } })
        .__pdxLastIntake?.intake?.assetId)).toBe(1);
});

test('control — before a customer is named, the picker offers nothing', async ({ page }) => {
    await page.goto('/tickets');
    await page.locator('[data-test="new"] button').click();
    const dialog = page.locator('[data-test="create-dialog"] .pdx-dialog-panel');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-test="asset-picker"] [role="gridcell"]')).toHaveCount(0);
});

// ─── New ─────────────────────────────────────────────────────────

test('New creates an asset for a customer, opens it, and the list counts one more', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await openList(page);
    await page.locator('[data-test="new"] button').click();
    const dialog = page.locator('[data-test="create-dialog"] .pdx-dialog-panel');
    await expect(dialog).toBeVisible();
    await dialog.locator('[data-test="new-name"] input:not([type="hidden"])').fill('Brother HL-L2350');
    await dialog.locator('[data-test="new-serial"] input:not([type="hidden"])').fill('PRN-9001');
    await dialog.locator('[data-test="new-kind"] [role="combobox"]').click();
    await page.getByRole('option', { name: 'Printer' }).click();
    // The owner, from its own paged source, as the intake picks one.
    const customers = dialog.locator('[data-test="new-customer"]');
    await customers.locator('[role="row"]').filter({ hasText: 'Contoso Manufacturing' }).locator('input[type="checkbox"]').check();
    await customers.locator('pdx-button[variant="primary"] button').click();
    await expect(dialog.locator('[data-test="new-customer-picked"]')).toContainText('Contoso Manufacturing');
    await dialog.locator('[data-test="create"] button').click();

    await expect(page).toHaveURL(/\/assets\/41$/);
    await expect(page.locator('[data-test="asset"] h1')).toHaveText('Brother HL-L2350');
    await page.locator('[data-test="crumbs"] a', { hasText: 'Assets' }).click();
    await expect(page.locator('[data-test="total"]')).toHaveText('41 assets');
    expect(errors, 'the page threw').toEqual([]);
    // Past the first page: found by the list's search, as a reader would.
    await page.locator('[data-test="grid"] [data-grid-search]').fill('PRN-9001');
    await expect(rows(page).filter({ hasText: 'PRN-9001' }).locator('[data-field="customer"]')).toHaveText('Contoso Manufacturing');
});

test('New refuses an asset without its customer, or a warranty that ends before it was installed', async ({ page }) => {
    await openList(page);
    await page.locator('[data-test="new"] button').click();
    const dialog = page.locator('[data-test="create-dialog"] .pdx-dialog-panel');
    await dialog.locator('[data-test="new-name"] input:not([type="hidden"])').fill('Brother HL-L2350');
    await dialog.locator('[data-test="new-serial"] input:not([type="hidden"])').fill('PRN-9002');
    await dialog.locator('[data-test="new-installed"] input:not([type="hidden"])').fill('2026-05-01');
    await dialog.locator('[data-test="new-warrantyEnds"] input:not([type="hidden"])').fill('2026-04-01');
    await dialog.locator('[data-test="create"] button').click();
    await expect(dialog, 'an asset was created with no customer').toBeVisible();
    await expect(dialog.locator('[data-test="new-customer-missing"]')).toBeVisible();
    await expect(dialog).toContainText('The warranty cannot end before the asset was installed.');

    // Control: Cancel adds nothing.
    await dialog.locator('[data-test="cancel"] button').click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-test="total"]')).toHaveText('40 assets');
});

test('Details save themselves: a renamed asset keeps its name after going away and back', async ({ page }) => {
    await openAsset(page, 2);
    await page.locator('[data-test="details"] [data-test="name"] input').fill('Zebra DS2208 — goods in');
    await expect(page.locator('[data-test="save-status"]')).toHaveText('Saved');
    await page.locator('[data-test="crumbs"] a', { hasText: 'Assets' }).click();
    await expect(rows(page).first()).toBeVisible();
    await expect(rows(page).filter({ hasText: 'Zebra DS2208 — goods in' })).toHaveCount(1);
});

test('control — there is no delete anywhere on the entity', async ({ page }) => {
    await openList(page);
    await expect(page.getByRole('button', { name: /delete|remove|archive/i })).toHaveCount(0);
    await openAsset(page, 1);
    // The Categories field's chips carry «Remove Hardware»: that takes a CATEGORY off the asset,
    // it does not delete the asset. Every other remove is still counted.
    await expect(page.locator('[data-test="categories"] button', { hasText: '×' }).first(), 'the premise: the chips are there').toBeVisible();
    await expect(page.getByRole('button', { name: /delete|remove|archive/i })
        .and(page.locator(':not([data-test="categories"] button)'))).toHaveCount(0);
});
