/**
 * Settings › Permissions and Users are editable, and the server owns what they edit.
 *
 * These rows edit the mock server's
 * roles (`mock-auth.ts`), so they run on the DEV server (`playwright.dev.config.ts`), whose process
 * and state are theirs: on the build's server a revoked grant would race every other spec that
 * reads it. Serial, and each row puts back what it takes.
 */
import { expect, test, type Browser, type Page, type TestInfo } from './fixture';
import { GUEST } from './session';

test.describe.configure({ mode: 'serial' });

const cell = (page: Page, permission: string, role: string) => page.locator(`[data-test="perm-${permission}-${role}"]`);
const box = (page: Page, permission: string, role: string) => cell(page, permission, role).locator('input[type="checkbox"]');

/** In-app, not `page.goto`: a reload would re-read everything and prove nothing about «at once». */
async function openAccount(page: Page): Promise<void> {
    await page.locator('[data-test="profile"]').click();
    await page.locator('.pdx-dropdown-menu-panel').getByRole('menuitem', { name: 'Profile' }).click();
    await expect(page.locator('[data-test="account"]')).toBeVisible();
}

async function openPermissions(page: Page): Promise<void> {
    await page.goto('/settings/permissions');
    await expect(cell(page, 'billing.write', 'admin')).toBeVisible();
    await expect(box(page, 'billing.write', 'admin')).toBeVisible();
}

/** A fresh browser, signed in through the form as `username`, on the account page. */
async function signedInAs(browser: Browser, info: TestInfo, username: string): Promise<Page> {
    const context = await browser.newContext({ storageState: GUEST, baseURL: String(info.project.use.baseURL), locale: 'en-US' });
    const page = await context.newPage();
    await page.goto('/login?next=%2Faccount');
    await page.locator('[data-test="username"] input').fill(username);
    await page.locator('[data-test="password"] input').fill('pdx');
    await page.locator('[data-test="sign-in"] button').click();
    await expect(page.locator('[data-test="account"]')).toBeVisible();
    return page;
}

test('a grant taken from a role is gone from the session at once, and given back it returns', async ({ page }) => {
    await openPermissions(page);
    await expect(box(page, 'billing.write', 'admin')).toBeChecked();

    await box(page, 'billing.write', 'admin').uncheck();
    await expect(cell(page, 'billing.write', 'admin')).toHaveAttribute('data-granted', 'false');
    await openAccount(page);
    await expect(page.locator('[data-test="close-month"]')).toHaveCount(0);
    await expect(page.locator('[data-test="close-month-hidden"]')).toBeVisible();

    await page.goBack();
    await expect(box(page, 'billing.write', 'admin')).toBeVisible();
    await box(page, 'billing.write', 'admin').check();
    await expect(cell(page, 'billing.write', 'admin')).toHaveAttribute('data-granted', 'true');
    await openAccount(page);
    await expect(page.locator('[data-test="close-month"]')).toBeVisible();
});

test('the last way to change permissions cannot be taken away: refused, and the box stays ticked', async ({ page }) => {
    await openPermissions(page);
    // `click()`, not `uncheck()`: `uncheck()` asserts the box ends unticked — the opposite of this
    // row's claim — and throws whenever the refusal puts the tick back before it looks.
    await box(page, 'settings.permissions', 'admin').click();
    await expect(page.locator('[data-test="refusal"]')).toContainText('settings.permissions');
    await expect(box(page, 'settings.permissions', 'admin')).toBeChecked();
    await expect(cell(page, 'settings.permissions', 'admin')).toHaveAttribute('data-granted', 'true');
});

test('a role still held is not deactivated: the refusal names who holds it', async ({ page }) => {
    await openPermissions(page);
    await page.locator('[data-test="deactivate-technician"]').click();
    await expect(page.locator('[data-test="refusal"]')).toContainText('Tom Technician');
    await expect(page.locator('[data-test="role-technician"]')).toHaveAttribute('data-active', 'true');
});

test('a new role, given to an account in Users, is what that account may do at its next sign-in', async ({ page, browser }, info) => {
    await openPermissions(page);
    await page.locator('[data-test="new-role"]').click();
    const dialog = page.locator('[data-test="role-dialog"]');
    await dialog.locator('[data-test="new-role-name"] input').fill('Supervisor');
    await dialog.locator('[data-test="new-role-copy"]').click();
    await page.getByRole('option', { name: 'Technician' }).click();
    await dialog.locator('[data-test="role-create"]').click();

    await expect(page.locator('[data-test="role-supervisor"]')).toBeVisible();
    await expect(cell(page, 'account.read', 'supervisor'), 'copied from Technician').toHaveAttribute('data-granted', 'true');
    await box(page, 'billing.read', 'supervisor').check();
    await expect(cell(page, 'billing.read', 'supervisor')).toHaveAttribute('data-granted', 'true');

    await page.goto('/settings/users');
    await page.locator('[data-test="roles-tech"]').click();
    await page.getByRole('option', { name: 'Supervisor' }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-test="user-row"]').nth(1)).toContainText('billing.read');

    const tom = await signedInAs(browser, info, 'tech');
    await expect(tom.locator('[data-test="roles"]')).toContainText('Supervisor');
    await expect(tom.locator('[data-test="perms"]')).toContainText('read the billing');
    await expect(tom.locator('[data-test="close-month"]')).toHaveCount(0);
    await tom.context().close();
});

test('without settings.permissions the matrix is read-only', async ({ browser }, info) => {
    const tom = await signedInAs(browser, info, 'tech');
    await tom.goto('/settings/permissions');
    await expect(cell(tom, 'account.read', 'technician')).toHaveAttribute('data-granted', 'true');
    await expect(tom.locator('[data-test="settings-permissions"] input[type="checkbox"]')).toHaveCount(0);
    await expect(tom.locator('[data-test="new-role"]')).toHaveCount(0);
    await tom.goto('/settings/users');
    await expect(tom.locator('[data-test="user-row"]').first()).toBeVisible();
    await expect(tom.locator('[data-test^="roles-"]')).toHaveCount(0);
    await tom.context().close();
});
