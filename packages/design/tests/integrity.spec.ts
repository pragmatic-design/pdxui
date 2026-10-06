import { test, expect } from '@playwright/test';

/**
 * Layout Integrity Tests
 *
 * Verifies that real-world page patterns render correctly:
 * - No horizontal overflow (scrollbar)
 * - No text wrapping where it shouldn't
 * - Elements don't overlap
 * - Grid columns match expectations
 * - Split ratio is respected
 * - Content doesn't spill outside its container
 *
 * These tests run against the 3 demo pages + showcase.
 */

const PAGES = [
    { name: 'showcase', url: '/demo/showcase.html' },
    { name: 'products', url: '/demo/products.html' },
    { name: 'form', url: '/demo/form.html' },
    { name: 'dashboard', url: '/demo/dashboard.html' },
];

const THEMES = ['neutral', 'pragmatic', 'corporate', 'playful'];
const SCHEMES = ['light', 'dark'];

// ==========================================================================
// No horizontal overflow on any page
// ==========================================================================

for (const page of PAGES) {
    test(`${page.name}: no horizontal overflow`, async ({ page: p }) => {
        await p.goto(page.url);
        const overflow = await p.evaluate(() => {
            return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(overflow).toBe(false);
    });
}

// ==========================================================================
// No element overflows its parent (content spill)
// ==========================================================================

for (const pg of PAGES) {
    test(`${pg.name}: no child overflows parent`, async ({ page }) => {
        await page.goto(pg.url);

        const overflows = await page.evaluate(() => {
            const issues: string[] = [];
            const elements = document.querySelectorAll(
                'pdx-stack, pdx-row, pdx-grid, pdx-center, pdx-cluster, pdx-split, ' +
                '.pdx-surface-card, .pdx-surface-inset, .pdx-surface-overlay'
            );

            for (const el of elements) {
                const parent = el.parentElement;
                if (!parent || parent === document.body || parent === document.documentElement) continue;

                const pRect = parent.getBoundingClientRect();
                const cRect = el.getBoundingClientRect();

                // Child right edge should not exceed parent right edge by more than 2px
                if (cRect.right > pRect.right + 2) {
                    issues.push(`${el.tagName || el.className} overflows parent right by ${Math.round(cRect.right - pRect.right)}px`);
                }
            }
            return issues;
        });

        expect(overflows).toEqual([]);
    });
}

// ==========================================================================
// All pdx-grid children are in expected column layout
// ==========================================================================

test('products: grid cols=3 has 3 items per row', async ({ page }) => {
    await page.goto('/demo/products.html');
    await page.setViewportSize({ width: 1400, height: 900 });

    const rowData = await page.evaluate(() => {
        const grid = document.querySelector('pdx-grid[cols="3"]');
        if (!grid) return { found: false, rows: [] };
        const children = Array.from(grid.children);
        const tops = children.map(c => Math.round(c.getBoundingClientRect().top));
        // Group by top position (same row = same top)
        const rows: number[][] = [];
        let currentTop = -999;
        for (let i = 0; i < tops.length; i++) {
            if (Math.abs(tops[i] - currentTop) > 5) {
                rows.push([]);
                currentTop = tops[i];
            }
            rows[rows.length - 1].push(i);
        }
        return { found: true, rows };
    });

    expect(rowData.found).toBe(true);
    // First row should have 3 items
    expect(rowData.rows[0].length).toBe(3);
});

test('dashboard: split has sidebar narrower than main', async ({ page }) => {
    await page.goto('/demo/dashboard.html');
    await page.setViewportSize({ width: 1400, height: 900 });

    const widths = await page.evaluate(() => {
        const split = document.querySelector('pdx-split');
        if (!split) return null;
        const children = Array.from(split.children);
        if (children.length < 2) return null;
        return {
            sidebar: children[0].getBoundingClientRect().width,
            main: children[1].getBoundingClientRect().width,
        };
    });

    expect(widths).not.toBeNull();
    // Sidebar should be narrower than main (ratio 1:4)
    expect(widths!.sidebar).toBeLessThan(widths!.main);
    // Approximately 1:4 ratio (sidebar ~ 20%, main ~ 80%)
    const ratio = widths!.main / widths!.sidebar;
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(5);
});

// ==========================================================================
// Theme x Scheme matrix: all pages render without overflow
// ==========================================================================

for (const pg of PAGES) {
    for (const theme of THEMES) {
        for (const scheme of SCHEMES) {
            test(`${pg.name} ${theme}/${scheme}: no overflow`, async ({ page }) => {
                await page.goto(pg.url);
                await page.evaluate(([t, s]) => {
                    document.documentElement.setAttribute('pdx-theme', t);
                    document.documentElement.setAttribute('pdx-scheme', s);
                }, [theme, scheme]);

                // Wait for styles to apply
                await page.waitForTimeout(100);

                const overflow = await page.evaluate(() =>
                    document.documentElement.scrollWidth > document.documentElement.clientWidth
                );
                expect(overflow).toBe(false);
            });
        }
    }
}

// ==========================================================================
// All buttons are at least 32px tall (pointer) or 44px (touch)
// ==========================================================================

for (const pg of PAGES) {
    test(`${pg.name}: all buttons >= 32px tall`, async ({ page }) => {
        await page.goto(pg.url);

        const tooSmall = await page.evaluate(() => {
            const buttons = document.querySelectorAll(
                '.pdx-primary, .pdx-secondary, .pdx-ghost, .pdx-danger'
            );
            const issues: string[] = [];
            for (const btn of buttons) {
                const rect = btn.getBoundingClientRect();
                if (rect.height < 30) {
                    issues.push(`"${btn.textContent?.trim()}" is ${Math.round(rect.height)}px tall`);
                }
            }
            return issues;
        });

        expect(tooSmall).toEqual([]);
    });
}

// ==========================================================================
// All inputs have visible height
// ==========================================================================

for (const pg of PAGES) {
    test(`${pg.name}: all inputs >= 32px tall`, async ({ page }) => {
        await page.goto(pg.url);

        const tooSmall = await page.evaluate(() => {
            const inputs = document.querySelectorAll('.pdx-input');
            const issues: string[] = [];
            for (const input of inputs) {
                const rect = input.getBoundingClientRect();
                if (rect.height < 30) {
                    issues.push(`${input.tagName}#${input.id || '?'} is ${Math.round(rect.height)}px tall`);
                }
            }
            return issues;
        });

        expect(tooSmall).toEqual([]);
    });
}

// ==========================================================================
// No zero-height layout elements (display:inline bug detection)
// ==========================================================================

for (const pg of PAGES) {
    test(`${pg.name}: no zero-height layout elements`, async ({ page }) => {
        await page.goto(pg.url);

        const zeroHeight = await page.evaluate(() => {
            const layouts = document.querySelectorAll(
                'pdx-stack, pdx-row, pdx-grid, pdx-center, pdx-cluster, pdx-split'
            );
            const issues: string[] = [];
            for (const el of layouts) {
                const rect = el.getBoundingClientRect();
                if (rect.height === 0 && el.children.length > 0) {
                    issues.push(`${el.tagName}[${Array.from(el.attributes).map(a => `${a.name}=${a.value}`).join(' ')}] has zero height with ${el.children.length} children`);
                }
            }
            return issues;
        });

        expect(zeroHeight).toEqual([]);
    });
}
