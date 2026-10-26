/**
 * pdx-toggle-group type="single" is a radio group in the accessibility tree, measured with getByRole in
 * Chromium on the published page: a named radiogroup of radios, one checked, and the arrows move the
 * check. type="multiple" is a group of toggle buttons, not radios. The pattern pdx-button-group's
 * mode="single" had until #286 moved selection here, measured where it now lives.
 */
import { test, expect } from '@playwright/test';

test('the alignment group is a named radio group whose arrows move the selection', async ({ page }) => {
    await page.goto('/components/pdx-toggle-group', { waitUntil: 'networkidle' });
    const group = page.getByRole('radiogroup', { name: 'Text alignment' });
    await expect(group.getByRole('radio')).toHaveCount(4);
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
    await page.goto('/components/pdx-toggle-group', { waitUntil: 'networkidle' });
    const group = page.getByRole('group', { name: 'Formatting' }).first();
    await expect(group.getByRole('radio')).toHaveCount(0);
    const italic = group.getByRole('button', { name: 'Italic', exact: true });
    await expect(italic).toHaveAttribute('aria-pressed', 'false');
    await italic.click();
    await expect(italic).toHaveAttribute('aria-pressed', 'true');
});
