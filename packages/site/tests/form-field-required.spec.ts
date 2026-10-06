/**
 * Required form fields and field-array rows on the site, measured in Chromium.
 *
 * Every required control on /components/pdx-form-field reports `aria-required`; the field-array rows'
 * remove buttons are named after their line, not "×", and a removal keeps focus in the list instead
 * of dropping it to <body>.
 */
import { test, expect } from '@playwright/test';

test('every required form field tells its control', async ({ page }) => {
    await page.goto('/components/pdx-form-field', { waitUntil: 'networkidle' });
    const states = await page.locator('pdx-form-field[required]').evaluateAll(fields => fields.map(f => {
        const group = f.querySelector('[role="radiogroup"]');
        const control = group ?? f.querySelector('input, textarea, select');
        return `${f.getAttribute('label')}: ${control?.getAttribute('aria-required')}`;
    }));
    expect(states.length).toBeGreaterThanOrEqual(13);
    for (const s of states) expect(s).toMatch(/: true$/);
});

test('field-array rows name their remove buttons, and a removal keeps focus in the list', async ({ page }) => {
    await page.goto('/components/pdx-form', { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Advanced' }).click();
    const remove1 = page.getByRole('button', { name: 'Remove line 1' });
    await expect(remove1).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove line 2' })).toBeVisible();
    await remove1.click();
    await expect(page.getByRole('button', { name: 'Remove line 2' })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Product, line 1' })).toBeFocused();
});

// A pdx-form-template list row's controls are named from their column header, not from an empty
// field label. The Composition tab's order is a JSON schema with a `type: 'list'`.
test('the form template\'s list rows name their controls "{column}, line {n}"', async ({ page }) => {
    await page.goto('/components/pdx-form', { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Composition' }).click();
    const template = page.locator('pdx-form-template').filter({ has: page.locator('.pdx-field-list-row') }).first();
    await expect(template.getByRole('textbox', { name: 'Product, line 1', exact: true })).toHaveValue('Widget Pro');
    await expect(template.getByRole('textbox', { name: 'Product, line 2', exact: true })).toHaveValue('Gadget X');
    await expect(template.getByLabel('Qty, line 1', { exact: true })).toBeVisible();
    await expect(template.getByLabel('Unit Price, line 2', { exact: true })).toBeVisible();
});
