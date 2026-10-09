/**
 * Services: what customers subscribe to, with an SLA the ticket shows.
 *
 * A customer's tier is not enough: a service desk sells SERVICES, each with an answer time, and a
 * customer subscribes to some of them; the ticket's answer time follows from the subscription.
 *
 * The seed is arithmetic (`service-seed.ts`), so the expectations are derived, not observed:
 * - six services; «On-site legacy» (6) is the one inactive;
 * - customer c subscribes to (c % 5) + 1, to ((c + 2) % 5) + 1 when c is even, and to 6 when c is
 *   a multiple of three — so Network support (2) has the customers 1, 4, 6, 11, 14, 16, 21, 24;
 * - customer 4, Adventure Works, has Service desk (12 h, covers every kind) and Network support
 *   (2 h, covers the network). T-1008 is opened on its scanner: the covering subscription answers,
 *   12 h. T-1003 names no asset: the customer's shortest answers, 2 h.
 */
import { test, expect, type Page } from './fixture';
import { pickLocale } from './locale';
import { CUSTOMER_NAMES } from '../src/data/customer-seed';
import { clearAllButSession } from './session';

const rows = (page: Page) => page.locator('[data-test="grid"] [role="row"]').filter({ has: page.locator('[role="gridcell"]') });
const nameOf = (id: number) => CUSTOMER_NAMES[id - 1];

async function openFromCatalog(page: Page, key: string): Promise<void> {
    await page.locator('[data-test="side-all"]').click();
    await page.locator(`[data-test="catalog"] [data-test="cat-${key}"]`).click();
}

/** A service's detail, reached inside the app: a page load would start the simulated server again. */
async function openService(page: Page, name: string): Promise<void> {
    await openFromCatalog(page, 'services');
    await rows(page).filter({ hasText: name }).locator('[role="gridcell"]').first().click();
    await expect(page.locator('[data-test="service"]')).toBeVisible();
    await page.locator('[data-test="section-customers"]').click();
}

const subscribers = (page: Page) => page.locator('[data-test="service-customers"] [data-test="service-customer"]');

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearAllButSession(page);
});

test('the catalogue opens the services: six, the SLA in hours, the price in the page\'s locale', async ({ page }) => {
    await page.goto('/');
    await openFromCatalog(page, 'services');
    await expect(page).toHaveURL(/\/services$/);
    await expect(page.locator('[data-test="total"]')).toHaveText('6 services');

    const printer = rows(page).filter({ hasText: 'Printer care' });
    await expect(printer.locator('[data-field="slaHours"]')).toHaveText('4 h');
    await expect(printer.locator('[data-field="resolveHours"]')).toHaveText('24 h');
    await expect(printer.locator('[data-field="customers"]')).toHaveText('6');
    await expect(printer.locator('[data-field="active"]')).toHaveText('Active');
    const price = (locale: string) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(120);
    await expect(printer.locator('[data-field="price"]')).toHaveText(price('en'));
    await expect(rows(page).filter({ hasText: 'On-site legacy' }).locator('[data-field="active"]')).toHaveText('Inactive');

    await pickLocale(page, 'it');
    await expect(printer.locator('[data-field="price"]'), 'the price kept the English format').toHaveText(price('it'));
    expect(price('it'), 'the premise: the two formats differ').not.toBe(price('en'));
});

test('a service\'s Customers are exactly those subscribed to it now', async ({ page }) => {
    await page.goto('/');
    await openService(page, 'Network support');
    const expected = [1, 4, 6, 11, 14, 16, 21, 24].map(nameOf).sort();
    expect((await subscribers(page).allInnerTexts()).map((t) => t.split('·')[0].trim()).sort()).toEqual(expected);
    await expect(page.locator('[data-test="customers-count"]')).toHaveText(String(expected.length));
});

test('a subscription added in the customer reaches the service; ending it takes it away, and Undo brings it back', async ({ page }) => {
    // Proseware Health is customer 7: Laptop care only.
    await page.goto('/customers/7');
    await page.locator('[data-test="section-services"]').click();
    const subs = page.locator('[data-test="customer-services"] [data-test="subscription-row"]');
    await expect(subs).toHaveCount(1);
    await expect(subs.first()).toContainText('Laptop care');

    await page.locator('[data-test="subscription-add"] button').click();
    const dialog = page.locator('[data-test="subscription-dialog"] .pdx-dialog-panel');
    await expect(dialog).toBeVisible();
    await dialog.locator('[data-test="new-service"] [role="combobox"]').click();
    await page.getByRole('option', { name: 'Network support' }).click();
    await dialog.locator('[data-test="new-since"] input:not([type="hidden"])').fill('2026-09-01');
    await dialog.locator('[data-test="subscription-save"] button').click();
    await expect(dialog).toBeHidden();
    await expect(subs).toHaveCount(2);

    // Away, to the service, and it is there.
    await openService(page, 'Network support');
    await expect(subscribers(page).filter({ hasText: 'Proseware Health' })).toHaveCount(1);

    // Back to the customer through the service's own link, and end it.
    await subscribers(page).filter({ hasText: 'Proseware Health' }).locator('a').click();
    await expect(page).toHaveURL(/\/customers\/7$/);
    await page.locator('[data-test="section-services"]').click();
    await subs.filter({ hasText: 'Network support' }).locator('[data-test="subscription-end"] button').click();
    await expect(subs.filter({ hasText: 'Network support' }).locator('[data-test="subscription-end"]'), 'still current').toHaveCount(0);
    await page.locator('[data-test="toasts"]').getByRole('button', { name: 'Undo' }).click();
    await expect(subs.filter({ hasText: 'Network support' }).locator('[data-test="subscription-end"]'), 'Undo did not restore it').toHaveCount(1);

    // Ended for good this time: the service no longer counts it.
    await subs.filter({ hasText: 'Network support' }).locator('[data-test="subscription-end"] button').click();
    await expect(subs.filter({ hasText: 'Network support' }).locator('[data-test="subscription-end"]')).toHaveCount(0);
    await openService(page, 'Network support');
    await expect(subscribers(page).filter({ hasText: 'Proseware Health' }), 'an ended subscription still counts').toHaveCount(0);
    await expect(subscribers(page)).toHaveCount(8);
});

