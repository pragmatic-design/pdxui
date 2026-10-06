/**
 * Validate Pragmatic Design CSS using r$.
 * This proves that r$ can catch real layout issues across viewport widths.
 */
import { test, expect } from '@playwright/test';
import { r$ } from '@responsivejs/design';

const PDX_URL = 'http://localhost:3333/demo/test-harness.html';
const WIDTHS = [320, 375, 768, 1024, 1280, 1440, 1920];

const ALL_SELECTORS = [
    // Pattern 1: Toolbar
    '[data-test="toolbar-title"]',
    '[data-test="toolbar-actions"]',
    '[data-test="toolbar-select"]',
    '[data-test="toolbar-btn-primary"]',
    '[data-test="toolbar-btn-secondary"]',
    // Pattern 2: Search
    '[data-test="search-field"]',
    '[data-test="search-input"]',
    '[data-test="search-btn"]',
    // Pattern 3: Stats
    '[data-test="stat-1"]',
    '[data-test="stat-2"]',
    '[data-test="stat-3"]',
    '[data-test="stat-4"]',
    // Pattern 4: Card grid
    '[data-test="card-1"]',
    '[data-test="card-2"]',
    '[data-test="card-3"]',
    '[data-test="card-title"]',
    '[data-test="card-edit"]',
    '[data-test="card-delete"]',
    // Pattern 5: Form
    '[data-test="form-input-1"]',
    '[data-test="form-input-2"]',
    '[data-test="form-actions"]',
    // Pattern 6: Split
    '[data-test="split-layout"]',
    '[data-test="split-sidebar"]',
    '[data-test="split-main"]',
    '[data-test="split-topbar"]',
    // Pattern 7: List
    '[data-test="list-row-1"]',
    '[data-test="list-row-2"]',
    '[data-test="list-container"]',
    // Pattern 8: Pagination
    '[data-test="page-info"]',
    '[data-test="page-buttons"]',
    // Buttons and inputs (for height/size checks)
    '.pdx-primary',
    '.pdx-secondary',
    '.pdx-ghost',
    '.pdx-danger',
    '.pdx-input',
];

