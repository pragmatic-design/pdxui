/**
 * The auto-form gallery: a single-value lookup lists its options, and "edit first record" edits it.
 *
 * Typing «ro» in "City (server lookup)" lists nothing when pdx-form-template hands pdx-autocomplete its
 * options as `options`, since the autocomplete reads `suggestions`; or when, typed straight after load,
 * the loader's results arrive after the keystroke and never open the list. "Form (edit first record)"
 * renders an empty form when it is wired to no record, or when `record-id="1"` finds nothing because
 * getById compares strictly and the prop is a string.
 */
import { test, expect, type Page } from '@playwright/test';

const section = (page: Page, heading: string) =>
    page.locator('.cmp-gallery').getByRole('heading', { name: heading, exact: true }).locator('xpath=..');

test('"City (server lookup)": typing "ro" lists Roma, and choosing it fills the field', async ({ page }) => {
    await page.goto('/components/pdx-auto-form', { waitUntil: 'domcontentloaded' });
    const s = section(page, 'Server-side Lookup (autocomplete)');
    const input = s.locator('pdx-autocomplete input');
    await input.click();
    await input.pressSequentially('ro');
    const roma = page.getByRole('option', { name: 'Roma' });
    await expect(roma, 'the lookup listed nothing').toBeVisible();
    await roma.click();
    await expect(input).toHaveValue('Roma');
});

test('"Form (edit first record)" shows Alice, and saving an edit updates the grid', async ({ page }) => {
    await page.goto('/components/pdx-auto-form', { waitUntil: 'domcontentloaded' });
    const s = section(page, 'One JSON — Grid + Form + Filter');
    const name = s.locator('pdx-auto-form pdx-input[name="name"] input');
    await expect(name, 'the form is not wired to the first record').toHaveValue('Alice');
    await name.fill('Alicia');
    await s.locator('pdx-auto-form').getByRole('button', { name: 'Save' }).click();
    await expect(s.locator('pdx-data-grid').getByRole('row', { name: /Alicia/ })).toBeVisible();
});
