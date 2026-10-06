// What a person reads is words and dates, not the stored codes.
//
// No «standard», «active», «onboarding» or «IT» where a word belongs, no ISO date beside the
// tickets' «1 set 2026», and no «1 schede» on the board. Every row here is read in Italian, where a
// raw code and an English word are both visible for what they are.
import { test, expect, type Page } from '@playwright/test';
import { pickLocale } from './locale';

async function openInItalian(page: Page, path: string, ready: string): Promise<void> {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    await pickLocale(page, 'it');
    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
    await expect(page.locator(ready).first()).toBeVisible();
}

const rows = (page: Page) => page.locator('[data-test="grid"] .pdx-dg-body [role="row"]');
/** The cells of one column, by its header text. */
async function column(page: Page, header: string): Promise<string[]> {
    const headers = await page.locator('[data-test="grid"] [role="columnheader"]').allInnerTexts();
    const index = headers.findIndex((h) => h.trim() === header);
    expect(index, `no column «${header}» among ${headers.join(' | ')}`).toBeGreaterThanOrEqual(0);
    return rows(page).evaluateAll((els, i) => els.map((r) => (r.querySelectorAll('[role="gridcell"]')[i]?.textContent ?? '').trim()), index);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** The tickets' format, `$d(…, { dateStyle: 'medium' })` in Italian: «1 set 2026». */
const MEDIUM_IT = /^\d{1,2} [a-z]{3} \d{4}$/;

test('customers: tier and status are words, status is a badge, and «since» is a date a person reads', async ({ page }) => {
    await openInItalian(page, '/customers', '[data-test="grid"] .pdx-dg-body [role="row"]');
    const tiers = await column(page, 'Fascia');
    expect(tiers.filter((t) => ['standard', 'business', 'enterprise'].includes(t)), 'a tier is the stored code').toEqual([]);
    const statuses = await column(page, 'Stato');
    expect(statuses.filter((s) => ['active', 'onboarding', 'closed'].includes(s)), 'a status is the stored code').toEqual([]);
    await expect(rows(page).first().locator('.pdx-dg-badge'), 'the status is not a badge').toHaveCount(1);
    const since = await column(page, 'Cliente dal');
    expect(since.filter((d) => ISO.test(d)), 'a date is ISO').toEqual([]);
    expect(since.every((d) => MEDIUM_IT.test(d)), `not the tickets' format: ${since.join(', ')}`).toBe(true);
});

test('a customer\'s facts read the same way', async ({ page }) => {
    await openInItalian(page, '/customers/1', '[data-test="fact-tier"]');
    await expect(page.locator('[data-test="fact-tier"]')).not.toHaveText(/^(standard|business|enterprise)$/);
    await expect(page.locator('[data-test="fact-status"]')).not.toHaveText(/^(active|onboarding|closed)$/);
    await expect(page.locator('[data-test="fact-since"]')).toHaveText(MEDIUM_IT);
});

test('employees: the country is named in the page\'s language, and «hired» is a date a person reads', async ({ page }) => {
    await openInItalian(page, '/employees', '[data-test="grid"] .pdx-dg-body [role="row"]');
    const countries = await column(page, 'Paese');
    expect(countries.filter((c) => /^[A-Z]{2}$/.test(c)), 'a country is its ISO code').toEqual([]);
    expect(countries, 'Italy is not named in Italian').toContain('Italia');
    const hired = await column(page, 'Assunto il');
    expect(hired.every((d) => MEDIUM_IT.test(d)), `not the tickets' format: ${hired.join(', ')}`).toBe(true);
});

test('control — the tickets\' dates are the format the others now follow', async ({ page }) => {
    await openInItalian(page, '/tickets', '[data-test="grid"] .pdx-dg-body [role="row"]');
    const opened = await column(page, 'Aperto il');
    expect(opened.every((d) => MEDIUM_IT.test(d)), opened.join(', ')).toBe(true);
});

test('board: a column with one card says «1 scheda»', async ({ page }) => {
    await openInItalian(page, '/board', '[data-test="board"]');
    // The board shows every ticket of the list, and no column starts with one card:
    // the rest of Closed is moved to Waiting from the keyboard — lift, one column left, drop.
    const closed = page.locator('[data-test="column-closed"] .card');
    while (await closed.count() > 1) {
        const ref = (await closed.first().getAttribute('data-test'))!;
        const grab = page.locator(`[data-test="${ref}"] [data-test="grab"]`);
        await grab.press(' ');
        await grab.press('ArrowLeft');
        await expect(page.locator(`[data-test="column-waiting"] [data-test="${ref}"]`)).toBeVisible();
        await page.locator(`[data-test="${ref}"] [data-test="grab"]`).press(' ');
    }

    const count = (s: string) => page.locator(`[data-test="column-${s}"] > span.pdx-txt-small`).innerText();
    expect((await count('closed')).trim(), 'one card is not «1 scheda»').toBe('1 scheda');
    // Control: the column that received them is plural, so the singular above is not the only form.
    expect((await count('waiting')).trim()).toMatch(/^\d+ schede$/);
});
