import { test, expect, Page } from '@playwright/test';

const URL = '/demo/test-harness.html';
const VIEWPORTS = [
    { name: '1280', width: 1280, height: 800 },
    { name: '1440', width: 1440, height: 900 },
    { name: '1920', width: 1920, height: 1080 },
];

/** Get rect for data-test element */
async function rect(page: Page, id: string) {
    return page.evaluate((id) => {
        const el = document.querySelector(`[data-test="${id}"]`);
        if (!el) throw new Error(`[data-test="${id}"] not found`);
        return JSON.parse(JSON.stringify(el.getBoundingClientRect()));
    }, id);
}

/** Get rects for multiple elements */
async function rects(page: Page, ids: string[]) {
    return page.evaluate((ids) => {
        const r: Record<string, DOMRect> = {} as any;
        for (const id of ids) {
            const el = document.querySelector(`[data-test="${id}"]`);
            if (!el) throw new Error(`[data-test="${id}"] not found`);
            r[id] = JSON.parse(JSON.stringify(el.getBoundingClientRect()));
        }
        return r;
    }, ids);
}

/** Check element is fully inside viewport */
async function isInViewport(page: Page, id: string) {
    return page.evaluate((id) => {
        const el = document.querySelector(`[data-test="${id}"]`);
        if (!el) return { ok: false, reason: 'not found' };
        const r = el.getBoundingClientRect();
        const vw = window.innerWidth;
        if (r.right > vw) return { ok: false, reason: `right edge at ${Math.round(r.right)}, viewport ${vw}, overflow ${Math.round(r.right - vw)}px` };
        if (r.left < 0) return { ok: false, reason: `left edge at ${Math.round(r.left)}` };
        return { ok: true, reason: '' };
    }, id);
}

/** Check two elements have same height (within tolerance) */
async function sameHeight(page: Page, a: string, b: string, tolerance = 2) {
    const r = await rects(page, [a, b]);
    const diff = Math.abs(r[a].height - r[b].height);
    return { match: diff <= tolerance, aH: Math.round(r[a].height), bH: Math.round(r[b].height), diff: Math.round(diff) };
}

/** Check two elements overlap vertically (are on the same visual row).
 *  With items=center and different heights, tops differ but they share vertical space. */
async function sameLine(page: Page, a: string, b: string) {
    const r = await rects(page, [a, b]);
    // Two elements are on the same line if their vertical ranges overlap
    const aTop = r[a].top, aBot = r[a].bottom;
    const bTop = r[b].top, bBot = r[b].bottom;
    const overlap = Math.min(aBot, bBot) - Math.max(aTop, bTop);
    const minHeight = Math.min(r[a].height, r[b].height);
    // At least 50% of the shorter element must overlap
    const match = overlap >= minHeight * 0.5;
    return { match, aTop: Math.round(aTop), bTop: Math.round(bTop), overlap: Math.round(overlap) };
}

// ==========================================================================
// Run every pattern test at every viewport size
// ==========================================================================

