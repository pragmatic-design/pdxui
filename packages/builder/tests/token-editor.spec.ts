/**
 * The token editor is for a HUMAN, so what it must get right is comprehension, not plumbing:
 * tokens grouped by what they do, and each row showing the value the browser actually
 * resolves — `1rem` means nothing, `16px` does.
 */
import { test, expect, type Page } from '@playwright/test';

const APP = '/packages/builder/index.html';

test.use({ viewport: { width: 1600, height: 1000 } });

async function openTokens(page: Page, query = ''): Promise<void> {
    await page.goto(`${APP}?mode=theme&name=tk&brand=%23c2185b${query}`);
    await page.waitForFunction(() => !!(globalThis as Record<string, unknown>).__pdx_builder);
    await page.locator('[data-test="tokens-box"] > summary').click();
}

test('tokens are grouped by what they do, not dumped as one list', async ({ page }) => {
    await openTokens(page);

    const groups = await page.locator('[data-group]').evaluateAll(els =>
        els.map(e => (e as HTMLElement).dataset.group));

    // The categories a designer thinks in. Losing one means a token became unreachable.
    expect(groups).toEqual(expect.arrayContaining([
        'surfaces', 'brand', 'semantic', 'space', 'radius', 'type', 'elevation', 'behaviour', 'ramps',
    ]));
});

test('a spacing token shows the pixels it resolves to, not the rem it is written in', async ({ page }) => {
    await openTokens(page);
    await page.locator('[data-group="space"] > summary').click();

    const shown = await page.locator('[data-group="space"] .tok-resolved').allTextContents();

    // The engine writes the scale in rem; a human needs the px.
    expect(shown.every(v => v.endsWith('px')), `got ${JSON.stringify(shown)}`).toBe(true);
    expect(shown.length).toBeGreaterThan(4);
    // A scale, not a flat list of the same value.
    expect(new Set(shown).size).toBeGreaterThan(4);
});

test('a colour token resolves light-dark() to the branch in force, and paints a swatch', async ({ page }) => {
    await openTokens(page);
    await page.locator('[data-group="brand"] > summary').click();

    const row = page.locator('[data-token-row="--pdx-color-primary"]');
    const resolved = await row.locator('.tok-resolved').textContent();

    // Declared as light-dark(...), shown as the single colour actually in use.
    expect(resolved).not.toContain('light-dark');
    expect(resolved).toMatch(/oklch|rgb/);

    const swatch = await row.locator('.tok-swatch').evaluate(el => getComputedStyle(el).backgroundColor);
    expect(swatch).toBe(resolved);
});

test('editing a token updates its resolved value live, and reset restores the generated one', async ({ page }) => {
    await openTokens(page);
    await page.locator('[data-group="brand"] > summary').click();

    const row = page.locator('[data-token-row="--pdx-color-primary"]');
    const generated = await row.locator('.tok-resolved').textContent();

    await row.locator('[data-token="--pdx-color-primary"]').fill('oklch(0.45 0.18 250)');
    await expect(row.locator('.tok-resolved')).toHaveText('oklch(0.45 0.18 250)');
    await expect(page.locator('.tokens-summary')).toContainText('1 overridden');

    await row.locator('[data-reset="--pdx-color-primary"]').click();
    await expect(row.locator('.tok-resolved')).toHaveText(generated!);
    await expect(page.locator('.tokens-summary')).toContainText('0 overridden');
    expect(await page.evaluate(() => (globalThis as any).__pdx_builder.state().draft.tokens)).toEqual({});
});

test('every group carries a line saying what it controls', async ({ page }) => {
    await openTokens(page);
    const hints = await page.locator('.tok-hint').allTextContents();
    expect(hints.length).toBeGreaterThanOrEqual(9);
    expect(hints.every(h => h.trim().length > 20)).toBe(true);
});
