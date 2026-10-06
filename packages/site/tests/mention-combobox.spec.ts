/**
 * pdx-mention on the site, measured in Chromium.
 *
 * "Hello @al" opens a listbox with "Alice Johnson" highlighted, and the textarea points at it through
 * aria-controls and aria-activedescendant; the suggestion count is announced, "@zzzz" announces
 * "No results" instead of closing silently, and the field is named by a label, not its placeholder.
 */
import { test, expect } from '@playwright/test';

test('the textarea points at the active suggestion, and the list is announced', async ({ page }) => {
    await page.goto('/components/pdx-mention', { waitUntil: 'networkidle' });
    const field = page.getByRole('textbox', { name: 'Comment', exact: true });
    await field.click();
    await page.keyboard.type('Hello @');

    const host = page.locator('pdx-mention').filter({ has: field });
    const active = () => field.evaluate((ta) => document.getElementById(ta.getAttribute('aria-activedescendant') ?? '')?.textContent ?? null);
    await expect.poll(active).toContain('Alice Johnson');
    const list = await field.evaluate((ta) => document.getElementById(ta.getAttribute('aria-controls') ?? '')?.getAttribute('role'));
    expect(list).toBe('listbox');
    await expect(host.getByRole('status')).toHaveText('6 suggestions');

    await page.keyboard.press('ArrowDown');
    await expect.poll(active).toContain('Bob Smith');

    await page.keyboard.type('al');
    await expect(host.getByRole('status')).toHaveText('1 suggestion');

    await page.keyboard.type('zzzz');
    await expect(host.getByRole('status')).toHaveText('No results');
    await expect(field).not.toHaveAttribute('aria-activedescendant', /.+/);
});
