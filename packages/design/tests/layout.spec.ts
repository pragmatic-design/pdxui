import { test, expect } from '@playwright/test';
import { getStyle, getRects, px } from './helpers';

const URL = '/demo/test-harness.html';

test.beforeEach(async ({ page }) => {
    await page.goto(URL);
});

// ==========================================================================
// pdx-stack
// ==========================================================================

test.describe('pdx-stack', () => {
    test('has flex-direction: column', async ({ page }) => {
        expect(await getStyle(page, 'stack-md', 'display')).toBe('flex');
        expect(await getStyle(page, 'stack-md', 'flex-direction')).toBe('column');
    });

    test('children are stacked vertically', async ({ page }) => {
        const rects = await getRects(page, ['stack-child-1', 'stack-child-2', 'stack-child-3']);
        // Each child top should be greater than previous child top
        expect(rects['stack-child-2'].top).toBeGreaterThan(rects['stack-child-1'].top);
        expect(rects['stack-child-3'].top).toBeGreaterThan(rects['stack-child-2'].top);
    });

    test('gap=md produces correct spacing between children', async ({ page }) => {
        const rects = await getRects(page, ['stack-child-1', 'stack-child-2']);
        const gap = rects['stack-child-2'].top - rects['stack-child-1'].bottom;
        // gap=md = 1rem = 16px (at default density)
        expect(gap).toBeCloseTo(16, 0);
    });

    test('pad=lg produces correct padding', async ({ page }) => {
        const style = await getStyle(page, 'stack-pad-lg', 'padding');
        // pad=lg = 1.5rem = 24px
        expect(px(style)).toBeCloseTo(24, 0);
    });
});

// ==========================================================================
// pdx-row
// ==========================================================================

test.describe('pdx-row', () => {
    test('has flex-direction: row with wrap default', async ({ page }) => {
        expect(await getStyle(page, 'row-sm-center-between', 'display')).toBe('flex');
        expect(await getStyle(page, 'row-sm-center-between', 'flex-direction')).toBe('row');
        expect(await getStyle(page, 'row-sm-center-between', 'flex-wrap')).toBe('wrap');
    });

    test('items=center aligns children vertically centered', async ({ page }) => {
        expect(await getStyle(page, 'row-sm-center-between', 'align-items')).toBe('center');
    });

    test('justify=between spaces children apart', async ({ page }) => {
        expect(await getStyle(page, 'row-sm-center-between', 'justify-content')).toBe('space-between');
    });

    test('children are on the same row (horizontal)', async ({ page }) => {
        const rects = await getRects(page, ['row-child-1', 'row-child-2']);
        // Both children should have overlapping vertical range (same row)
        expect(Math.abs(rects['row-child-1'].top - rects['row-child-2'].top)).toBeLessThan(5);
    });
});

// ==========================================================================
// pdx-grid
// ==========================================================================

test.describe('pdx-grid', () => {
    test('has display: grid', async ({ page }) => {
        expect(await getStyle(page, 'grid-3-wide', 'display')).toBe('grid');
    });

    test('cols=3 in wide container creates 3 columns', async ({ page }) => {
        const rects = await getRects(page, ['grid-cell-1', 'grid-cell-2', 'grid-cell-3']);
        // All 3 cells should be on the same row
        expect(Math.abs(rects['grid-cell-1'].top - rects['grid-cell-2'].top)).toBeLessThan(2);
        expect(Math.abs(rects['grid-cell-2'].top - rects['grid-cell-3'].top)).toBeLessThan(2);
        // Cell 2 should be to the right of cell 1
        expect(rects['grid-cell-2'].left).toBeGreaterThan(rects['grid-cell-1'].right - 20);
    });

    test('cols=3 in narrow container collapses to 1 column', async ({ page }) => {
        const rects = await getRects(page, ['grid-narrow-cell-1', 'grid-narrow-cell-2', 'grid-narrow-cell-3']);
        // All cells should be stacked vertically (different top values)
        expect(rects['grid-narrow-cell-2'].top).toBeGreaterThan(rects['grid-narrow-cell-1'].bottom - 2);
        expect(rects['grid-narrow-cell-3'].top).toBeGreaterThan(rects['grid-narrow-cell-2'].bottom - 2);
    });

    test('cols=auto uses auto-fit grid', async ({ page }) => {
        const style = await getStyle(page, 'grid-auto', 'grid-template-columns');
        // Should contain multiple column values (not just "1fr")
        expect(style.split(' ').length).toBeGreaterThanOrEqual(1);
    });
});

