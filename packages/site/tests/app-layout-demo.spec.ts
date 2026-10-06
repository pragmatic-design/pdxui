/**
 * The app-layout gallery teaches an accessible shell: a named hamburger that says what it controls and
 * whether the navigation is open, and navigation items that take focus.
 *
 * Not an icon-only <button> with no name and no aria-expanded/aria-controls, driving the layout by
 * setting a lowercase attribute by id; not items that are a div with a pointer cursor — not
 * focusable, not operable, and a click that does nothing.
 */
import { test, expect, type Page } from '@playwright/test';

/** The gallery section a heading heads — its parent. */
const section = (page: Page, heading: string) =>
    page.locator('.cmp-gallery').getByRole('heading', { name: heading, exact: true }).locator('xpath=..');

test('the hamburger is named, controls the navbar, and its aria-expanded follows the rail', async ({ page }) => {
    await page.goto('/components/pdx-app-layout', { waitUntil: 'domcontentloaded' });
    const s = section(page, 'Full Layout');
    const burger = s.getByRole('button', { name: 'Toggle navigation' });
    await expect(burger).toHaveAttribute('aria-expanded', 'true');
    const controls = await burger.getAttribute('aria-controls');
    const nav = s.getByRole('navigation');
    await expect(nav).toHaveAttribute('id', controls!);
    const width = () => nav.evaluate((el) => Math.round(el.getBoundingClientRect().width));
    await expect.poll(width).toBe(160);

    await burger.click();
    await expect(burger).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(width, 'the navbar did not collapse to its rail').toBe(60);

    await burger.click();
    await expect(burger).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(width).toBe(160);
});

test('the navigation items take focus, and choosing one marks it as the current page', async ({ page }) => {
    await page.goto('/components/pdx-app-layout', { waitUntil: 'domcontentloaded' });
    const s = section(page, 'Full Layout');
    const nav = s.getByRole('navigation');
    const users = nav.getByRole('button', { name: 'Users' });
    await users.focus();
    await expect(users).toBeFocused();
    await expect(nav.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');

    await page.keyboard.press('Enter');
    await expect(users).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('button', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    await expect(s.getByRole('heading', { name: 'Users', level: 3 })).toBeVisible();
});

test('the props table has the component\'s defaults and all its props', async ({ page }) => {
    await page.goto('/components/pdx-app-layout', { waitUntil: 'domcontentloaded' });
    const table = section(page, 'Props');
    await expect(table.getByRole('row', { name: /navbar-collapsed-width/ })).toContainText("'60px'");
    await expect(table.getByRole('row', { name: /navbar-full-height/ })).toBeVisible();
});
