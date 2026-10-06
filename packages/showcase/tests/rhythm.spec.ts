// The app states its rhythm once, and the surfaces follow.
//
// A screen has a vertical rhythm: a row in a list, an item in a navigation, a header in a detail, a
// control in a bar. Left alone, each of those is whatever its padding and the theme's type scale
// produce — measured across the 13 themes, a grid row is 45.00 everywhere (a rhythm nobody
// declared) while a nav item runs 37.59–43.19 and a bar's control 32–44 (no rhythm at all).
//
// So the design system declares the four as tokens, with defaults that change nothing, and an
// application says which values it uses. This file is the measurement that saying it WORKS: the
// showcase declares a 49px row on its shell, and the grid draws 49.
//
// It is here rather than in a manifest because a manifest measures a component in isolation, on a
// scenario page with no application around it — and what is under test is exactly the application's
// declaration reaching the component.
import { test, expect, type Page } from '@playwright/test';

/** What the shell declares, and what every surface of that kind must then be. */
const STATED = { row: 49, navItem: 40, gutter: 24, inset: 16 };

const heightOf = (page: Page, selector: string) =>
    page.locator(selector).first().evaluate((el) => +el.getBoundingClientRect().height.toFixed(2));

test('a row in the ticket list is the rhythm the shell states', async ({ page }) => {
    await page.goto('/tickets');
    await expect(page.locator('[data-test="tickets"] .pdx-dg-row').first()).toBeVisible();

    expect(await heightOf(page, '[data-test="tickets"] .pdx-dg-row'),
        'the grid draws its own height instead of the one the application stated')
        .toBe(STATED.row);
});

test('and every row is that height, not just the first', async ({ page }) => {
    // A rhythm is a property of the KIND of surface. One row at 49 and the next at 45 is the defect,
    // one row later.
    await page.goto('/tickets');
    await expect(page.locator('[data-test="tickets"] .pdx-dg-row').first()).toBeVisible();

    const heights = await page.locator('[data-test="tickets"] .pdx-dg-row').evaluateAll(
        (els) => els.map((e) => +e.getBoundingClientRect().height.toFixed(2)));

    // Every row but the LAST, which is a pixel shorter because it carries no separator: the rhythm
    // is the row plus its 1px rule, and `.pdx-dg-row:last-child` drops the rule. Measured, and
    // stated here rather than smoothed over — the same pixel is there without a stated rhythm (44
    // against 45), and closing it would move the height of every grid in the library by 1px, which
    // is the one thing the library's defaults must not do.
    expect([...new Set(heights.slice(0, -1))], 'the rows of one list are not all the same height')
        .toEqual([STATED.row]);
    expect(heights[heights.length - 1], 'the last row is not the rhythm minus its separator')
        .toBe(STATED.row - 1);
});

test('the gutter around a surface and the inset inside it are two values, not one', async ({ page }) => {
    // An outer gutter and an inner inset. The
    // shell's bar reads both, `main` reads the gutter — and a page that used one padding everywhere
    // would show the same number twice here.
    await page.goto('/');
    const bar = await page.locator('pdx-app .app-bar').evaluate((el) => {
        const cs = getComputedStyle(el);
        return { x: parseFloat(cs.paddingLeft), y: parseFloat(cs.paddingTop) };
    });
    const main = await page.locator('pdx-app main').evaluate((el) => parseFloat(getComputedStyle(el).padding));

    expect(bar.x, 'the bar does not use the stated gutter').toBe(STATED.gutter);
    expect(bar.y, 'the bar does not use the stated inset').toBe(STATED.inset);
    expect(main, 'the page area does not use the stated gutter').toBe(STATED.gutter);
    expect(bar.x, 'the gutter and the inset are the same number, which is one padding everywhere')
        .not.toBe(bar.y);
});

test('control — the design system leaves the row to its CONTENT, and the app states the number', async ({ page }) => {
    // Without this, "the row is 49" would be satisfied by a design system that simply defaults to
    // 49 — and the declaration would be decoration.
    //
    // The default is `auto`, because nothing else holds. Written `2.8125rem` the row becomes 49.5
    // in cupertino and 54 in editorial, because those themes set a larger root font. Written
    // `calc(45px * var(--pdx-density-factor))` it becomes 49.5 and 54 again, because those same two
    // declare a density factor of their own. `auto` is the content, which is what all 13 themes
    // draw without a stated rhythm — so the library moves nothing and the application is the only
    // thing that states a rhythm, which is the whole point.
    await page.goto('/');
    const fromRoot = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--pdx-row-height').trim());
    const fromShell = await page.locator('pdx-app .app').evaluate((el) =>
        getComputedStyle(el).getPropertyValue('--pdx-row-cell-height').trim());

    expect(fromRoot, 'the design system no longer leaves the row to its content').toBe('auto');
    expect(fromShell, 'the shell does not state a rhythm of its own').toBe('48px');
});