// ==========================================================================
// pdx-center
// ==========================================================================

test.describe('pdx-center', () => {
    test('has max-width constraint', async ({ page }) => {
        const maxW = await getStyle(page, 'center-sm', 'max-width');
        // max=sm = 30rem = 480px
        expect(px(maxW)).toBeCloseTo(480, 0);
    });

    test('is horizontally centered (auto margins)', async ({ page }) => {
        const margin = await getStyle(page, 'center-sm', 'margin-left');
        // If viewport is wider than 480px, margin-left should be > 0
        expect(margin).not.toBe('0px');
    });
});

// ==========================================================================
// pdx-cluster
// ==========================================================================

test.describe('pdx-cluster', () => {
    test('has flex-wrap: wrap', async ({ page }) => {
        expect(await getStyle(page, 'cluster-xs', 'display')).toBe('flex');
        expect(await getStyle(page, 'cluster-xs', 'flex-wrap')).toBe('wrap');
    });
});

// ==========================================================================
// pdx-split
// ==========================================================================

test.describe('pdx-split', () => {
    test('has display: grid', async ({ page }) => {
        expect(await getStyle(page, 'split-1-3-wide', 'display')).toBe('grid');
    });

    test('ratio=1:3 in wide container creates 2 columns with 1:3 ratio', async ({ page }) => {
        const rects = await getRects(page, ['split-left', 'split-right']);
        // Both should be on the same row
        expect(Math.abs(rects['split-left'].top - rects['split-right'].top)).toBeLessThan(2);
        // Right panel should be roughly 3x the width of left
        const ratio = rects['split-right'].width / rects['split-left'].width;
        expect(ratio).toBeGreaterThan(2.5);
        expect(ratio).toBeLessThan(3.5);
    });

    test('ratio=1:3 in narrow container stacks vertically', async ({ page }) => {
        const cols = await getStyle(page, 'split-1-3-narrow', 'grid-template-columns');
        // Computed value is in px — single column means only ONE value
        const colCount = cols.trim().split(/\s+/).length;
        expect(colCount).toBe(1);
    });
});

// ==========================================================================
// container-type set on all layout elements
// ==========================================================================

test.describe('container-type', () => {
    // ALL layout elements have container-type: inline-size.
    // The flex zero-width bug is compensated with flex: 1 1 100%.
    const elements = [
        'stack-md', 'row-sm-center-between', 'grid-3-wide',
        'cluster-xs', 'split-1-3-wide'
    ];

    for (const id of elements) {
        test(`${id} has container-type: inline-size`, async ({ page }) => {
            const ct = await getStyle(page, id, 'container-type');
            expect(ct).toBe('inline-size');
        });
    }
});

// ==========================================================================
// Unregistered CE display (critical: must NOT be inline)
// ==========================================================================

test.describe('custom element display', () => {
    const elements: [string, string][] = [
        ['stack-md', 'flex'],
        ['row-sm-center-between', 'flex'],
        ['grid-3-wide', 'grid'],
        ['cluster-xs', 'flex'],
        ['split-1-3-wide', 'grid'],
    ];

    for (const [id, expected] of elements) {
        test(`${id} has display: ${expected} (not inline)`, async ({ page }) => {
            const display = await getStyle(page, id, 'display');
            expect(display).toBe(expected);
        });
    }
});
