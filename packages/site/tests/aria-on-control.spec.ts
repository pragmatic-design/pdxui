/**
 * ARIA state on the element with the role, on the site in Chromium.
 *
 * pdx-popover marks the inner button expanded, not the pdx-button host, and moves focus into the
 * panel; pdx-tooltip describes the button and answers keyboard focus and Escape; pdx-progress writes
 * aria-valuenow on its progressbar — off it, every bar reads no value.
 */
import { test, expect } from '@playwright/test';

test('popover: the button says expanded, and focus goes in and comes back', async ({ page }) => {
    await page.goto('/components/pdx-popover', { waitUntil: 'networkidle' });
    const button = page.getByRole('button', { name: 'Click me', exact: true });
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const dialogId = await button.getAttribute('aria-controls');
    const dialog = page.locator(`#${dialogId}`);
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
});

// With nothing focusable inside, the dialog container itself takes the focus, and the global
// :focus-visible rule would draw a ring around the whole panel (Dim 5 popover-open, 13 themes).
test('popover: the focused dialog container draws no focus ring', async ({ page }) => {
    await page.goto('/components/pdx-popover', { waitUntil: 'networkidle' });
    const button = page.getByRole('button', { name: 'Click me', exact: true });
    await button.focus();
    await page.keyboard.press('Enter');
    const dialog = page.locator(`#${await button.getAttribute('aria-controls')}`);
    await expect(dialog).toBeFocused();
    expect(await dialog.evaluate((d) => d.matches(':focus-visible'))).toBe(true);
    expect(await dialog.evaluate((d) => getComputedStyle(d).outlineStyle)).toBe('none');
});

test('popover: a hover popover opens on keyboard focus', async ({ page }) => {
    await page.goto('/components/pdx-popover', { waitUntil: 'networkidle' });
    const button = page.getByRole('button', { name: 'Hover me', exact: true });
    await button.focus();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
});

test('tooltip: focus shows it and describes the button; Escape hides it', async ({ page }) => {
    await page.goto('/components/pdx-tooltip', { waitUntil: 'networkidle' });
    const button = page.getByRole('button', { name: 'Hover me', exact: true });
    await button.focus();
    await expect(button).toHaveAccessibleDescription('This is a tooltip');
    const tip = page.locator(`#${await button.getAttribute('aria-describedby')}`);
    await expect(tip).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
    await expect(button).toBeFocused();
});

test('progress: every determinate bar carries its value on the progressbar', async ({ page }) => {
    await page.goto('/components/pdx-progress', { waitUntil: 'networkidle' });
    const values = await page.locator('pdx-progress [role="progressbar"]').evaluateAll((bars) =>
        bars.map((b) => ({ now: b.getAttribute('aria-valuenow'), busy: b.closest('pdx-progress')!.getAttribute('value') })));
    const determinate = values.filter((v) => v.busy !== null && Number(v.busy) >= 0);
    expect(determinate.length).toBeGreaterThan(0);
    for (const v of determinate) expect(v.now).not.toBeNull();
    await expect(page.locator('pdx-progress[aria-valuenow]')).toHaveCount(0);
});
