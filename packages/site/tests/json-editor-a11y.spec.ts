/**
 * pdx-json-editor on the site, measured in Chromium.
 *
 * The "Active" switch is named Active, not "Toggle", and a click on its label changes the value. The
 * "Edit…" sub-modal is a named modal dialog: focus moves into it, Tab stays in it, and Apply returns
 * focus to "Edit…" instead of <body>. Its delete button is named in words, not by an emoji.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/components/pdx-json-editor', { waitUntil: 'networkidle' });
});

test('the Active switch is named Active, and a click on its label changes the value', async ({ page }) => {
    const editor = page.locator('pdx-json-editor').first();
    const output = page.locator('pdx-json-editor + pre').first();
    const active = editor.getByRole('switch', { name: 'Active', exact: true });
    await expect(active).toBeChecked();
    // The text, not the 44px track: a click on the caption must change the value too.
    await editor.getByText('Active', { exact: true }).click();
    await expect(active).not.toBeChecked();
    await expect(output).toContainText('"active": false');
    await active.click();
    await expect(output).toContainText('"active": true');
});

test('the text and tag fields are named by their labels', async ({ page }) => {
    const editor = page.locator('pdx-json-editor').first();
    await expect(editor.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Acme');
    await expect(editor.getByRole('textbox', { name: 'Tags', exact: true })).toBeVisible();
});

test('Edit… opens a modal dialog named Contacts, keeps focus in it, and Apply returns focus', async ({ page }) => {
    const edit = page.locator('pdx-json-editor').first().getByRole('button', { name: /Edit/ });
    await edit.click();
    const dialog = page.getByRole('dialog', { name: 'Contacts' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    // Focus is in the dialog, on its first field.
    await expect(dialog.getByRole('textbox').first()).toBeFocused();
    // Tab never leaves it.
    for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab');
        expect(await dialog.evaluate(d => d.contains(document.activeElement))).toBe(true);
    }
    await expect(dialog.getByRole('button', { name: 'Remove item 1', exact: true })).toBeVisible();

    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(edit).toBeFocused();
});

test('the API table lists no internal jed-edit event', async ({ page }) => {
    await expect(page.getByText('pdx-change').first()).toBeAttached();
    expect(await page.locator('body').textContent()).not.toContain('jed-edit');
});

test('Escape closes the dialog without applying, and focus returns to Edit…', async ({ page }) => {
    const edit = page.locator('pdx-json-editor').first().getByRole('button', { name: /Edit/ });
    await edit.click();
    const dialog = page.getByRole('dialog', { name: 'Contacts' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(edit).toBeFocused();
});
