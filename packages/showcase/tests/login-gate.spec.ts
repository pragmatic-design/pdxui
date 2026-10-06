/**
 * Every route behind the login, and back to the page asked for.
 *
 * A LOB app is not browsed anonymously: a visitor who is not signed in sees none of it, not the
 * whole app with «Sign in» in the bar. Every route but `/login` sends a visitor without a session there, with the
 * address they asked for in `?next=`, and signing in lands on it.
 *
 * These rows are a GUEST's: the suite signs every other spec in (`tests/session.ts`).
 */
import { test, expect, type Page } from '@playwright/test';
import { GUEST } from './session';

/** The shell's CATALOG, every entry (`src/shell.pdx`), and the dashboard. */
const CATALOG_HREFS = ['/', '/tickets', '/intake', '/board', '/customers', '/customers/import', '/employees',
    '/sites', '/assets', '/contracts', '/services', '/account', '/settings'];

test.use({ storageState: GUEST });

async function signIn(page: Page, username = 'admin'): Promise<void> {
    await expect(page.locator('[data-test="login-form"]')).toBeVisible();
    await page.locator('[data-test="username"] input').fill(username);
    await page.locator('[data-test="password"] input').fill('pdx');
    await page.locator('[data-test="sign-in"] button').click();
}

test('signed out, a deep link lands on the login with the address it asked for, and signing in goes there', async ({ page }) => {
    await page.goto('/tickets?status=closed');
    await expect(page).toHaveURL(/\/login\?next=%2Ftickets%3Fstatus%3Dclosed$/);
    await expect(page.locator('pdx-app .app-bar'), 'the shell was drawn for a guest').toHaveCount(0);

    await signIn(page);
    await expect(page).toHaveURL(/\/tickets\?status=closed$/);
    await expect(page.locator('[data-test="tickets"]')).toBeVisible();
});

test('signed out, every entry of the catalogue lands on the login', async ({ page }) => {
    expect(CATALOG_HREFS.length, 'the premise: the catalogue has entries').toBeGreaterThan(5);
    for (const href of CATALOG_HREFS) {
        await page.goto(href);
        // The dashboard carries no `next`: it is where signing in lands anyway.
        await expect(page, `${href} was reachable without a session`).toHaveURL(/\/login(\?next=|$)/);
    }
});

test('a next that leaves this origin is ignored: signing in lands on the dashboard', async ({ page }) => {
    await page.goto('/login?next=https%3A%2F%2Fevil.example%2F');
    await signIn(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('pdx-app .app-bar')).toBeVisible();
});

test('signing out lands on the login, and the page it left is where signing in again returns', async ({ page }) => {
    await page.goto('/login?next=%2Fcustomers%2F1');
    await signIn(page);
    await expect(page).toHaveURL(/\/customers\/1$/);

    await page.locator('[data-test="session"] [data-test="profile"]').click();
    await page.locator('.pdx-dropdown-menu-panel').getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fcustomers%2F1$/);
    await signIn(page);
    await expect(page).toHaveURL(/\/customers\/1$/);
});

test('signed out, the browser\'s Back does not bring an app page back', async ({ page }) => {
    await page.goto('/login?next=%2Fcustomers');
    await signIn(page);
    await expect(page).toHaveURL(/\/customers$/);
    await page.locator('[data-test="session"] [data-test="profile"]').click();
    await page.locator('.pdx-dropdown-menu-panel').getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goBack();
    await expect(page, 'Back showed a page without a session').toHaveURL(/\/login/);
    await expect(page.locator('[data-test="customers"]')).toHaveCount(0);
});

test('control — signed in, a reload stays where it is', async ({ page }) => {
    await page.goto('/login?next=%2Fcustomers%2F1');
    await signIn(page);
    await expect(page).toHaveURL(/\/customers\/1$/);
    await page.reload();
    await expect(page).toHaveURL(/\/customers\/1$/);
    await expect(page.locator('[data-test="customer"]')).toBeVisible();
});
