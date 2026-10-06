/**
 * Categories across tickets, customers and assets.
 *
 * One lookup, managed in Settings › Lookups, carried by three kinds of record as codes. Renamed once,
 * renamed everywhere; deactivated, no longer offered — and still on the records that have it, muted.
 *
 * Every step stays inside the app: the stores are in memory, and a page load starts them again.
 */
import { test, expect, type Page } from '@playwright/test';
import { pickLocale } from './locale';
import { clearAllButSession } from './session';

const rows = (page: Page) => page.locator('[data-test="grid"] [role="row"]').filter({ has: page.locator('[role="gridcell"]') });

async function toLookups(page: Page): Promise<void> {
    await page.locator('[data-test="side-all"]').click();
    await page.locator('[data-test="catalog"] [data-test="cat-settings"]').click();
    await page.locator('[data-test="tile-lookups"]').click();
    await page.locator('[data-test="set-categories"]').click();
    await expect(page.locator('[data-test="lookup-categories"]')).toBeVisible();
}

async function toList(page: Page, key: 'tickets' | 'customers'): Promise<void> {
    await page.locator('[data-test="side-all"]').click();
    await page.locator(`[data-test="catalog"] [data-test="cat-${key}"]`).click();
    await expect(rows(page).first()).toBeVisible();
}

/** The Categories field of a record's drawer, opened; what it offers. */
async function offeredInDrawer(page: Page, rowIndex = 0): Promise<{ drawer: ReturnType<Page['getByRole']>; names: string[] }> {
    await rows(page).nth(rowIndex).getByRole('button', { name: /open/i }).click();
    const drawer = page.getByRole('dialog', { name: 'Edit' });
    await expect(drawer).toBeVisible();
    await drawer.locator('pdx-select[name="categories"] [role="combobox"]').click();
    const names = (await page.getByRole('option').allTextContents()).map((n) => n.replace('✓', '').trim());
    await page.keyboard.press('Escape');
    return { drawer, names };
}

async function addSecurity(page: Page): Promise<void> {
    await toLookups(page);
    await page.locator('[data-test="category-add"] button').click();
    const dialog = page.locator('[data-test="category-dialog"] .pdx-dialog-panel');
    await expect(dialog).toBeVisible();
    await dialog.locator('[data-test="category-en"] input').fill('Security');
    await dialog.locator('[data-test="category-it"] input').fill('Sicurezza');
    await dialog.locator('[data-test="applies-tickets"] input').check();
    await dialog.locator('[data-test="category-save"] button').click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-test="lookup-categories"] [data-test="category"][data-code="security"]')).toBeVisible();
}

/** Give T-1000 the Security category through its drawer, and save. */
async function fileT1000UnderSecurity(page: Page): Promise<void> {
    await toList(page, 'tickets');
    await rows(page).first().getByRole('button', { name: /open/i }).click();
    const drawer = page.getByRole('dialog', { name: 'Edit' });
    await drawer.locator('pdx-select[name="categories"] [role="combobox"]').click();
    await page.getByRole('option', { name: /^Security/ }).click();
    await page.keyboard.press('Escape');
    await drawer.getByRole('button', { name: /save/i }).click();
    await expect(drawer).toBeHidden();
    await expect(rows(page).first().locator('[data-field="categories"]')).toContainText('Security');
}

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearAllButSession(page);
    await page.goto('/');
    await expect(page.locator('[data-test="sidebar"]')).toBeVisible();
});

test('the lists show categories as coloured badges, a badge per category', async ({ page }) => {
    await toList(page, 'tickets');
    // T-1008 is «Badge reader rejects the night shift»: Hardware and On site.
    const cell = rows(page).nth(8).locator('[data-field="categories"]');
    await expect(cell.locator('.pdx-dg-badge')).toHaveText(['Hardware', 'On site']);
    await expect(cell.locator('.pdx-dg-badge').first()).toHaveClass(/pdx-dg-badge-primary/);
});

test('filtering the tickets by «Network» shows exactly the tickets with it', async ({ page }) => {
    await toList(page, 'tickets');
    await page.locator('.pdx-dg-toolbar-chip-quick[data-field="categories"]').click();
    const popover = page.locator('.pdx-dg-filter-popover');
    await popover.getByRole('checkbox', { name: 'Network', exact: true }).check();
    await popover.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('[data-test="total"]')).toHaveText('6 matching');
    await expect(rows(page).locator('[data-field="reference"]')).toHaveText(['T-1005', 'T-1009', 'T-1017', 'T-1021', 'T-1029', 'T-1033']);
});

