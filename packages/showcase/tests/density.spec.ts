/**
 * The density the visitor picks reaches the page, over a theme that sets its own (#157).
 *
 * The density is the design system's `pdx-density` attribute. Its rules were in a layer BEFORE the
 * themes, so on the seven themes with a density of their own the attribute did nothing, and the app
 * wrote the factor inline instead. They are in `pdx.preferences` now, after the themes, and the app
 * sets the attribute alone.
 *
 * Run against the build AND the dev server (`playwright.dev.config.ts` matches this file too): the
 * old workaround was explained as «Vite does not propagate attribute selectors», which only a dev
 * run can settle.
 */
import { test, expect, type Page } from './fixture';

/**
 * Give the app's theme a density of its own, the way seven shipped themes do — fluent.css declares
 * `--pdx-density-factor: 0.9` on `[pdx-theme="fluent"]` — in the layer the themes live in.
 *
 * The showcase loads one theme, `pragmatic`, which declares none, and a theme switched on at runtime
 * brings no stylesheet with it. So the conflict is reproduced where it happens: a declaration in
 * `pdx.themes`, against the real stylesheet the build (or the dev server) serves.
 */
async function giveTheThemeADensity(page: Page): Promise<void> {
    await page.addStyleTag({ content: '@layer pdx.themes { [pdx-theme="pragmatic"] { --pdx-density-factor: 0.9; } }' });
}

/** The page's computed density factor, and whether anything writes one inline. */
async function densityState(page: Page): Promise<{ factor: number; inline: string }> {
    return page.evaluate(() => ({
        factor: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pdx-density-factor')),
        inline: document.documentElement.style.getPropertyValue('--pdx-density-factor'),
    }));
}

test('compact on a theme with its own density: the factor is 0.75 and the controls shrink', async ({ page }) => {
    await page.goto('/account');
    const prefs = page.locator('[data-test="pref-density"]');
    await expect(prefs).toBeVisible();
    // A theme density of 0.9: the case the attribute used to lose.
    await giveTheThemeADensity(page);
    await prefs.getByRole('radio', { name: 'Normal' }).click();
    await expect.poll(async () => (await densityState(page)).factor, 'control: the theme\'s own density').toBeCloseTo(0.9, 5);

    // A button: its height is `--pdx-button-min-height × --pdx-density-factor` (buttons.css).
    const control = page.locator('[data-test="sign-out"] button');
    const before = (await control.boundingBox())!.height;

    await prefs.getByRole('radio', { name: 'Compact' }).click();
    await expect.poll(async () => (await densityState(page)).factor, 'compact did not set the factor over the theme\'s').toBeCloseTo(0.75, 5);
    expect((await densityState(page)).inline, 'the factor is still written inline').toBe('');
    await expect.poll(async () => (await control.boundingBox())!.height, 'the controls kept their height').toBeLessThan(before);
});

test('comfortable widens, and normal goes back to the theme\'s own density', async ({ page }) => {
    await page.goto('/account');
    const prefs = page.locator('[data-test="pref-density"]');
    await expect(prefs).toBeVisible();
    await giveTheThemeADensity(page);

    await prefs.getByRole('radio', { name: 'Comfortable' }).click();
    await expect.poll(async () => (await densityState(page)).factor).toBeCloseTo(1.25, 5);
    await prefs.getByRole('radio', { name: 'Normal' }).click();
    await expect.poll(async () => (await densityState(page)).factor, 'normal is the theme\'s own density').toBeCloseTo(0.9, 5);
});
