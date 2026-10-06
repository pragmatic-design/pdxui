/**
 * A component page's API section lists every prop, by the name a template binds.
 *
 * Listing the manifest's `attributes` only would miss the 95 props that are set as a property —
 * every array, object and function prop: pdx-auto-form's `fields`, `schema` and `source`, the props
 * it exists for. A prop's lowercase attribute (`headerheight`) is neither what a template binds
 * (`:headerHeight`) nor safe to bind. Descriptions render their inline code as code, a method
 * without JSDoc does not say "Imperative `expand()` method (call via a ref).", and events show
 * their detail.
 */
import { test, expect, type Page } from '@playwright/test';

async function openApi(page: Page, tag: string): Promise<void> {
    await page.goto(`/components/${tag}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.api .api-table').first().waitFor();
}

/** The Properties table as rows of cells' text, keyed by the first cell. */
async function propRows(page: Page): Promise<Record<string, string[]>> {
    return page.evaluate(() => {
        const h = Array.from(document.querySelectorAll('.api .api-h3')).find((x) => x.textContent?.trim().startsWith('Properties'));
        const table = h?.nextElementSibling as HTMLTableElement | null;
        const out: Record<string, string[]> = {};
        for (const tr of Array.from(table?.querySelectorAll('tbody tr') ?? [])) {
            const cells = Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? '');
            out[cells[0]] = cells;
        }
        return out;
    });
}

test('property-only props are listed, with no attribute', async ({ page }) => {
    await openApi(page, 'pdx-auto-form');
    const rows = await propRows(page);
    for (const prop of ['fields', 'schema', 'source']) {
        expect(rows[prop], `pdx-auto-form's Properties table has no "${prop}"`).toBeTruthy();
        expect(rows[prop][1], `"${prop}" is set as a property: it has no attribute`).toBe('');
    }
});

test('a prop is named as a template binds it, its attribute beside it', async ({ page }) => {
    await openApi(page, 'pdx-app-layout');
    const rows = await propRows(page);
    expect(rows.headerHeight, 'no headerHeight row').toBeTruthy();
    expect(rows.headerHeight[1]).toBe('headerheight');
    expect(rows.headerheight, 'the lowercase attribute is not a prop name').toBeUndefined();
});

test('inline code in a description renders as code, not as backticks', async ({ page }) => {
    await openApi(page, 'pdx-select');
    const cells = await page.locator('.api td').allTextContents();
    expect(cells.filter((t) => t.includes('`'))).toEqual([]);
    // maxTagCount's description quotes "N selected" and the like; the code spans are elements.
    expect(await page.locator('.api td code').count()).toBeGreaterThan(0);
});

test('an event shows its detail', async ({ page }) => {
    await openApi(page, 'pdx-auto-form');
    const row = page.locator('.api .api-table tr', { has: page.locator('td code', { hasText: 'pdx-submit' }) });
    await expect(row).toContainText('values');
    await expect(row).toContainText('valid');
});

test('a method with no JSDoc says nothing rather than repeating its name', async ({ page }) => {
    await openApi(page, 'pdx-auto-form');
    await expect(page.locator('.api td', { hasText: 'method (call via a ref)' })).toHaveCount(0);
});