test('a category added for tickets is offered on a ticket, and not on a customer', async ({ page }) => {
    await addSecurity(page);
    await toList(page, 'tickets');
    expect((await offeredInDrawer(page)).names).toContain('Security');
    await page.getByRole('dialog', { name: 'Edit' }).getByRole('button', { name: /cancel/i }).click();

    await toList(page, 'customers');
    const onCustomer = (await offeredInDrawer(page)).names;
    expect(onCustomer, 'the premise: the customer field offers something').toContain('Key account');
    expect(onCustomer).not.toContain('Security');
});

test('renaming it renames the badge on the ticket that has it, in both languages', async ({ page }) => {
    await addSecurity(page);
    await fileT1000UnderSecurity(page);

    await toLookups(page);
    const row = page.locator('[data-test="lookup-categories"] [data-test="category"][data-code="security"]');
    await row.locator('[data-test="label-en"] input').fill('Cyber security');
    await row.locator('[data-test="label-en"] input').press('Enter');
    await row.locator('[data-test="label-it"] input').fill('Sicurezza informatica');
    await row.locator('[data-test="label-it"] input').press('Enter');

    await toList(page, 'tickets');
    await expect(rows(page).first().locator('[data-field="categories"]')).toContainText('Cyber security');
    await pickLocale(page, 'it');
    await expect(rows(page).first().locator('[data-field="categories"]')).toContainText('Sicurezza informatica');
});

test('a label being typed is not overwritten when the other one\'s save lands', async ({ page }) => {
    // Every write answers after 120 ms (`memory-store.ts`). The English name's save landed while the
    // Italian one was still being typed, the row was drawn again from the saved record, and the
    // Italian field took back the saved «Sicurezza» over what was typed. Enter then found nothing
    // changed, and the rename was lost — the badge read «Sicurezza» in a loaded gate, once. A reader
    // who types at a person's pace hits it every time; this row types at that pace.
    await addSecurity(page);
    await toLookups(page);
    const row = page.locator('[data-test="lookup-categories"] [data-test="category"][data-code="security"]');
    await row.locator('[data-test="label-en"] input').fill('Cyber security');
    await row.locator('[data-test="label-en"] input').press('Enter');
    const it = row.locator('[data-test="label-it"] input');
    await it.fill('Sicurezza informatica');
    // The English save lands in the meantime.
    await page.waitForTimeout(400);
    await expect(it, 'what was being typed was overwritten by the saved record').toHaveValue('Sicurezza informatica');
    await it.press('Enter');

    await toList(page, 'customers');
    await toLookups(page);
    await expect(page.locator('[data-test="lookup-categories"] [data-test="category"][data-code="security"] [data-test="label-it"] input'),
        'the Italian rename was not saved').toHaveValue('Sicurezza informatica');
});

test('deactivated, it is no longer offered, and the ticket that has it still shows it, muted', async ({ page }) => {
    await addSecurity(page);
    await fileT1000UnderSecurity(page);

    await toLookups(page);
    const row = page.locator('[data-test="lookup-categories"] [data-test="category"][data-code="security"]');
    await row.locator('[data-test="category-toggle"] button').click();
    await expect(row).toHaveAttribute('data-active', 'false');

    await toList(page, 'tickets');
    const badge = rows(page).first().locator('[data-field="categories"] .pdx-dg-badge', { hasText: 'Security' });
    await expect(badge).toBeVisible();
    await expect(badge).toHaveClass(/pdx-dg-badge-muted/);
    // Still on the record, so the drawer keeps it; not offered to another one.
    expect((await offeredInDrawer(page, 1)).names).not.toContain('Security');
});

test('control — a deactivated category comes back when reactivated', async ({ page }) => {
    await toLookups(page);
    const row = page.locator('[data-test="lookup-categories"] [data-test="category"][data-code="on-site"]');
    await row.locator('[data-test="category-toggle"] button').click();
    await expect(row).toHaveAttribute('data-active', 'false');
    await row.locator('[data-test="category-toggle"] button').click();
    await expect(row).toHaveAttribute('data-active', 'true');
    await toList(page, 'tickets');
    expect((await offeredInDrawer(page)).names).toContain('On site');
});
