// An app that uses one theme should be able to ship one theme.
//
// `@pdxui/design` imports all thirteen: measured on a real production build, that is 10.5 KB
// gzipped, 20% of the stylesheet, for themes the application cannot reach — and it is
// render-blocking CSS, so it is the first paint and not only the transfer.
//
// Every theme has a sub-path (`packages/core/tests/design-exports.test.ts` guards that, and its
// header calls it "the documented way to ship a single theme without the other twelve"). What this
// file checks is that the path produces a CORRECT stylesheet.
//
// A theme file carries no `@layer` of its own — the layer comes from the `layer(...)` on the
// `@import` in `pragmatic-design.css` — so importing one directly would put every theme rule in
// the UNLAYERED origin, which in CSS beats everything inside a layer. The design system's first
// promise, written at the top of its entry point, is the opposite: "Consumer's unlayered CSS always
// wins (zero !important needed)".
//
// So taking the saving must not silently break the cascade.

import { test, expect } from '@playwright/test';

const PAGE = '/demo/one-theme.html';

test('the theme applies at all', async ({ page }) => {
    // Without this the cascade assertion below could pass on a page where the theme never loaded.
    // `pragmatic` paints its primary button with a gradient, written by a theme rule — so a
    // background IMAGE is the proof the theme's own rules arrived, not only its tokens.
    await page.goto(PAGE);
    const themed = await page.locator('[data-test="themed"]').evaluate(
        (el) => getComputedStyle(el).backgroundImage);
    expect(themed, 'the single-theme entry did not theme anything').toContain('linear-gradient');
});

test('the consumer\'s own unlayered CSS still wins', async ({ page }) => {
    await page.goto(PAGE);
    const own = await page.locator('[data-test="overridden"]').evaluate((el) => ({
        image: getComputedStyle(el).backgroundImage,
        color: getComputedStyle(el).backgroundColor,
    }));
    // One class, no !important, against `[pdx-theme="pragmatic"] .pdx-primary:not(…)`. Inside a
    // layer the theme loses on principle; outside one it wins on specificity.
    expect(own.image,
        'the theme landed outside the layers and beat the consumer — the design system\'s first promise')
        .toBe('none');
    expect(own.color).toBe('rgb(1, 2, 3)');
});

test('the base entry brings the layers, so the component styles are there too', async ({ page }) => {
    await page.goto(PAGE);
    // The min-height comes from the components layer. If `base.css` dropped a layer or an import,
    // this is a bare <button> and the page would still look themed through the tokens alone.
    const height = await page.locator('[data-test="themed"]').evaluate(
        (el) => el.getBoundingClientRect().height);
    expect(height, 'the button has no component styling — base.css is missing a layer').toBeGreaterThan(24);
});