test('the ticket shows its SLA: the covering subscription first, else the customer\'s shortest', async ({ page }) => {
    await page.goto('/tickets/9');
    await expect(page.locator('[data-test="ticket-asset"]'), 'the premise: T-1008 is opened on a scanner').toContainText('Zebra DS2208');
    await expect(page.locator('[data-test="ticket-sla"]')).toHaveText('Answer within 12 h · Service desk');

    await page.goto('/tickets/4');
    await expect(page.locator('[data-test="ticket-asset"]'), 'the premise: T-1003 names no asset').toHaveCount(0);
    await expect(page.locator('[data-test="ticket-sla"]')).toHaveText('Answer within 2 h · Network support');
});

// ─── New ─────────────────────────────────────────────────────────────────────

test('New creates a service, opens it, and the list counts seven', async ({ page }) => {
    await page.goto('/');
    await openFromCatalog(page, 'services');
    await page.locator('[data-test="new"] button').click();
    const dialog = page.locator('[data-test="create-dialog"] .pdx-dialog-panel');
    await expect(dialog).toBeVisible();
    await dialog.locator('[data-test="new-code"] input:not([type="hidden"])').fill('SVC-SEC');
    await dialog.locator('[data-test="new-name"] input:not([type="hidden"])').fill('Security watch');
    await dialog.locator('[data-test="new-slaHours"] input').fill('1');
    await dialog.locator('[data-test="new-resolveHours"] input').fill('4');
    await dialog.locator('[data-test="new-price"] input').fill('480');
    await dialog.locator('[data-test="new-covers"] [role="combobox"]').click();
    await page.getByRole('option', { name: 'Network' }).click();
    await page.keyboard.press('Escape');
    await dialog.locator('[data-test="create"] button').click();

    await expect(page).toHaveURL(/\/services\/7$/);
    await expect(page.locator('[data-test="service"] h1')).toHaveText('Security watch');
    await page.locator('[data-test="crumbs"] a', { hasText: 'Services' }).click();
    await expect(page.locator('[data-test="total"]')).toHaveText('7 services');
    await expect(rows(page).filter({ hasText: 'Security watch' }).locator('[data-field="slaHours"]')).toHaveText('1 h');
});

test('New refuses a resolution before the first answer, and Cancel adds nothing', async ({ page }) => {
    await page.goto('/');
    await openFromCatalog(page, 'services');
    await page.locator('[data-test="new"] button').click();
    const dialog = page.locator('[data-test="create-dialog"] .pdx-dialog-panel');
    await dialog.locator('[data-test="new-code"] input:not([type="hidden"])').fill('SVC-X');
    await dialog.locator('[data-test="new-name"] input:not([type="hidden"])').fill('Backwards');
    await dialog.locator('[data-test="new-slaHours"] input').fill('8');
    await dialog.locator('[data-test="new-resolveHours"] input').fill('2');
    await dialog.locator('[data-test="create"] button').click();
    await expect(dialog, 'a service was created that resolves before it answers').toBeVisible();
    await expect(dialog).toContainText('A resolution cannot come before the first answer.');

    await dialog.locator('[data-test="cancel"] button').click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-test="total"]')).toHaveText('6 services');
});

test('control — an inactive service is not offered to a customer', async ({ page }) => {
    await page.goto('/customers/7');
    await page.locator('[data-test="section-services"]').click();
    await page.locator('[data-test="subscription-add"] button').click();
    const dialog = page.locator('[data-test="subscription-dialog"] .pdx-dialog-panel');
    await dialog.locator('[data-test="new-service"] [role="combobox"]').click();
    await expect(page.getByRole('option', { name: 'Printer care' }), 'the premise: the picker offers services').toBeVisible();
    await expect(page.getByRole('option', { name: 'On-site legacy' })).toHaveCount(0);
    // And one the customer already has is not offered twice.
    await expect(page.getByRole('option', { name: 'Laptop care' })).toHaveCount(0);
});
