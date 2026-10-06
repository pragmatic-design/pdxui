/**
 * The props playground starts consistent with what it shows.
 *
 * On /components/pdx-badge the preview renders "5", so the `value` field reads 5 too: a seed that
 * reaches the element and the source must also reach the controls, even when they render before it.
 * And the source carries no child text such as "badge", which the badge would ignore — it renders
 * its value, and has no slot to put children in.
 */
import { test, expect, type Page } from '@playwright/test';

const control = (page: Page, name: string) =>
    page.locator('.pp-control').filter({ has: page.locator('.pp-label', { hasText: new RegExp(`^${name}$`) }) });
const source = (page: Page) => page.locator('.pp-source pdx-code');

test('the badge playground seeds its value field with what the preview shows', async ({ page }) => {
    await page.goto('/components/pdx-badge', { waitUntil: 'networkidle' });
    await expect(page.locator('.pp-stage pdx-badge')).toHaveText('5');
    await expect(control(page, 'value').locator('input')).toHaveValue('5');
});

test('the source of a component without a default slot has no child text', async ({ page }) => {
    await page.goto('/components/pdx-badge', { waitUntil: 'networkidle' });
    await expect(source(page)).toContainText('<pdx-badge value="5"></pdx-badge>');
});

test('every seed names a prop the component has: the avatar is seeded through alt', async ({ page }) => {
    // A seed of `name`, a prop pdx-avatar does not have, would give preview "?", field empty.
    await page.goto('/components/pdx-avatar', { waitUntil: 'networkidle' });
    await expect(control(page, 'alt').locator('input')).toHaveValue('Ada Lovelace');
    await expect(page.locator('.pp-stage pdx-avatar')).toHaveText('AL');
});

test('the bulk-actions playground starts with a selection, since at 0 the bar is hidden', async ({ page }) => {
    // The bar hides at count 0, as documented; an unseeded playground would show nothing.
    await page.goto('/components/pdx-bulk-actions', { waitUntil: 'networkidle' });
    await expect(page.locator('.pp-stage .pdx-bulk-actions')).toBeVisible();
    await expect(page.locator('.pp-stage .pdx-bulk-count')).toHaveText('3 selected');
});

test('the segmented playground shows its seeded options: an array prop has no control, and the seed reaches it', async ({ page }) => {
    // buildLive applies the seed, not only the props that have a control: `options` (an array) has
    // none, and without it the playground renders an empty radiogroup with no name.
    await page.goto('/components/pdx-segmented', { waitUntil: 'networkidle' });
    const group = page.locator('.pp-stage').getByRole('radiogroup', { name: 'View' });
    await expect(group.getByRole('radio')).toHaveCount(3);
    await expect(group.getByRole('radio', { name: 'Week' })).toHaveAttribute('aria-checked', 'true');
    await group.getByRole('radio', { name: 'Week' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(group.getByRole('radio', { name: 'Month' })).toHaveAttribute('aria-checked', 'true');
    await expect(source(page)).toContainText(`options='["Day","Week","Month"]'`);
});

test('the source of a component with a default slot keeps its content', async ({ page }) => {
    // The control: a button's children ARE its label, and must stay in the source and the preview.
    await page.goto('/components/pdx-button', { waitUntil: 'networkidle' });
    await expect(page.locator('.pp-stage pdx-button button')).toHaveText('button');
    await expect(source(page)).toContainText('>button</pdx-button>');
});
