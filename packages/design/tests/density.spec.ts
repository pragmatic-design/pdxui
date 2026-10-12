import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';

// `pdx-density` is the reader's choice, and it beats the theme's own density (#157).
//
// Seven themes set a default `--pdx-density-factor` (corporate, cupertino, cyberpunk, editorial,
// fluent, metro, neumorphic). The three `[pdx-density]` rules lived in `pdx.tokens`, an EARLIER layer
// than `pdx.themes`, so on those themes the attribute did nothing at all — the showcase hid it behind
// an inline style. They live in `pdx.preferences` now, after the themes.

const HARNESS = '/demo/test-harness.html';
const THEMES = readdirSync(fileURLToPath(new URL('../src/themes/', import.meta.url)))
    .filter((f) => f.endsWith('.css'))
    .map((f) => f.replace(/\.css$/, ''));

const CHOICES = { compact: 0.75, normal: 1, comfort: 1.25 } as const;

/** The computed `--pdx-density-factor` of `selector`, with `theme` on <html> and `density` where asked. */
async function factor(page: Page, theme: string, density: { on: 'html' | 'box'; value: string } | null): Promise<{ html: number; box: number }> {
    return page.evaluate(([theme, density]) => {
        const html = document.documentElement;
        html.setAttribute('pdx-theme', theme);
        html.removeAttribute('pdx-density');
        let box = document.getElementById('density-box');
        if (!box) {
            box = document.createElement('div');
            box.id = 'density-box';
            document.body.appendChild(box);
        }
        box.removeAttribute('pdx-density');
        if (density) (density.on === 'html' ? html : box).setAttribute('pdx-density', density.value);
        const read = (el: Element) => parseFloat(getComputedStyle(el).getPropertyValue('--pdx-density-factor').trim() || '1');
        return { html: read(html), box: read(box) };
    }, [theme, density] as const);
}

test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS);
});

test('control: the themes that set their own density are still there', async ({ page }) => {
    const own: string[] = [];
    for (const theme of THEMES) {
        const { html } = await factor(page, theme, null);
        if (html !== 1) own.push(theme);
    }
    // Without them this file measures nothing: the attribute would win on every theme by default.
    expect(own.length, `no theme sets its own density factor (${own.join(', ')})`).toBeGreaterThanOrEqual(7);
});

for (const theme of THEMES) {
    test(`${theme}: pdx-density on <html> sets the factor, over the theme's own`, async ({ page }) => {
        for (const [value, expected] of Object.entries(CHOICES)) {
            const { html } = await factor(page, theme, { on: 'html', value });
            expect(html, `${theme} with pdx-density="${value}"`).toBeCloseTo(expected, 5);
        }
    });
}

test('pdx-density on any element sets the factor for its subtree only', async ({ page }) => {
    const { html, box } = await factor(page, 'fluent', { on: 'box', value: 'comfort' });
    expect(box, 'the subtree did not take its own density').toBeCloseTo(1.25, 5);
    expect(html, 'the page took the subtree\'s density').not.toBeCloseTo(1.25, 5);
});
