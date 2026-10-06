// The profile menu at the end of the bar.
//
// The bar does not only show who is signed in: the avatar opens a menu — the person, then Profile,
// Settings and Sign out. The scheme is in Settings, with the density beside it, not a switch in the
// bar beside the language.
//
// Its own file rather than rows in `shell.spec.ts`, which is the rail's and is 300 lines already.
import { test, expect, type Page } from '@playwright/test';
import { GUEST } from './session';

const trigger = (page: Page) => page.locator('[data-test="profile"]');
/**
 * The menu itself: `pdx-dropdown-menu`'s panel, on <body> while it is open, and not a
 * submenu, which is drawn there too under `[data-submenu-key]`.
 */
const menu = (page: Page) => page.locator('.pdx-dropdown-menu-panel');

async function signIn(page: Page): Promise<void> {
    await page.goto('/login?next=%2Faccount');
    await page.locator('[data-test="username"] input').fill('admin');
    await page.locator('[data-test="password"] input').fill('pdx');
    await page.locator('[data-test="sign-in"] button').click();
    await expect(page.locator('[data-test="account"]')).toBeVisible();
}

test('the avatar opens a menu: the person, then Profile, Settings and Sign out', async ({ page }) => {
    await signIn(page);
    await expect(trigger(page)).toHaveAttribute('aria-haspopup', 'menu');
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');

    await trigger(page).click();
    await expect(menu(page)).toBeVisible();
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');

    // The header says who, before anything says what.
    await expect(menu(page)).toContainText('Ada Admin');
    await expect(menu(page)).toContainText('ada@example.com');

    const items = await menu(page).locator(':scope > [role="menuitem"]').allTextContents();
    expect(items.map((t) => t.trim()), 'the entries, in the order the owner decided')
        .toEqual(['Profile', 'Settings', 'Sign out']);
    // Last, and separated: the one entry that ends what you are doing.
    await expect(menu(page).locator(':scope > :last-child')).toHaveText('Sign out');
    await expect(menu(page).locator(':scope > [role="menuitem"]:last-child')
        .locator('xpath=preceding-sibling::*[1]')).toHaveAttribute('role', 'separator');
});

test('the scheme is no longer a button in the bar: it moved into Settings', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('.app-bar [data-test="scheme"]')).toHaveCount(0);
});

test('the keyboard: the arrows move between entries, Escape closes and gives the focus back', async ({ page }) => {
    await signIn(page);
    await trigger(page).focus();
    await page.keyboard.press('Enter');
    await expect(menu(page)).toBeVisible();

    const focused = () => page.evaluate(() => document.activeElement?.textContent?.trim());
    await expect.poll(focused, { message: 'opening the menu did not put the focus on its first entry' })
        .toBe('Profile');
    await page.keyboard.press('ArrowDown');
    await expect.poll(focused).toBe('Settings');
    await page.keyboard.press('ArrowDown');
    await expect.poll(focused).toBe('Sign out');

    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(trigger(page), 'Escape left the focus nowhere').toBeFocused();
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
});

test('ArrowDown on the avatar opens the menu on its first entry, as a menu button does', async ({ page }) => {
    await signIn(page);
    await trigger(page).focus();
    await page.keyboard.press('ArrowDown');
    await expect(menu(page)).toBeVisible();
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim()),
        { message: 'ArrowDown did not put the focus on the first entry' }).toBe('Profile');
});

test('a click outside closes it', async ({ page }) => {
    await signIn(page);
    await trigger(page).click();
    await expect(menu(page)).toBeVisible();
    // The middle of the page: `main`'s own corner is under the rail's handle.
    await page.mouse.click(700, 500);
    await expect(menu(page)).toBeHidden();
});

