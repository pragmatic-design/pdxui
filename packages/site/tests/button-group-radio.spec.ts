/**
 * pdx-button-group mode="single" is a radio group in the accessibility tree, measured with getByRole
 * in Chromium: a named radiogroup of radios, one checked, and the arrows move the check — not a
 * radiogroup of aria-pressed toggle buttons with no radio in it, whose arrows move focus only.
 */
import { test, expect } from '@playwright/test';

test('the alignment group is a named radio group whose arrows move the selection', async ({ page }) => {
    await page.goto('/components/pdx-button-group', { waitUntil: 'networkidle' });
    const group = page.getByRole('radiogroup', { name: 'Text alignment' });
    await expect(group.getByRole('radio')).toHaveCount(3);
    const left = group.getByRole('radio', { name: 'Left' });
    const center = group.getByRole('radio', { name: 'Center' });
    await expect(left).toBeChecked();
    await expect(center).not.toBeChecked();

    await left.focus();
    await page.keyboard.press('ArrowRight');
    await expect(center).toBeFocused();
    await expect(center).toBeChecked();
    await expect(left).not.toBeChecked();
});

test('the formatting group is a named group of toggle buttons, not radios', async ({ page }) => {
    await page.goto('/components/pdx-button-group', { waitUntil: 'networkidle' });
    const group = page.getByRole('group', { name: 'Formatting' }).first();
    await expect(group.getByRole('radio')).toHaveCount(0);
    const bold = group.getByRole('button', { name: 'B', exact: true });
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
    await bold.click();
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
});
