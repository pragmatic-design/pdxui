/**
 * The builder opens every component.
 *
 * For every component in the catalog, open the builder at that component's first scenario
 * and require two things: the preview iframe actually reaches its ready flag, and neither
 * the shell nor the previewed page logged a console error or threw.
 *
 * This asserts the SHELL, not the components: it is the builder's job to resolve a URL to
 * a scenario page and mount it. A failure here means the builder cannot show something the
 * contract suite can already measure.
 */
import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

interface CatalogComponent {
    name: string;
    page: string;
    scenarios: { id: string; title: string }[];
}

const catalogPath = new URL('../../ui/tests/scenarios/generated/catalog.json', import.meta.url);
const catalog: { components: CatalogComponent[] } = JSON.parse(readFileSync(catalogPath, 'utf8'));

// Components with no scenario have nothing to preview — the catalog should not contain any,
// and if one appears we want to see it named rather than silently skipped.
const withScenarios = catalog.components.filter(c => c.scenarios.length > 0);
const withoutScenarios = catalog.components.filter(c => c.scenarios.length === 0);

test('the catalog is non-empty and every component has at least one scenario', () => {
    expect(catalog.components.length).toBeGreaterThan(0);
    expect(withoutScenarios.map(c => c.name)).toEqual([]);
});

/**
 * The builder is a satellite of pdxui.com, not a separate product, and the identity is
 * SHARED (brand/brand.css) rather than copied. Asserting the rendered gold and the resolved
 * logo is what makes "shared" mean something: a stale copy of the lockup would still look
 * plausible, and the 403 that hid the logo behind a console error named no URL at all.
 */
test('the identity bar carries the shared brand, and every link leaves for the site', async ({ page }) => {
    await page.goto('/packages/builder/index.html');
    await page.waitForFunction(() => !!(globalThis as Record<string, unknown>).__pdx_builder);

    const brand = page.locator('.site-brand');
    await expect(brand).toHaveAttribute('href', 'https://pdxui.com/');
    await expect(page.locator('.brand-accent')).toHaveText('PDX');
    await expect(page.locator('.brand-ui')).toHaveText('UI');

    const mark = await page.evaluate(() => {
        const el = document.querySelector('.brand-logo') as HTMLElement;
        const url = getComputedStyle(el).backgroundImage.match(/url\("([^"]+)"\)/)?.[1] ?? '';
        return {
            url,
            scheme: document.documentElement.getAttribute('pdx-scheme'),
            gold: getComputedStyle(document.querySelector('.brand-accent')!).color,
        };
    });
    expect(mark.url, 'the logo must resolve, not 403').toContain('pragmatic-logo');
    const ok = await page.evaluate(async (u) => (await fetch(u)).ok, mark.url);
    expect(ok, `the logo at ${mark.url} must actually load`).toBe(true);

    // The builder follows the viewer's colour scheme, so the wordmark cannot be pinned to one
    // value — what has to hold is that it FOLLOWS: display gold on a dark bar, dark bronze on
    // a light one. Asserting a constant here would pass or fail on the runner's OS setting.
    const expected = mark.scheme === 'dark' ? 'rgb(242, 202, 80)' : 'rgb(138, 101, 18)';
    expect(mark.gold, `wordmark gold under pdx-scheme="${mark.scheme}"`).toBe(expected);

    // Nothing in the bar keeps the user inside the tool.
    const hrefs = await page.locator('.topbar-nav a').evaluateAll(els => els.map(e => e.getAttribute('href')));
    expect(hrefs.length).toBeGreaterThan(0);
    // The host parsed, not the prefix: `https://pdxui.com.evil.example` starts with it too (#72).
    expect(hrefs.every(h => { try { const u = new URL(h ?? ''); return u.protocol === 'https:' && u.hostname === 'pdxui.com'; } catch { return false; } })).toBe(true);
});

/** Collect console errors and uncaught exceptions from the page AND its iframes. */
function watchErrors(page: Page): string[] {
    const errors: string[] = [];
    page.on('console', (msg: ConsoleMessage) => {
        if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
    });
    page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
    return errors;
}

for (const c of withScenarios) {
    const scenario = c.scenarios[0].id;

    test(`${c.name} — renders ${scenario} with no console error`, async ({ page }) => {
        const errors = watchErrors(page);

        await page.goto(`/packages/builder/index.html?component=${c.name}&scenario=${scenario}`);

        // The shell resolved the catalog and settled on a selection.
        await expect(page.locator('html[data-builder-ready]')).toHaveCount(1);

        // The selection the URL asked for is the one on screen.
        await expect(page.locator('[data-test="crumb"]')).toHaveText(`${c.name} · ${scenario}`);

        // The preview page mounted its custom elements and ran the scenario setup.
        const frame = page.frameLocator('[data-test="preview"]');
        await expect(frame.locator('html[data-pdx-ready]')).toHaveCount(1);

        // The scenario the builder asked for is the visible one.
        await expect(frame.locator(`section[data-scenario="${scenario}"]`)).toBeVisible();

        expect(errors, `console errors while previewing ${c.name}/${scenario}`).toEqual([]);
    });
}
