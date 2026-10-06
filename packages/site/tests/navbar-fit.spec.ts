/**
 * pdx-navbar on the site, measured in Chromium.
 *
 * In the demo column the Enterprise header collapses instead of running its actions past its edge,
 * which a viewport media query cannot do. Escape closes the mobile menu, and each navbar on the page
 * names its own landmark rather than all being "Main navigation".
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/components/pdx-navbar', { waitUntil: 'networkidle' });
});

test('in the demo column the navbar collapses instead of running past its edge', async ({ page }) => {
    const navbar = page.locator('pdx-navbar').first();
    const overflow = await navbar.evaluate((host) => {
        const right = host.getBoundingClientRect().right;
        return [...host.querySelectorAll('*')]
            .filter((e) => (e as HTMLElement).offsetParent !== null && e.getBoundingClientRect().right > right + 0.5)
            .map((e) => `${e.tagName.toLowerCase()}.${e.className}`);
    });
    expect(overflow).toEqual([]);
    await expect(navbar.getByRole('button', { name: 'Toggle menu' })).toBeVisible();
    // The bell's count sits on the bell.
    const badge = await navbar.locator('.pdx-navbar-badge').evaluate((b) => {
        const bell = b.parentElement!.getBoundingClientRect();
        const r = b.getBoundingClientRect();
        return { inside: r.top >= bell.top - 1 && r.bottom <= bell.bottom + 1 };
    });
    expect(badge.inside).toBe(true);
});

test('the mobile menu opens on its first link and Escape closes it back to the toggle', async ({ page }) => {
    const navbar = page.locator('pdx-navbar').first();
    const toggle = navbar.getByRole('button', { name: 'Toggle menu' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(navbar.getByRole('link', { name: 'Dashboard' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
});

test('each navbar names its own landmark', async ({ page }) => {
    const names = await page.locator('pdx-navbar nav').evaluateAll((navs) =>
        navs.filter((n) => getComputedStyle(n).display !== 'none').map((n) => n.getAttribute('aria-label')));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('Site');
});
