/**
 * Choice groups on the site, measured with getByRole in Chromium:
 * - /components/pdx-checkbox-group shows the checkbox-group gallery, not the checkbox one;
 * - the group's @pdx-change hears one event per click, with `values` — the child's event does not
 *   reach it, since a handler reading `values` throws on it;
 * - checkbox groups, radio groups and segmented controls are named, not anonymous groups, and
 *   pdx-segmented writes no aria-label="".
 */
import { test, expect } from '@playwright/test';

test('the checkbox-group page is its own gallery, and its group reports one change per click', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/components/pdx-checkbox-group', { waitUntil: 'networkidle' });

    const group = page.getByRole('group', { name: 'Interests' });
    await expect(group.getByRole('checkbox')).toHaveCount(4);
    const events = await group.evaluate((el) => {
        const seen: unknown[] = [];
        el.addEventListener('pdx-change', (e) => seen.push((e as CustomEvent).detail));
        (window as Window & { __groupEvents?: unknown[] }).__groupEvents = seen;
        return seen.length;
    });
    expect(events).toBe(0);

    await group.getByRole('checkbox', { name: 'Marketing' }).click();
    await expect(page.locator('[data-test="interests-out"]')).toHaveText('Selected: code, design, marketing');
    const seen = await page.evaluate(() => (window as Window & { __groupEvents?: unknown[] }).__groupEvents);
    expect(seen).toEqual([{ value: 'code,design,marketing', values: ['code', 'design', 'marketing'] }]);
    expect(errors, 'a handler reading e.detail.values threw').toEqual([]);
});

test('the radio groups are named by the pdx-label before them', async ({ page }) => {
    await page.goto('/components/pdx-radio', { waitUntil: 'networkidle' });
    await expect(page.getByRole('radiogroup', { name: 'Shipping Method' })).toHaveCount(1);
    await expect(page.getByRole('radiogroup', { name: 'Payment method' })).toHaveCount(1);
});

test('every segmented control is a named radiogroup, none with an empty aria-label', async ({ page }) => {
    await page.goto('/components/pdx-segmented', { waitUntil: 'networkidle' });
    // Every one, the props playground's included: its seed reaches an array prop with no control,
    // and without it the playground's is an empty, unnamed radiogroup.
    const groups = page.locator('pdx-segmented [role="radiogroup"]');
    const n = await groups.count();
    expect(n).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < n; i++) {
        await expect(groups.nth(i)).toHaveAccessibleName(/\S/);
        await expect(groups.nth(i)).not.toHaveAttribute('aria-label', '');
    }
});
