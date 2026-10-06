// The account page is a person's profile and preferences.
//
// It was the auth story's test bench: raw roles and permission keys, «who the server says you
// are», «the token expires in 3596s», and a «Call it anyway» button that exists to be refused. The
// owner's tour called it what it was. Now: who you are, in words; what you can do, in words; the
// same settings as the profile menu, on the page; and until when you are signed in.
//
// What the auth story asserts is still asserted, in `auth.spec.ts`, through the new page and —
// for the call that is meant to be refused — through the Demo panel.
import { test, expect, type Page } from '@playwright/test';
import { demo } from './demo';

const fill = (page: Page, field: string, value: string) =>
    page.locator(`[data-test="${field}"] input`).fill(value);

async function signIn(page: Page, username: string): Promise<void> {
    await page.goto('/login?next=%2Faccount');
    await expect(page.locator('[data-test="login-form"]')).toBeVisible();
    await fill(page, 'username', username);
    await fill(page, 'password', 'pdx');
    await page.locator('[data-test="sign-in"] button').click();
    await expect(page.locator('[data-test="account"]')).toBeVisible();
}

test('the profile: name, email and role, in words', async ({ page }) => {
    await signIn(page, 'admin');
    const profile = page.locator('[data-test="profile-card"]');
    await expect(profile.locator('[data-test="who"]')).toHaveText('Ada Admin');
    await expect(profile.locator('[data-test="email"]')).toHaveText('ada@example.com');
    await expect(profile.locator('[data-test="roles"]')).toHaveText('Administrator');
    await expect(profile.locator('[data-test="profile-avatar"]')).toHaveText('AA');
});

test('a technician is named by the role\'s label, not its key', async ({ page }) => {
    await signIn(page, 'tech');
    await expect(page.locator('[data-test="roles"]')).toHaveText('Technician');
});

test('the theme is set from the page, as the profile menu sets it', async ({ page }) => {
    await signIn(page, 'admin');
    const scheme = page.getByRole('radiogroup', { name: 'Theme' });
    await scheme.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html'), 'the page did not change the scheme').toHaveAttribute('pdx-scheme', 'dark');

    // And the menu agrees: it opens on what the page chose, not on what it last knew.
    await page.locator('[data-test="profile"]').click();
    await page.locator('.pdx-dropdown-menu-panel').getByRole('menuitem', { name: 'Settings' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-submenu-key="settings"]').getByRole('menuitemradio', { name: 'Dark' }))
        .toHaveAttribute('aria-checked', 'true');
});

test('the density and the language are set from the page too', async ({ page }) => {
    await signIn(page, 'admin');
    await page.getByRole('radiogroup', { name: 'Density' }).getByRole('radio', { name: 'Compact' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--pdx-density-factor')))
        .toBe('0.75');

    await page.getByRole('radiogroup', { name: 'Language' }).getByRole('radio', { name: /Italiano/ }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
    await expect(page.locator('[data-test="account"] h1')).toHaveText('Account');
});

test('the session says until when, as a time — not a countdown in seconds', async ({ page }) => {
    await signIn(page, 'admin');
    await expect(page.locator('[data-test="session-state"]')).toHaveText(/^Signed in until \d{1,2}:\d{2}/);
});

test('control — no session debugging on the page, and «Call it anyway» is the Demo panel\'s', async ({ page }) => {
    await signIn(page, 'tech');
    const account = page.locator('[data-test="account"]');
    await expect(account).not.toContainText(/token|billing\.(read|write)|\(tech\)/i);
    await expect(account.locator('[data-test="close-month-anyway"]')).toHaveCount(0);

    await demo(page, 'close-month-anyway');
    await expect(page.locator('[data-test="action-error"]'), 'the refusal is not on the page').toContainText('needs billing.write');
});
