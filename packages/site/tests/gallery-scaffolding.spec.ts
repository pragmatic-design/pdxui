/**
 * The galleries' demo scaffolding is styled, from the showcase's single source.
 *
 * Unstyled, on the production build: pdx-accordion's Reference table renders as
 * "PropDescription" and `mode"single" (default)…`; pdx-affix's Props table reads `offsettopNumber0`;
 * pdx-aspect-ratio's `.demo-grid` computes `display: block`, four ratio boxes 883 px wide each, the
 * section 2516 px tall. Re-declaring `.demo-row`/`.demo-stack` by hand on the site covers nothing else.
 *
 * Every component page is checked by component-pages.spec.ts, in the same visit it already makes;
 * the design galleries are checked here.
 */
import { test, expect, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unstyledScaffolding } from './scaffolding';

const WIDE = { width: 1440, height: 900 };

async function openGallery(page: Page, path: string): Promise<void> {
    await page.setViewportSize(WIDE);
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.locator('.cmp-gallery section, .design-gallery section').first().waitFor();
}

test('pdx-accordion: the Reference table is laid out as rows, a header above them', async ({ page }) => {
    await openGallery(page, '/components/pdx-accordion');
    const table = await page.locator('.cmp-gallery .options-table').first().evaluate((t) => {
        const header = t.querySelector('.opt-header') as HTMLElement;
        const rows = Array.from(t.querySelectorAll('.opt-row')) as HTMLElement[];
        const cells = (el: HTMLElement) => Array.from(el.children).map((c) => (c as HTMLElement).getBoundingClientRect());
        return {
            headerDisplay: getComputedStyle(header).display,
            headerBorder: getComputedStyle(header).borderBottomStyle,
            rowDisplay: getComputedStyle(rows[0]).display,
            // Side by side: the second cell starts to the right of where the first one ends.
            sideBySide: (() => { const c = cells(rows[0]); return c.length > 1 && c[1].left >= c[0].right; })(),
            rows: rows.length,
        };
    });
    expect(table.headerDisplay).toBe('grid');
    expect(table.headerBorder, 'the header is separated from the rows').not.toBe('none');
    expect(table.rowDisplay).toBe('grid');
    expect(table.sideBySide, 'a row\'s cells run together instead of sitting in columns').toBe(true);
    expect(table.rows).toBeGreaterThan(1);
});

test('pdx-affix: the Props table, a real <table>, has its cells apart', async ({ page }) => {
    await openGallery(page, '/components/pdx-affix');
    const table = await page.locator('.cmp-gallery .options-table > table').first().evaluate((t) => {
        const td = t.querySelector('tbody td') as HTMLElement;
        return { collapse: getComputedStyle(t).borderCollapse, padLeft: parseFloat(getComputedStyle(td).paddingLeft) };
    });
    expect(table.collapse).toBe('collapse');
    expect(table.padLeft, 'the cells touch: "offsettopNumber0"').toBeGreaterThan(0);
});

test('pdx-aspect-ratio: the demo grid is a grid with more than one column at 1440 px', async ({ page }) => {
    await openGallery(page, '/components/pdx-aspect-ratio');
    const grid = await page.locator('.cmp-gallery .demo-grid').first().evaluate((g) => {
        const cs = getComputedStyle(g);
        return { display: cs.display, columns: cs.gridTemplateColumns.split(' ').filter(Boolean).length };
    });
    expect(grid.display).toBe('grid');
    expect(grid.columns).toBeGreaterThan(1);
});

// The design topics, from the showcase pages the site ports — the source, not the generated index.
const designPages = new URL('../../compiler/demo/showcase-new/pages/', import.meta.url);
const topics = readdirSync(fileURLToPath(designPages))
    .filter((f) => /^design-[a-z-]+\.pdx$/.test(f))
    .map((f) => f.slice('design-'.length, -'.pdx'.length));

test.describe('every design gallery styles its scaffolding', () => {
    test('there are design pages to check', () => {
        expect(topics.length, 'no design-*.pdx pages found: this file would check nothing').toBeGreaterThan(20);
    });

    for (const topic of topics) {
        test(`/design/${topic}`, async ({ page }) => {
            await openGallery(page, `/design/${topic}`);
            expect(await page.evaluate(unstyledScaffolding)).toEqual([]);
        });
    }
});