test.describe('r$ validates PDX layout', () => {
    let rv: ReturnType<typeof r$>;

    test.beforeAll(async ({ browser }) => {
        const page = await browser.newPage();
        rv = r$(page);
        await rv.sweep({
            url: PDX_URL,
            widths: WIDTHS,
            selectors: ALL_SELECTORS,
        });
    });

    // ==================================================================
    // GLOBAL: No element should overflow viewport at ANY width
    // ==================================================================
    test('no overflow at any viewport width', () => {
        rv.assert.reset().noOverflow();
        const report = rv.report();
        if (!report.pass) {
            const summary = report.violations
                .map(v => `  @${v.width}px ${v.element}: ${v.detail}`)
                .join('\n');
            expect(report.pass, `Overflow violations:\n${summary}`).toBe(true);
        }
    });

    // ==================================================================
    // TOOLBAR: title and actions on same line at all widths >= 768
    // ==================================================================
    test('toolbar: title and actions same line (>= 768px)', () => {
        rv.assert.reset().sameLine(
            '[data-test="toolbar-title"]',
            '[data-test="toolbar-actions"]'
        );
        const report = rv.report();
        // Filter violations — only care about widths >= 768 (mobile may stack)
        const wideViolations = report.violations.filter(v => v.width >= 768);
        expect(wideViolations).toEqual([]);
    });

    // ==================================================================
    // TOOLBAR: select and button same height at all widths
    // ==================================================================
    test('toolbar: select and button same height', () => {
        rv.assert.reset().sameHeight(
            '[data-test="toolbar-select"]',
            '[data-test="toolbar-btn-primary"]'
        );
        const report = rv.report();
        expect(report.pass, report.violations.map(v => `@${v.width}: ${v.detail}`).join('\n')).toBe(true);
    });

    // ==================================================================
    // SEARCH: input and button same height
    // ==================================================================
    test('search: input and button same height', () => {
        rv.assert.reset().sameHeight(
            '[data-test="search-input"]',
            '[data-test="search-btn"]'
        );
        expect(rv.report().pass).toBe(true);
    });

    // ==================================================================
    // SEARCH: input and button on same line
    // ==================================================================
    test('search: input and button same line', () => {
        rv.assert.reset().sameLine(
            '[data-test="search-input"]',
            '[data-test="search-btn"]'
        );
        expect(rv.report().pass).toBe(true);
    });

    // ==================================================================
    // BUTTONS: minimum height 32px at all widths
    // ==================================================================
    test('all buttons >= 32px tall', () => {
        rv.assert.reset()
            .minSize('.pdx-primary', { height: 32 })
            .minSize('.pdx-secondary', { height: 32 })
            .minSize('.pdx-ghost', { height: 32 })
            .minSize('.pdx-danger', { height: 32 });
        expect(rv.report().pass).toBe(true);
    });

    // ==================================================================
    // CARD GRID: cards inside viewport at all widths
    // ==================================================================
    test('card grid: all cards inside viewport', () => {
        rv.assert.reset().noOverflow();
        const cardViolations = rv.report().violations.filter(v =>
            v.element?.includes('card-')
        );
        expect(cardViolations).toEqual([]);
    });

    // ==================================================================
    // SPLIT: sidebar narrower than main at widths >= 768
    // ==================================================================
    test('split: sidebar narrower than main (>= 768px)', () => {
        rv.assert.reset().proportion(
            '[data-test="split-sidebar"]',
            '[data-test="split-main"]',
            { min: 0.1, max: 0.5 }
        );
        const report = rv.report();
        const wideViolations = report.violations.filter(v => v.width >= 768);
        expect(wideViolations).toEqual([]);
    });

    // ==================================================================
    // PAGINATION: info and buttons on same visual line
    // ==================================================================
    test('pagination: info and buttons same line (>= 768px)', () => {
        rv.assert.reset().sameLine(
            '[data-test="page-info"]',
            '[data-test="page-buttons"]'
        );
        // On mobile, pagination wraps (responsive-correct). Only check >= 768px.
        const report = rv.report();
        const wideViolations = report.violations.filter(v => v.width >= 768);
        expect(wideViolations).toEqual([]);
    });

    // ==================================================================
    // LIST: rows contained inside card
    // ==================================================================
    test('list: rows inside container', () => {
        rv.assert.reset().contains(
            '[data-test="list-container"]',
            '[data-test="list-row-1"]'
        );
        expect(rv.report().pass).toBe(true);
    });

    // ==================================================================
    // RESPONSIVE: font-size never decreases as viewport grows
    // ==================================================================
    test('h1 font-size is monotonically non-decreasing', () => {
        rv.assert.reset().monotonic('[data-test="toolbar-title"]', 'fontSize', 'up');
        expect(rv.report().pass).toBe(true);
    });

    // ==================================================================
    // GAP UNIFORM: stack children have consistent spacing
    // ==================================================================
    test('stat cards: children have uniform gap', () => {
        rv.assert.reset().gapUniform('[data-test="stats-grid"]');
        expect(rv.report().pass).toBe(true);
    });

    // ==================================================================
    // CHILDREN CONTAINED: card grid children inside parent
    // ==================================================================
    test('card grid: children contained in grid', () => {
        rv.assert.reset().childrenContained('[data-test="card-grid"]');
        const report = rv.report();
        expect(report.pass, report.violations.map(v => `@${v.width}: ${v.detail}`).join('\n')).toBe(true);
    });

    // ==================================================================
    // CHILDREN EQUAL WIDTH: grid cells have similar width
    // ==================================================================
    test('stat cards: children have equal width', () => {
        rv.assert.reset().childrenEqualWidth('[data-test="stats-grid"]');
        const report = rv.report();
        // Filter — at 320px cards stack so widths are all 100% (uniform)
        expect(report.pass).toBe(true);
    });

    // ==================================================================
    // NO ZERO HEIGHT: all layout elements have height
    // ==================================================================
    test('no zero-height layout elements', () => {
        rv.assert.reset()
            .noZeroHeight('[data-test="stats-grid"]')
            .noZeroHeight('[data-test="card-grid"]')
            .noZeroHeight('[data-test="split-layout"]')
            .noZeroHeight('[data-test="list-container"]');
        expect(rv.report().pass).toBe(true);
    });

    // ==================================================================
    // CONTINUOUS: card width has no sudden jumps
    // ==================================================================
    test('card-1 width is continuous across viewports (no jumps > 200px)', () => {
        rv.assert.reset().continuous('[data-test="card-1"]', 'width', 200);
        expect(rv.report().pass).toBe(true);
    });

    // ==================================================================
    // SUMMARY: full report
    // ==================================================================
    test('full validation report', () => {
        rv.assert.reset()
            .noOverflow()
            .sameHeight('[data-test="toolbar-select"]', '[data-test="toolbar-btn-primary"]')
            .sameHeight('[data-test="search-input"]', '[data-test="search-btn"]')
            .sameLine('[data-test="search-input"]', '[data-test="search-btn"]')
            .sameLine('[data-test="page-info"]', '[data-test="page-buttons"]')
            .minSize('.pdx-primary', { height: 32 })
            .minSize('.pdx-input', { height: 32 })
            .monotonic('[data-test="toolbar-title"]', 'fontSize', 'up')
            .gapUniform('[data-test="stats-grid"]')
            .childrenContained('[data-test="card-grid"]')
            .childrenEqualWidth('[data-test="stats-grid"]')
            .noZeroHeight('[data-test="stats-grid"]')
            .continuous('[data-test="card-1"]', 'width', 200);

        const report = rv.report();
        // Filter out mobile-expected wrapping (sameLine violations < 768px are responsive-correct)
        const realViolations = report.violations.filter(v =>
            !(v.rule === 'sameLine' && v.width < 768)
        );
        if (realViolations.length > 0) {
            const summary = realViolations
                .map(v => `  [${v.rule}] @${v.width}px ${v.element || v.elements?.join('+')} — ${v.detail}`)
                .join('\n');
            console.log(`r$ PDX Validation:\n${summary}`);
        }
        console.log(`r$ PDX: ${report.passed}/${report.total} passed, ${realViolations.length} real violations across ${WIDTHS.length} viewports`);
    });
});
