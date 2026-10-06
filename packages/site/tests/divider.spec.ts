/**
 * pdx-divider on the site, measured in Chromium.
 *
 * A second, CSS-only styling of the tag with width:100% makes every vertical divider take a whole
 * row: the Vertical demo would draw "Home | Products | About | Contact" as four stacked lines. On
 * /design/layout each divider keeps its text — "OR", "Section", "Dashed" — rather than a bare line.
 */
import { test, expect } from '@playwright/test';

test('the Vertical demo is one line of items', async ({ page }) => {
    await page.goto('/components/pdx-divider', { waitUntil: 'networkidle' });
    const row = page.locator('.demo-row').filter({ has: page.locator('pdx-divider[orientation="vertical"]') }).first();
    const tops = await row.locator(':scope > span').evaluateAll(spans => spans.map(s => Math.round(s.getBoundingClientRect().top)));
    expect(tops).toHaveLength(4);
    expect(new Set(tops).size, `the items sit on ${new Set(tops).size} lines: ${tops.join(', ')}`).toBe(1);
    const widths = await row.locator('pdx-divider').evaluateAll(ds => ds.map(d => d.getBoundingClientRect().width));
    for (const w of widths) expect(w).toBeLessThanOrEqual(40);
});

test('/design/layout: the dividers show their labels', async ({ page }) => {
    await page.goto('/design/layout', { waitUntil: 'networkidle' });
    for (const text of ['OR', 'Section', 'End', 'Dashed', 'Dotted']) {
        await expect(page.getByRole('separator').filter({ hasText: new RegExp(`^\\s*${text}\\s*$`) }), text).toBeVisible();
    }
    // The dashed one draws a dashed line.
    const dashed = page.getByRole('separator').filter({ hasText: /^\s*Dashed\s*$/ });
    const style = await dashed.locator('span').first().evaluate(s => getComputedStyle(s).borderTopStyle);
    expect(style).toBe('dashed');
});
