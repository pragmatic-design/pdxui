/**
 * The composite page — what the EYE judges a theme on.
 *
 * The manifest scenarios are the right thing to MEASURE and the wrong thing to LOOK AT: a
 * theme's personality only appears in composition. These tests keep the page honest — it has
 * to be a real screen, hosted under the same contract as the scenarios, and it has to react
 * to the theme like everything else.
 */
import { test, expect, type Page } from '@playwright/test';

const APP = '/packages/builder/index.html';

test.use({ viewport: { width: 1600, height: 1000 } });

async function openComposition(page: Page, query = ''): Promise<void> {
    await page.goto(`${APP}?component=composition${query}`);
    await page.waitForFunction(() => !!(globalThis as Record<string, unknown>).__pdx_builder);
}

/**
 * Stop the preview's transitions before reading a colour off it.
 *
 * `data-pdx-ready` means the page has mounted, not that it has finished moving. The composition
 * screen's primary button carries `transition: background 0.2s`, so a computed colour read at
 * ready is a point ON that curve, and it is a different point every run. Measured over six loads
 * of the SAME url — material/light gives 0.678, 0.770, 0.770, 0.770, 0.770 and 0.909 in oklab L,
 * and dark gives the same three values, so "dark must differ from light" fails roughly half the
 * time in a loaded run while passing on its own.
 *
 * Frozen, the same button reads `oklch(0.5 0.2 280)` every time. This is what `runOracle` already
 * does with `freezeAnimations` before it measures — the test measures under the same conditions
 * as the product.
 */
async function freezePreview(page: Page): Promise<void> {
    const frame = page.frames().find(f => f !== page.mainFrame());
    if (!frame) throw new Error('the preview frame is not attached');
    await frame.addStyleTag({
        content: '*,*::before,*::after{transition:none!important;animation:none!important}',
    });
}

test('it is offered in the picker and survives a reload from the URL', async ({ page }) => {
    await openComposition(page, '&theme=material');

    await expect(page.locator('[data-test="composition"]')).toHaveClass(/active/);
    const state = await page.evaluate(() => (globalThis as any).__pdx_builder.state());
    expect(state.component).toBe('composition');

    // It is NOT in the catalog, so the unknown-component fallback must not swallow it.
    expect(await page.evaluate(() => (document.querySelector('iframe') as HTMLIFrameElement).src))
        .toContain('composition.html');
});

test('it mounts under the same contract as the scenario pages', async ({ page }) => {
    await openComposition(page);
    const frame = page.frameLocator('[data-test="preview"]');
    await expect(frame.locator('html[data-pdx-ready]')).toHaveCount(1);
    // A screen, not a specimen: navigation, data, a form and destructive actions together.
    await expect(frame.locator('table.pdx-table')).toBeVisible();
    await expect(frame.locator('.pdx-field')).not.toHaveCount(0);
    await expect(frame.locator('button.pdx-danger')).toBeVisible();
});

test('the oracle measures it — and has far more to look at than an isolated scenario', async ({ page }) => {
    await openComposition(page, '&theme=material');
    const composite = await page.evaluate(async () => await (globalThis as any).__pdx_builder.measure());

    expect(composite.error).toBeUndefined();
    // NOT `pass === true`. Whether a composite screen passes is a property of the DESIGN
    // SYSTEM, not of this page or of the oracle — and with rendered contrast measured
    // correctly it does not: material's table header sits at 4.18:1 against the 4.5:1 AA
    // floor. Asserting a pass here would quietly pin that defect as acceptable.
    expect(composite.total).toBeGreaterThan(0);

    await page.goto(`${APP}?component=accordion&scenario=accordion-basic&theme=material`);
    await page.waitForFunction(() => !!(globalThis as Record<string, unknown>).__pdx_builder);
    const isolated = await page.evaluate(async () => await (globalThis as any).__pdx_builder.measure());

    expect(composite.total, 'the composite page is the broader sample').toBeGreaterThan(isolated.total);
});

/**
 * A THEME and a SCHEME show up in different places, so the test does not look for both in the
 * primary button. 12 of the 13 themes give `--pdx-color-primary` a single value rather than a
 * `light-dark()` pair — only `editorial` varies it — so the brand fill is deliberately the same
 * colour in both schemes, and the scheme shows on the surfaces instead. Measured on material,
 * frozen: btnBg oklch(0.5 0.2 280) in BOTH, while bodyBg goes 0.965 → 0.12 and cardBg 0.99 → 0.17.
 *
 * Asserting that the button differs between schemes would be false, and could only pass by reading
 * a colour mid-transition, where the noise differs often enough to look green. So it takes the
 * freeze and asking each half of the question where the answer actually lives.
 */
test('it reacts to the theme, in both schemes', async ({ page }) => {
    const readAll = async (): Promise<{ button: string; surface: string }> => {
        await freezePreview(page);
        return page.evaluate(() => {
            const doc = (document.querySelector('iframe') as HTMLIFrameElement).contentDocument!;
            const view = doc.defaultView!;
            const btn = doc.querySelector('button.pdx-primary')!;
            return {
                button: view.getComputedStyle(btn).backgroundColor,
                surface: view.getComputedStyle(doc.body).backgroundColor,
            };
        });
    };
    const settle = async (): Promise<void> => {
        await page.waitForFunction(() => !!(globalThis as Record<string, unknown>).__pdx_builder);
        await expect(page.frameLocator('[data-test="preview"]').locator('html[data-pdx-ready]')).toHaveCount(1);
    };

    await openComposition(page, '&theme=material&scheme=light');
    await settle();
    const materialLight = await readAll();

    // A different THEME repaints the brand fill.
    await page.goto(`${APP}?component=composition&theme=cyberpunk&scheme=light`);
    await settle();
    const cyberpunkLight = await readAll();
    expect(cyberpunkLight.button, 'a different theme must repaint the brand fill')
        .not.toBe(materialLight.button);

    // A different SCHEME repaints the ground it sits on.
    await page.goto(`${APP}?component=composition&theme=material&scheme=dark`);
    await settle();
    const materialDark = await readAll();
    expect(materialDark.surface, 'dark mode must repaint the page surface')
        .not.toBe(materialLight.surface);

    // And the reading is stable, which is what the freeze buys: re-reading the same frozen page
    // must give the same answer. Without it this file would measure a 200ms transition curve.
    expect(await readAll(), 'the same frozen preview read twice gave two answers').toEqual(materialDark);
});