test('Profile goes to the account page', async ({ page }) => {
    await signIn(page);
    await page.goto('/');
    await trigger(page).click();
    await menu(page).getByRole('menuitem', { name: 'Profile' }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(menu(page)).toBeHidden();
});

test('Settings holds the scheme and the density, and says which are on', async ({ page }) => {
    await signIn(page);
    await trigger(page).click();
    await menu(page).getByRole('menuitem', { name: 'Settings' }).focus();
    await page.keyboard.press('ArrowRight');

    const settings = page.locator('[data-submenu-key="settings"]');
    await expect(settings).toBeVisible();
    await expect(settings.getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
    await expect(settings.getByRole('menuitemradio', { name: 'Normal' })).toHaveAttribute('aria-checked', 'true');

    await settings.getByRole('menuitemradio', { name: 'Dark' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('pdx-scheme'))).toBe('dark');

    // Escape closes the submenu and leaves the menu open on Settings; opened again, it has to say
    // what was just picked, and ONLY that — a radio group with two entries checked is two answers.
    await page.keyboard.press('Escape');
    await expect(settings).toBeHidden();
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    const again = page.locator('[data-submenu-key="settings"]');
    await expect(again.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    await expect(again.getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute('aria-checked', 'false');

    await again.getByRole('menuitemradio', { name: 'Compact' }).click();
    await expect.poll(() => page.evaluate(() =>
        document.documentElement.style.getPropertyValue('--pdx-density-factor'))).toBe('0.75');

    // Both survive a reload: a preference asked for again on every visit is not a preference.
    await page.reload();
    await expect(page.locator('[data-test="account"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.getAttribute('pdx-scheme'))).toBe('dark');
    expect(await page.evaluate(() =>
        document.documentElement.style.getPropertyValue('--pdx-density-factor'))).toBe('0.75');
});

// The radios are DERIVED from the scheme and the density, rather than patched before each opening,
// and a new items array does not rebuild the menu under the pointer. These two rows are what the
// derivation keeps. They do not measure the in-place update itself — the Settings submenu lives on
// <body> and survives a rebuild of the menu too; `ui/tests/unit/menu-update-in-place.test.ts`
// measures that.
test('a radio picked from the keyboard keeps the focus, and the group says one', async ({ page }) => {
    await signIn(page);
    await trigger(page).click();
    await menu(page).getByRole('menuitem', { name: 'Settings' }).focus();
    await page.keyboard.press('ArrowRight');
    const settings = page.locator('[data-submenu-key="settings"]');
    const dark = settings.getByRole('menuitemradio', { name: 'Dark' });
    await dark.focus();
    await page.keyboard.press('Enter');

    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('pdx-scheme'))).toBe('dark');
    await expect(dark, 'the pick moved the focus off the radio').toBeFocused();
    await expect(dark).toHaveAttribute('aria-checked', 'true');
    await expect(settings.getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute('aria-checked', 'false');
});

test('a density set on the account page is the one Settings says, the next time it opens', async ({ page }) => {
    await signIn(page);
    await page.locator('[data-test="pref-density"]').getByRole('radio', { name: 'Compact' }).click();
    await trigger(page).click();
    await menu(page).getByRole('menuitem', { name: 'Settings' }).focus();
    await page.keyboard.press('ArrowRight');
    const settings = page.locator('[data-submenu-key="settings"]');
    await expect(settings.getByRole('menuitemradio', { name: 'Compact' })).toHaveAttribute('aria-checked', 'true');
    await expect(settings.getByRole('menuitemradio', { name: 'Normal' })).toHaveAttribute('aria-checked', 'false');
});

test('Enter on Settings opens it, with the focus on its first choice', async ({ page }) => {
    // Not only hover and ArrowRight open a submenu: without Enter, from the keyboard, Settings looks
    // like an entry that does nothing.
    await signIn(page);
    await trigger(page).click();
    await menu(page).getByRole('menuitem', { name: 'Settings' }).focus();
    await page.keyboard.press('Enter');
    const settings = page.locator('[data-submenu-key="settings"]');
    await expect(settings).toBeVisible();
    await expect(settings.getByRole('menuitemradio').first()).toBeFocused();
});

test('Sign out lands on the sign-in, and a guarded route then sends you back there', async ({ page }) => {
    await signIn(page);
    await trigger(page).click();
    await menu(page).getByRole('menuitem', { name: 'Sign out' }).click();
    // Carrying the page it left.
    await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
    await expect(page.locator('[data-test="login"]')).toBeVisible();

    await page.goto('/account');
    await expect(page, 'the session outlived Sign out').toHaveURL(/\/login\?next=%2Faccount$/);
});

test.describe('signed out', () => {
    test.use({ storageState: GUEST });

    test('control — there is no menu, and no bar to hold one: the sign-in stands alone', async ({ page }) => {
        // Every route is behind the login: not the dashboard with «Sign in» in the bar.
        await page.goto('/');
        await expect(page.locator('[data-test="login"]')).toBeVisible();
        await expect(page.locator('.app-bar')).toHaveCount(0);
        await expect(trigger(page)).toHaveCount(0);
        await expect(page.locator('[data-test="profile-dropdown"]')).toHaveCount(0);
    });
});

test.describe('at 390', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('the trigger is a 44×44 target, and the menu stays on screen', async ({ page }) => {
        await signIn(page);
        const box = await trigger(page).boundingBox();
        expect(box, 'no trigger').not.toBeNull();
        expect(box!.width, 'too narrow for a thumb').toBeGreaterThanOrEqual(44);
        expect(box!.height, 'too short for a thumb').toBeGreaterThanOrEqual(44);

        await trigger(page).click();
        await expect(menu(page)).toBeVisible();
        const m = await menu(page).boundingBox();
        expect(m!.x, 'the menu starts off the left edge').toBeGreaterThanOrEqual(0);
        expect(m!.x + m!.width, 'the menu runs off the right edge').toBeLessThanOrEqual(390);
    });
});