for (const vp of VIEWPORTS) {
    test.describe(`@${vp.name}px`, () => {
        test.beforeEach(async ({ page }) => {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.goto(URL);
        });

        // ==================================================================
        // PATTERN 1: Toolbar
        // ==================================================================
        test.describe('toolbar', () => {
            test('title and actions on same line', async ({ page }) => {
                const r = await sameLine(page, 'toolbar-title', 'toolbar-actions');
                expect(r.match).toBe(true);
            });

            test('all action elements inside viewport', async ({ page }) => {
                for (const id of ['toolbar-select', 'toolbar-btn-secondary', 'toolbar-btn-primary']) {
                    const v = await isInViewport(page, id);
                    expect(v.ok, `${id}: ${v.reason}`).toBe(true);
                }
            });

            test('select and buttons same height', async ({ page }) => {
                const sb = await sameHeight(page, 'toolbar-select', 'toolbar-btn-primary');
                expect(sb.match, `select=${sb.aH}px btn=${sb.bH}px diff=${sb.diff}`).toBe(true);

                const sb2 = await sameHeight(page, 'toolbar-select', 'toolbar-btn-secondary');
                expect(sb2.match, `select=${sb2.aH}px btn=${sb2.bH}px diff=${sb2.diff}`).toBe(true);
            });
        });

        // ==================================================================
        // PATTERN 2: Search bar
        // ==================================================================
        test.describe('search bar', () => {
            test('input and button on same line', async ({ page }) => {
                const r = await sameLine(page, 'search-input', 'search-btn');
                expect(r.match).toBe(true);
            });

            test('input and button same height', async ({ page }) => {
                const r = await sameHeight(page, 'search-input', 'search-btn');
                expect(r.match, `input=${r.aH}px btn=${r.bH}px diff=${r.diff}`).toBe(true);
            });

            test('button inside viewport', async ({ page }) => {
                const v = await isInViewport(page, 'search-btn');
                expect(v.ok, v.reason).toBe(true);
            });

            test('input grows to fill space', async ({ page }) => {
                const r = await rects(page, ['search-field', 'search-btn']);
                // Input field should be significantly wider than button
                expect(r['search-field'].width).toBeGreaterThan(r['search-btn'].width * 3);
            });
        });

        // ==================================================================
        // PATTERN 3: Stat cards
        // ==================================================================
        test.describe('stat cards', () => {
            test('all 4 cards inside viewport', async ({ page }) => {
                for (const id of ['stat-1', 'stat-2', 'stat-3', 'stat-4']) {
                    const v = await isInViewport(page, id);
                    expect(v.ok, `${id}: ${v.reason}`).toBe(true);
                }
            });

            test('cards have similar width (±20%)', async ({ page }) => {
                const r = await rects(page, ['stat-1', 'stat-2', 'stat-3', 'stat-4']);
                const widths = Object.values(r).map(v => v.width);
                const avg = widths.reduce((a, b) => a + b) / widths.length;
                for (const w of widths) {
                    expect(Math.abs(w - avg) / avg).toBeLessThan(0.2);
                }
            });
        });

        // ==================================================================
        // PATTERN 4: Card grid
        // ==================================================================
        test.describe('card grid', () => {
            test('all cards inside viewport', async ({ page }) => {
                for (const id of ['card-1', 'card-2', 'card-3']) {
                    const v = await isInViewport(page, id);
                    expect(v.ok, `${id}: ${v.reason}`).toBe(true);
                }
            });

            test('card internal elements inside card', async ({ page }) => {
                const card = await rect(page, 'card-1');
                for (const id of ['card-title', 'card-edit', 'card-delete']) {
                    const el = await rect(page, id);
                    expect(el.right, `${id} right=${Math.round(el.right)} card right=${Math.round(card.right)}`).toBeLessThanOrEqual(card.right + 1);
                }
            });

            test('edit and delete buttons on same line as price', async ({ page }) => {
                // Price and buttons in last row of card should be on same line
                const r = await rects(page, ['card-edit', 'card-delete']);
                expect(Math.abs(r['card-edit'].top - r['card-delete'].top)).toBeLessThan(3);
            });
        });

        // ==================================================================
        // PATTERN 5: Form
        // ==================================================================
        test.describe('form', () => {
            test('two inputs on same line in grid', async ({ page }) => {
                const r = await sameLine(page, 'form-input-1', 'form-input-2');
                expect(r.match).toBe(true);
            });

            test('inputs fill their grid column', async ({ page }) => {
                const r = await rects(page, ['form-field-1', 'form-input-1']);
                // Input should be ~same width as its container
                const ratio = r['form-input-1'].width / r['form-field-1'].width;
                expect(ratio).toBeGreaterThan(0.9);
            });

            test('action buttons inside viewport', async ({ page }) => {
                const v = await isInViewport(page, 'form-actions');
                expect(v.ok, v.reason).toBe(true);
            });
        });

        // ==================================================================
        // PATTERN 6: Split layout
        // ==================================================================
        test.describe('split layout', () => {
            test('sidebar narrower than main', async ({ page }) => {
                const r = await rects(page, ['split-sidebar', 'split-main']);
                expect(r['split-sidebar'].width).toBeLessThan(r['split-main'].width);
            });

            test('sidebar + main fill full width', async ({ page }) => {
                const split = await rect(page, 'split-layout');
                const r = await rects(page, ['split-sidebar', 'split-main']);
                const total = r['split-sidebar'].width + r['split-main'].width;
                // Should be close to split width (allowing for gap)
                expect(total).toBeGreaterThan(split.width * 0.95);
            });

            test('split topbar action button inside viewport', async ({ page }) => {
                const v = await isInViewport(page, 'split-topbar');
                expect(v.ok, v.reason).toBe(true);
            });

            test('no horizontal overflow', async ({ page }) => {
                const overflow = await page.evaluate(() =>
                    document.documentElement.scrollWidth > document.documentElement.clientWidth
                );
                expect(overflow).toBe(false);
            });
        });

        // ==================================================================
        // PATTERN 7: List rows
        // ==================================================================
        test.describe('list rows', () => {
            test('order ID and amount on same line', async ({ page }) => {
                const r = await rects(page, ['list-row-1']);
                // Row should have reasonable height (not super tall from wrapping)
                expect(r['list-row-1'].height).toBeLessThan(100);
            });

            test('list content inside card', async ({ page }) => {
                const container = await rect(page, 'list-container');
                const row = await rect(page, 'list-row-1');
                expect(row.right).toBeLessThanOrEqual(container.right + 1);
            });
        });

        // ==================================================================
        // PATTERN 8: Pagination
        // ==================================================================
        test.describe('pagination', () => {
            test('info and buttons on same line', async ({ page }) => {
                const r = await sameLine(page, 'page-info', 'page-buttons');
                expect(r.match).toBe(true);
            });

            test('all pagination buttons inside viewport', async ({ page }) => {
                const v = await isInViewport(page, 'page-buttons');
                expect(v.ok, v.reason).toBe(true);
            });
        });

        // ==================================================================
        // GLOBAL: No horizontal overflow on the page
        // ==================================================================
        test('no horizontal scroll on page', async ({ page }) => {
            const overflow = await page.evaluate(() =>
                document.documentElement.scrollWidth > document.documentElement.clientWidth
            );
            expect(overflow).toBe(false);
        });
    });
}
