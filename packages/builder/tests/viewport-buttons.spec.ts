/**
 * The viewport buttons must do the thing they are named after.
 *
 * Three ways they can fail, each measured on the running builder:
 *
 *  1. THE PREVIEW DISAPPEARS. `frameStyle` maps a cleared `frameReady` to `opacity: 0`. Every
 *     other setter changes the iframe's `src`, so the reload fires `@load`, which measures and
 *     sets the flag back. A width change does NOT change `src` — if `selectWidth` cleared the
 *     flag, nothing would reload, nothing would set it, and the preview would stay invisible
 *     until some other control is touched. Clicking 768 would blank the stage.
 *
 *  2. THE REQUESTED WIDTH IS SILENTLY CLIPPED. `.frame` is a flex item in `.stage`, so by default
 *     it shrinks to whatever is left. In a 1100px window the stage is 460px wide and "768" renders
 *     at 428px, with the stage not even scrolling (scrollWidth == clientWidth). The button looks
 *     applied — state set, button active — and the preview is at a width nobody asked for.
 *
 *  3. THE VERDICT CARRIES A WIDTH IT NEVER MEASURED. `BuilderReport extends OracleContext`, so
 *     the report can echo the REQUESTED width while `runOracle` measures `frame.clientWidth`. A
 *     report stamped 768 could be a measurement taken at 428. That is the damaging one: the
 *     oracle is the reason to trust the builder.
 *
 * The window here is deliberately too narrow for 768 and 1280 to fit.
 */
import { test, expect, type Page } from '@playwright/test';

const NARROW = { width: 1100, height: 900 };

/** Everything the buttons are supposed to control, read off the live page. */
async function stageState(page: Page) {
    return page.evaluate(() => {
        const frame = document.querySelector('[data-test="preview"]') as HTMLIFrameElement | null;
        const stage = frame?.parentElement ?? null;
        return {
            stateWidth: (globalThis as { __pdx_builder?: { state: () => { width: number } } })
                .__pdx_builder?.state().width ?? null,
            renderedWidth: frame ? Math.round(frame.getBoundingClientRect().width) : null,
            opacity: frame ? Number(getComputedStyle(frame).opacity) : null,
            stageWidth: stage ? Math.round(stage.getBoundingClientRect().width) : null,
            stageScrollWidth: stage ? stage.scrollWidth : null,
        };
    });
}

async function clickViewport(page: Page, label: string): Promise<void> {
    await page.locator('[data-test="viewports"] .ctl-btn', { hasText: new RegExp(`^${label}$`) }).click();
    await page.waitForTimeout(400);
}

async function openBuilder(page: Page): Promise<void> {
    await page.setViewportSize(NARROW);
    await page.goto('/packages/builder/index.html');
    await expect(page.locator('[data-test="preview"]')).toBeVisible();
    // The first frame load measures, which is what makes the preview visible to begin with.
    await expect.poll(async () => (await stageState(page)).opacity, { timeout: 15_000 }).toBe(1);
}

test('the preview stays visible after every viewport change', async ({ page }) => {
    await openBuilder(page);

    for (const label of ['390', '768', '1280', 'Fill']) {
        await clickViewport(page, label);
        const s = await stageState(page);
        expect(s.opacity, `the preview went invisible after clicking ${label}`).toBe(1);
    }
});

test('a viewport the stage cannot fit is scrolled to, not shrunk away', async ({ page }) => {
    await openBuilder(page);

    await clickViewport(page, '768');
    const s = await stageState(page);

    expect(s.stateWidth, 'the button did not register at all').toBe(768);
    // The premise of this test: the stage really is too narrow, so shrinking is observable.
    expect(s.stageWidth, 'the window is wide enough to fit 768 — the test proves nothing here')
        .toBeLessThan(768);
    expect(s.renderedWidth, 'the preview was shrunk to fit instead of being shown at 768')
        .toBe(768);
    expect(s.stageScrollWidth, 'the stage does not scroll, so most of the preview is unreachable')
        .toBeGreaterThanOrEqual(768);
});

test('the report names the width it actually measured', async ({ page }) => {
    await openBuilder(page);

    await clickViewport(page, '768');
    const report = await page.evaluate(async () => {
        const api = (globalThis as {
            __pdx_builder?: { measure: () => Promise<{ width: number } | null> };
        }).__pdx_builder;
        return api ? await api.measure() : null;
    });
    const s = await stageState(page);

    expect(report, 'the oracle produced no report').not.toBeNull();
    expect(report!.width, 'the verdict is stamped with a viewport the preview was never at')
        .toBe(s.renderedWidth);
});
