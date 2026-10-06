import { test, expect } from '@playwright/test';
import { r$ } from '@responsivejs/design';

test.describe('r$ — Pragmatic ResponsiveJS', () => {

    test('sweep measures elements at multiple widths', async ({ page }) => {
        const r = r$(page);

        await r.sweep({
            url: `file://${process.cwd()}/integration/fixtures/test-page.html`,
            widths: [320, 768, 1280, 1920],
            selectors: ['h1', '.btn', '.card', '.toolbar', '.grid', '.input'],
        });

        // Should have snapshots at all 4 widths
        expect(r.widths).toEqual([320, 768, 1280, 1920]);

        // h1 should exist at every width
        for (const w of r.widths) {
            const h1 = r.at(w).rect('h1');
            expect(h1).toBeDefined();
            expect(h1!.width).toBeGreaterThan(0);
            expect(h1!.height).toBeGreaterThan(0);
        }
    });

    test('query styles at specific width', async ({ page }) => {
        const r = r$(page);

        await r.sweep({
            url: `file://${process.cwd()}/integration/fixtures/test-page.html`,
            widths: [1280],
            selectors: ['h1', '.btn'],
        });

        const fontSize = r.at(1280).style('h1', 'fontSize');
        expect(fontSize).toBeGreaterThan(0);

        const btnHeight = r.at(1280).rect('.btn');
        expect(btnHeight).toBeDefined();
        expect(btnHeight!.height).toBeGreaterThan(30);
    });

    test('curve tracks property across widths', async ({ page }) => {
        const r = r$(page);

        await r.sweep({
            url: `file://${process.cwd()}/integration/fixtures/test-page.html`,
            widths: [320, 768, 1280, 1920],
            selectors: ['h1'],
        });

        const fontCurve = r.curve('h1', 'fontSize');
        expect(fontCurve.size).toBe(4);

        // Font should be defined at all widths
        for (const [w, v] of fontCurve) {
            expect(v).toBeGreaterThan(0);
        }
    });

    test('assert.noOverflow passes on well-formed page', async ({ page }) => {
        const r = r$(page);

        await r.sweep({
            url: `file://${process.cwd()}/integration/fixtures/test-page.html`,
            widths: [320, 768, 1280, 1920],
            selectors: ['h1', '.btn', '.card', '.toolbar', '.grid'],
        });

        r.assert.noOverflow();
        const report = r.report();
        expect(report.pass).toBe(true);
    });

    test('assert.sameLine verifies toolbar alignment', async ({ page }) => {
        const r = r$(page);

        await r.sweep({
            url: `file://${process.cwd()}/integration/fixtures/test-page.html`,
            widths: [768, 1280, 1920],
            selectors: ['h1', '.btn'],
        });

        r.assert.sameLine('h1', '.btn');
        const report = r.report();
        expect(report.pass).toBe(true);
    });

    test('assert.minSize verifies button minimum height', async ({ page }) => {
        const r = r$(page);

        await r.sweep({
            url: `file://${process.cwd()}/integration/fixtures/test-page.html`,
            widths: [320, 768, 1280],
            selectors: ['.btn'],
        });

        r.assert.minSize('.btn', { height: 30 });
        const report = r.report();
        expect(report.pass).toBe(true);
    });

    test('assert.monotonic verifies font-size never decreases', async ({ page }) => {
        const r = r$(page);

        await r.sweep({
            url: `file://${process.cwd()}/integration/fixtures/test-page.html`,
            widths: [320, 375, 768, 1024, 1280, 1920],
            selectors: ['body'],
        });

        r.assert.monotonic('body', 'fontSize', 'up');
        const report = r.report();
        expect(report.pass).toBe(true);
    });

    test('report provides structured violation data', async ({ page }) => {
        const r = r$(page);

        await r.sweep({
            url: `file://${process.cwd()}/integration/fixtures/test-page.html`,
            widths: [1280],
            selectors: ['.btn'],
        });

        // This should pass — buttons are > 30px
        r.assert.minSize('.btn', { height: 30 });
        const passing = r.report();
        expect(passing.pass).toBe(true);
        expect(passing.violations).toHaveLength(0);

        // Reset and try an impossible constraint — should fail
        r.assert.reset();
        r.assert.minSize('.btn', { height: 100 });
        const failing = r.report();
        expect(failing.pass).toBe(false);
        expect(failing.violations.length).toBeGreaterThan(0);
        expect(failing.violations[0].rule).toBe('minSize');
        expect(failing.violations[0].width).toBe(1280);
    });
});
