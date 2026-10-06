/**
 * What the galleries show matches what they say, measured in Chromium.
 *
 * - The banner's auto-dismiss example starts its 5 s timer at page load, so it is gone before a
 *   reader scrolls to it: a "Show again" button brings it back.
 * - design-tables draws sort indicators from `aria-sort`, the attribute a screen reader reads, not
 *   from `data-sort` only.
 * - design-forms writes no asterisk inside `.pdx-field-required`, which appends its own: not "Email * *".
 *
 * The file-level checks (competitor tables, reference tables, Italian) are in
 * `packages/core/tests/showcase-content.test.ts` and `docs-language.test.ts`.
 */
import { test, expect } from '@playwright/test';

test('the auto-dismiss banner can be shown again, and dismisses itself again', async ({ page }) => {
    await page.clock.install();
    await page.goto('/components/pdx-banner', { waitUntil: 'networkidle' });
    const banner = page.locator('pdx-banner[data-test="auto-dismiss"]');
    const replay = page.getByRole('button', { name: 'Show again' });

    await page.clock.runFor(6000);
    await expect(banner).toBeHidden();

    await replay.click();
    await expect(banner).toBeVisible();
    await page.clock.runFor(4000);
    await expect(banner, 'shown again, it keeps the full 5 s').toBeVisible();
    await page.clock.runFor(2000);
    await expect(banner).toBeHidden();
});

test('design-tables draws the sort indicator from aria-sort', async ({ page }) => {
    await page.goto('/design/tables', { waitUntil: 'networkidle' });
    const after = (sort: string) => page.locator(`th[aria-sort="${sort}"]`).first()
        .evaluate(el => getComputedStyle(el, '::after').content);
    expect(await after('ascending')).toBe('"↑"');
    expect(await after('descending')).toBe('"↓"');
    expect(await after('none')).toBe('"⇅"');
});

test('design-themes exports the breadcrumb separator as its text, not as a quoted CSS string', async ({ page }) => {
    await page.goto('/design/themes', { waitUntil: 'networkidle' });
    const block = page.locator('[data-test="dtcg"]');
    await expect(block).toContainText('$value');
    const separator = JSON.parse(await block.innerText()).pdx.breadcrumb.separator;
    expect(separator.$value).not.toMatch(/^['"]|['"]$/);
    // Chromium serialises the custom property with double quotes, whatever the stylesheet wrote.
    expect(separator.$extensions.pdx.quote).toMatch(/^['"]$/);
});

test('design-forms marks a required label with one asterisk', async ({ page }) => {
    await page.goto('/design/forms', { waitUntil: 'networkidle' });
    const label = page.locator('label.pdx-field-required', { hasText: 'Email' }).first();
    await expect(label).toHaveText('Email');
    expect(await label.evaluate(el => getComputedStyle(el, '::after').content)).toBe('" *"');
});
