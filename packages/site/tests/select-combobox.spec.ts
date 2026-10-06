/**
 * pdx-select on the site, in Chromium.
 *
 * On /components/pdx-select: the plain trigger is a combobox, not a role="button"; ↓ moves a
 * highlight that aria-activedescendant announces; the searchable selects are named comboboxes; and a
 * letter typed on a closed select picks an option. pdx-form-template's Role field is named too.
 */
import { test, expect } from '@playwright/test';

// The playground's stage is left out: it renders the component with whatever props the reader
// toggles, and `label` starts empty there. Its controls — a select per enum prop — are counted.
const SELECTS = 'pdx-select:not(.pp-stage pdx-select)';

test('every select on the page is a combobox with a name', async ({ page }) => {
    await page.goto('/components/pdx-select', { waitUntil: 'networkidle' });
    const selects = await page.locator(SELECTS).count();
    expect(selects).toBeGreaterThan(20);
    await expect(page.locator('pdx-select [role="button"]')).toHaveCount(0);
    const comboboxes = page.locator(SELECTS).getByRole('combobox');
    await expect(comboboxes).toHaveCount(selects);
    for (let i = 0; i < selects; i++) {
        await expect(comboboxes.nth(i)).toHaveAccessibleName(/\S/);
    }
    await expect(page.getByRole('combobox', { name: 'Fruit' }).first()).toBeVisible();
});

test('↓ announces the option it moves to', async ({ page }) => {
    await page.goto('/components/pdx-select', { waitUntil: 'networkidle' });
    const color = page.getByRole('combobox', { name: 'Color' }).first();
    await color.focus();
    await page.keyboard.press('ArrowDown');
    await expect(color).toHaveAttribute('aria-expanded', 'true');
    const active = async () => page.locator(`#${await color.getAttribute('aria-activedescendant')}`);
    await expect(await active()).toHaveText('Red');
    await page.keyboard.press('ArrowDown');
    await expect(await active()).toHaveText('Green');
});

test('a letter on a closed select picks the next option that starts with it', async ({ page }) => {
    await page.goto('/components/pdx-select', { waitUntil: 'networkidle' });
    const color = page.getByRole('combobox', { name: 'Color' }).first();
    await color.focus();
    await page.keyboard.press('b');
    await expect(color).toHaveAttribute('aria-expanded', 'false');
    await expect(color).toContainText('Blue');
});

test('the caret turns when a searchable select opens, as it does for a plain one', async ({ page }) => {
    // A caret that turns on `.pdx-select-trigger[aria-expanded="true"]` alone misses this case: with
    // the search input as the combobox, aria-expanded is on the input, not the trigger.
    await page.goto('/components/pdx-select', { waitUntil: 'networkidle' });
    const host = page.locator('pdx-select').filter({ has: page.locator('input.pdx-select-search') }).first();
    const fruit = host.getByRole('combobox', { name: 'Fruit' });
    const caret = host.locator('.pdx-select-caret');
    await expect(caret).toHaveCSS('transform', 'none');
    await fruit.focus();
    await expect(fruit).toHaveAttribute('aria-expanded', 'true');
    await expect(caret).not.toHaveCSS('transform', 'none');
});

test('pdx-form-template: the Role select is named Role', async ({ page }) => {
    await page.goto('/components/pdx-form-template', { waitUntil: 'networkidle' });
    await expect(page.getByRole('combobox', { name: 'Role' }).first()).toBeVisible();
});
