/**
 * No two .pdx files under the site's src/ derive the same custom-element tag.
 *
 * Both src/demos-authored/ (the pages written for the site) and src/demos/ (the ported showcase
 * pages) are under src/, which the component resolver scans. If `port-demos.mjs` copied the authored
 * pages into src/demos/, every build would print PDX_TAG_COLLISION_RESOLVER once per page:
 * `pdx-comp-calendar` taken by the copy, the original "not auto-importable" — a file colliding with
 * its own copy.
 *
 * It runs after the suite's web server has built the site, so src/demos/ is what the build just
 * generated. Node-side: no browser.
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { ComponentResolver } from '../../compiler/src/component-resolver';

const siteRoot = fileURLToPath(new URL('..', import.meta.url));

// The four pages are read from src/demos-authored/, not from a copy: each still renders as its
// component's gallery — the element itself, not the "being finalized" placeholder.
for (const name of ['calendar', 'json-editor', 'page-header', 'relation-picker']) {
    test(`/components/pdx-${name} renders its site-authored gallery`, async ({ page }) => {
        await page.goto(`/components/pdx-${name}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator(`.cmp-gallery pdx-comp-${name} section`).first()).toBeVisible();
        await expect(page.locator('.cmp-placeholder')).toHaveCount(0);
    });
}

test('the component resolver finds no tag claimed by two files under src/', () => {
    const resolver = new ComponentResolver();
    resolver.registerProjectComponents(siteRoot);
    expect(resolver.tags.length, 'the scan found no components: this would check nothing').toBeGreaterThan(100);
    expect(resolver.collisions.map((c) => c.message)).toEqual([]);
});
