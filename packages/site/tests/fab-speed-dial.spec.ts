/**
 * pdx-fab's speed dials on the site, measured in Chromium.
 *
 * A closed dial keeps no action as an invisible tab stop: Shift+Tab from a closed FAB does not land on
 * "Share". Enter moves focus into the dial, and the arrows move it between actions.
 */
import { test, expect } from '@playwright/test';

test('closed dials offer no action to Tab; Enter opens into the dial and an action returns to the FAB', async ({ page }) => {
    await page.goto('/components/pdx-fab', { waitUntil: 'networkidle' });
    const dials = page.locator('pdx-fab .pdx-fab-dial');
    const count = await dials.count();
    expect(count).toBeGreaterThan(0);
    // Every closed dial is inert: out of the tab order and the accessibility tree. (Playwright's role
    // queries do not apply `inert`, so the attribute is what is read here, and the Tab below.)
    for (let i = 0; i < count; i++) await expect(dials.nth(i)).toHaveAttribute('inert', '');

    // Shift+Tab from a closed FAB does not land on one of its actions.
    const host = page.locator('pdx-fab').filter({ has: page.locator('.pdx-fab-dial') }).first();
    const fab = host.locator('button.pdx-fab');
    await fab.focus();
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.pdx-fab-dial'))).toBe(false);

    await fab.focus();
    await page.keyboard.press('Enter');
    await expect(fab).toHaveAttribute('aria-expanded', 'true');
    const focusedIsAction = () => page.evaluate(() => document.activeElement?.classList.contains('pdx-fab-action') ?? false);
    expect(await focusedIsAction()).toBe(true);
    await expect(host.locator('.pdx-fab-dial')).not.toHaveAttribute('inert', '');
    // The arrow in the dial's direction moves to another action.
    const before = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    await page.keyboard.press('ArrowUp');
    expect(await focusedIsAction()).toBe(true);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).not.toBe(before);

    await page.keyboard.press('Enter');
    await expect(fab).toHaveAttribute('aria-expanded', 'false');
    await expect(fab).toBeFocused();
    await expect(host.locator('.pdx-fab-dial')).toHaveAttribute('inert', '');
});
