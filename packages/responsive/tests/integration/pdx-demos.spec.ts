/**
 * Validate PDX demo pages with r$.
 * Tests real-world pages at realistic viewports.
 */
import { test, expect } from '@playwright/test';
import { r$ } from '@responsivejs/design';

const BASE = 'http://localhost:3333';
const WIDTHS = [320, 375, 768, 1024, 1280, 1440, 1920];

const PAGES = [
    { name: 'products', url: `${BASE}/demo/products.html`, selectors: ['h1', '.pdx-primary', '.pdx-secondary', '.pdx-ghost', '.pdx-danger', '.pdx-input', '.pdx-surface-card', 'pdx-row', 'pdx-grid', 'pdx-stack', 'pdx-center'] },
    { name: 'form', url: `${BASE}/demo/form.html`, selectors: ['h1', 'h2', '.pdx-primary', '.pdx-secondary', '.pdx-ghost', '.pdx-input', '.pdx-surface-card', 'pdx-row', 'pdx-grid', 'pdx-stack', 'pdx-center'] },
    { name: 'dashboard', url: `${BASE}/demo/dashboard.html`, selectors: ['h1', '.pdx-primary', '.pdx-ghost', '.pdx-input', '.pdx-surface-card', 'pdx-row', 'pdx-grid', 'pdx-split', 'pdx-stack'] },
    { name: 'showcase', url: `${BASE}/demo/showcase.html`, selectors: ['h1', '.pdx-primary', '.pdx-secondary', '.pdx-ghost', '.pdx-danger', '.pdx-input', '.pdx-surface-card', 'pdx-row', 'pdx-grid', 'pdx-stack', 'pdx-center'] },
];

for (const pg of PAGES) {
    test.describe(`${pg.name} page`, () => {

        let rv: ReturnType<typeof r$>;

        test.beforeAll(async ({ browser }) => {
            const page = await browser.newPage();
            rv = r$(page);
            await rv.sweep({ url: pg.url, widths: WIDTHS, selectors: pg.selectors });
        });

        test('no element overflows viewport', () => {
            rv.assert.reset().noOverflow();
            const report = rv.report();
            if (!report.pass) {
                const summary = report.violations
                    .map(v => `  @${v.width}px ${v.element}: ${v.detail}`)
                    .join('\n');
                expect(report.pass, `Overflow:\n${summary}`).toBe(true);
            }
        });

        test('all buttons >= 32px tall', () => {
            rv.assert.reset()
                .minSize('.pdx-primary', { height: 32 })
                .minSize('.pdx-secondary', { height: 32 })
                .minSize('.pdx-ghost', { height: 32 })
                .minSize('.pdx-danger', { height: 32 });
            const report = rv.report();
            expect(report.pass, report.violations.map(v => `@${v.width}: ${v.detail}`).join('\n')).toBe(true);
        });

        test('all inputs >= 32px tall', () => {
            rv.assert.reset().minSize('.pdx-input', { height: 32 });
            const report = rv.report();
            expect(report.pass, report.violations.map(v => `@${v.width}: ${v.detail}`).join('\n')).toBe(true);
        });

        test('no zero-height layout elements', () => {
            rv.assert.reset()
                .noZeroHeight('pdx-stack')
                .noZeroHeight('pdx-row')
                .noZeroHeight('pdx-grid');
            const report = rv.report();
            expect(report.pass, report.violations.map(v => `@${v.width}: ${v.element} ${v.detail}`).join('\n')).toBe(true);
        });
    });
}
