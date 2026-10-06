/**
 * DIMENSION 5 — Visual regression (screenshots), data-driven from the manifests.
 *
 * It captures what the mathematics does NOT see: gradients, shadows, blur, font rendering.
 * DETERMINISTIC only in Docker (pinned fonts/Chromium) → run through playwright-docker.config.ts.
 * The baselines carry the -docker-linux suffix and are updated ONLY inside the container.
 *
 * Keep manifest.visual.scenarios to 1-2 per component: the geometry is covered by the
 * contracts (text, not PNGs); only purely visual regressions belong here.
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { goToScenario, applyTheme } from '../ui-components/contracts/measure';
import { freezeAnimations } from '../ui-components/contracts/assertions';
import { manifests, scenarioPage } from '../ui-components/contracts/generated/manifests';
import { THEMES, schemeFor } from '../../manifests/_themes';
import { PIXEL_THRESHOLD } from './pixel-threshold';

for (const m of manifests) {
    if (!m.visual) continue;
    const themes = m.themes ?? THEMES;

    // ── Focus: one EXTRA screenshot, with an element focused ──
    //
    // Without this the visual dimension looks at no focus state at all: it photographs the components
    // at rest and never interacts. The other four dimensions do not compare pixels, so a ring of the
    // wrong width, offset or colour passes all of them.
    //
    // The focus is set with `.focus()` and then TAKEN AGAIN from the keyboard (Shift+Tab, Tab):
    // `:focus-visible` is what the ring's CSS looks at, and the trip through the keyboard is what the
    // browser recognises as such, without depending on the heuristics of programmatic focus.
    for (const f of m.visual.focus ?? []) {
        const pageSlug = scenarioPage[f.scenario];
        const suffix = f.name ? `-focused-${f.name}` : '-focused';
        for (const theme of themes) {
            const scheme = schemeFor(theme);

            test(`visual: ${f.scenario}${suffix} [${theme}]`, async ({ page }) => {
                await goToScenario(page, f.scenario, theme, { page: pageSlug, scheme });
                // Freezing is not cosmetic here: the ring is a transitioned box-shadow, so the
                // frame right after focus is the START of that transition — transparent, radius 0.
                // Reading it there and calling it the resting state is a mistake worth naming: it
                // reports a ring that is not missing.
                await freezeAnimations(page);

                const target = page.locator(f.selector).first();
                await target.waitFor({ state: 'visible' });
                await target.focus();
                await page.keyboard.press('Shift+Tab');
                await page.keyboard.press('Tab');

                // If the trip through the keyboard did not bring the focus back where it belongs, the
                // baseline would photograph a component at rest and would pass forever without looking
                // at anything — which is the defect this runner exists because of.
                await expect(target, `${f.selector} is not focused`).toBeFocused();

                const section = page.locator('section[data-scenario]:not([hidden])').first();
                await expect(section).toHaveScreenshot(`${f.scenario}${suffix}-${theme}.png`, {
                    // A TIGHTER threshold than the resting screenshots, and this is the difference
                    // between a gate and a decoration. A focus ring is a thin outline around one
                    // small control: widening it by a pixel changes a few hundred pixels out of a
                    // hundred thousand — about 0.2%, comfortably under the 1% the resting baselines
                    // allow. Measured: at 0.01 the whole suite stays green with --pdx-focus-width
                    // moved from 3px to 4px, which is the exact change this screenshot exists to catch.
                    maxDiffPixelRatio: 0,
                    threshold: PIXEL_THRESHOLD,
                    mask: (m.visual!.mask ?? []).map((s) => page.locator(s)),
                    animations: 'disabled',
                    caret: 'hide',
                });
            });
        }
    }

    for (const scenarioId of m.visual.scenarios) {
        const pageSlug = scenarioPage[scenarioId];
        const scen = m.scenarios.find((s) => s.id === scenarioId);

        // A scenario with a `setup` reaches a STATE — a tooltip shown, a menu built. Reusing its
        // page would hand the next theme a component someone already opened, and a screenshot of
        // that is not the picture the baseline describes. Those keep a fresh page each.
        const reusable = !scen?.setup;

        function shoot(page: Page, theme: string) {
            // section[data-scenario] (the scenario's wrapper), NOT just any `section`: some
            // scenarios (scroll-spy, for one) hold nested content <section>s with no [hidden],
            // which .first() would otherwise capture.
            const target = page.locator('section[data-scenario]:not([hidden])').first();
            return expect(target).toHaveScreenshot(`${scenarioId}-${theme}.png`, {
                // 0 by default, and that is a measurement rather than a preference. At 0 the whole visual
                // dimension has 25 failures of 1591, and they are NOT spread across the suite: they come
                // from four scenarios carrying state or movement, each of which declares its own
                // tolerance and says why. Everything else is exact.
                //
                // A default of 0.01 sounds strict and is not: a 2px border on a wide section is about
                // 0.34% of its pixels, so every border, rule, divider, tab indicator and focus ring
                // would be invisible to this dimension — a magenta shell edge passes with no change
                // reported.
                maxDiffPixelRatio: m.visual!.maxDiffPixelRatio ?? 0,
                // How far one pixel's colour may move — pixel-threshold.ts, measured.
                threshold: PIXEL_THRESHOLD,
                mask: (m.visual!.mask ?? []).map((s) => page.locator(s)),
                animations: 'disabled',
                caret: 'hide',
            });
        }

        if (!reusable) {
            for (const theme of themes) {
                const scheme = schemeFor(theme);
                test(`visual: ${scenarioId} [${theme}]`, async ({ page }) => {
                    await goToScenario(page, scenarioId, theme, { page: pageSlug, scheme });
                    await freezeAnimations(page);
                    await shoot(page, theme);
                });
            }
            continue;
        }

        // Reused page, re-themed per test. `applyTheme` re-derives the behaviour attributes the way
        // core's setTheme does, and the pixels agree: setting `pdx-theme` alone is not enough, because
        // the CSS reads selectors like [pdx-card-style="elevated"][pdx-theme="playful"], and 36 of
        // 1591 screenshots differ without them.
        test.describe(`visual: ${scenarioId}`, () => {
            let shared: Page;
            let ctx: BrowserContext;

            test.beforeAll(async ({ browser }) => {
                ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
                shared = await ctx.newPage();
                await goToScenario(shared, scenarioId, themes[0], { page: pageSlug, scheme: schemeFor(themes[0]) });
                await freezeAnimations(shared);
            });
            test.afterAll(async () => { await ctx?.close(); });

            for (const theme of themes) {
                test(`visual: ${scenarioId} [${theme}]`, async () => {
                    await applyTheme(shared, theme, schemeFor(theme));
                    await expect(shared.locator('html')).toHaveAttribute('pdx-theme', theme);
                    await shoot(shared, theme);
                });
            }
        });
    }
}
