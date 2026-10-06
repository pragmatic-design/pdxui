/**
 * Code on the site shows the characters to type, not programming ligatures.
 *
 * The site's mono stack starts with JetBrains Mono, which draws ligatures by default: in the accordion
 * gallery `<!-- Attributes -->` would render as "←!—— Attributes ——→". A reader copying a sample by eye
 * types what they see. Measured as the computed `font-variant-ligatures` of every kind of code block
 * the site has: a gallery sample, a pdx-code block (demos, props playground), a docs block (Shiki).
 */
import { test, expect, type Page } from '@playwright/test';

async function ligatures(page: Page, selector: string): Promise<{ variant: string; features: string }> {
    const el = page.locator(selector).first();
    await el.waitFor({ state: 'attached' });
    return el.evaluate((e) => {
        const cs = getComputedStyle(e);
        return { variant: cs.fontVariantLigatures, features: cs.fontFeatureSettings };
    });
}

test('a gallery code sample draws no ligatures', async ({ page }) => {
    await page.goto('/components/pdx-accordion', { waitUntil: 'domcontentloaded' });
    expect((await ligatures(page, '.cmp-gallery pre code')).variant).toBe('none');
});

test('a pdx-code block draws no ligatures', async ({ page }) => {
    // The landing page's samples are pdx-code blocks. (Every component page has a gallery, so no
    // component page shows one in its hero.)
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect((await ligatures(page, 'pdx-code pre')).variant).toBe('none');
});

test('a docs code block draws no ligatures', async ({ page }) => {
    await page.goto('/docs/router', { waitUntil: 'domcontentloaded' });
    expect((await ligatures(page, '.doc-body pre code')).variant).toBe('none');
});

test('inline code draws no ligatures either', async ({ page }) => {
    await page.goto('/docs/router', { waitUntil: 'domcontentloaded' });
    expect((await ligatures(page, '.doc-body p code')).variant).toBe('none');
});
