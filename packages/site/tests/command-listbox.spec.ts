/**
 * pdx-command on the site, measured with getByRole in Chromium: the arrows move the input's
 * aria-activedescendant (without it, arrowing announces nothing), Tab does not walk into the list
 * through the options, a disabled command is listed and skipped, and the custom palette draws its
 * items through the slot and shows its empty text.
 */
import { test, expect, type Page } from '@playwright/test';

/** The option the combobox's aria-activedescendant names, as its label text. */
async function highlighted(page: Page): Promise<string | null> {
    return page.evaluate(() => {
        const input = document.activeElement as HTMLElement | null;
        const id = input?.getAttribute('aria-activedescendant');
        return id ? document.getElementById(id)?.querySelector('.pdx-command-item-label')?.textContent?.trim() ?? null : null;
    });
}

test('the arrows move aria-activedescendant, over the disabled command; Tab stays in the input', async ({ page }) => {
    await page.goto('/components/pdx-command', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Open command palette' }).click();
    const dialog = page.getByRole('dialog', { name: 'Command palette' });
    const input = dialog.getByRole('combobox');
    await expect(input).toBeFocused();
    expect(await highlighted(page)).toBe('Go to Dashboard');

    await page.keyboard.press('ArrowDown');
    await expect.poll(() => highlighted(page)).toBe('Open Analytics');

    await expect(dialog.getByRole('group', { name: 'Account' })).toBeVisible();
    const billing = dialog.getByRole('option', { name: 'Billing (admins only)' });
    await expect(billing).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => highlighted(page)).toBe('Go to Dashboard');
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => highlighted(page), { message: 'ArrowUp from the first wraps to the last enabled, over Billing' }).toBe('Settings');

    await page.keyboard.press('Tab');
    await expect(input, 'Tab walked into the list').toBeFocused();
    await expect(dialog.getByRole('option', { name: 'Search Projects' })).toHaveAttribute('aria-keyshortcuts', 'Control+P');
});

test('the custom palette draws items through the slot and shows its empty text', async ({ page }) => {
    await page.goto('/components/pdx-command', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Find a file' }).click();
    const dialog = page.getByRole('dialog').filter({ has: page.getByPlaceholder('Find a file…') });
    await expect(dialog.getByRole('option', { name: /README\.md/ })).toContainText('docs · 2 KB');
    await expect(dialog.getByRole('combobox')).toBeFocused();
    // Typing filters a palette opened by its `open` prop, without re-opening it on every key and
    // wiping the query.
    await page.keyboard.type('zzz');
    await expect(dialog.getByRole('combobox')).toHaveValue('zzz');
    await expect(dialog.getByText('No file with that name — check the spelling.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Find a file' })).toBeFocused();
});
