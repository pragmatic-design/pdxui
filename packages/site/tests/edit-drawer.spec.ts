/**
 * The edit-drawer page, measured in Chromium: "New" after "Edit Alice" is an empty form, not "Alice
 * Johnson" / "Engineer" under the title "New"; a failed save puts focus on the invalid field, not on
 * the Save button; and Cancel returns focus to the opener.
 */
import { test, expect } from '@playwright/test';

test('Edit Alice, Cancel, New: the form is empty', async ({ page }) => {
    await page.goto('/components/pdx-edit-drawer', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Edit Alice' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit' });
    await expect(edit.getByRole('textbox', { name: /Name/ })).toHaveValue('Alice Johnson');
    await edit.getByRole('button', { name: 'Cancel' }).click();
    await expect(edit).toBeHidden();

    await page.getByRole('button', { name: 'New', exact: true }).click();
    const create = page.getByRole('dialog', { name: 'New' });
    await expect(create).toBeVisible();
    await expect(create.getByRole('textbox', { name: /Name/ })).toHaveValue('');
});

test('a failed save focuses the invalid field; Cancel returns focus to the opener', async ({ page }) => {
    await page.goto('/components/pdx-edit-drawer', { waitUntil: 'networkidle' });
    const opener = page.getByRole('button', { name: 'New', exact: true });
    await opener.focus();
    await page.keyboard.press('Enter');
    const create = page.getByRole('dialog', { name: 'New' });
    await expect(create).toBeVisible();
    await create.getByRole('button', { name: 'Save' }).click();
    const name = create.getByRole('textbox', { name: /Name/ });
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toBeFocused();

    await create.getByRole('button', { name: 'Cancel' }).click();
    await expect(create).toBeHidden();
    await expect(opener).toBeFocused();
});
