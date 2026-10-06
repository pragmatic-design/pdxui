// The navbar, driven the way its own props table says to drive it.
//
// The obvious way to drive the hamburger — bind `:navbar-collapsed="!open()"` and toggle a signal —
// must work below the breakpoint too: a layout that ignores the property there, keeping a private
// `_mobileCollapsed` signal that only the imperative API can reach, gives a hamburger that does
// nothing, with no warning and no way for the developer to know.
//
// The second case is the same component's other promise: `navbarCollapsedWidth` is documented
// as "set to '0px' explicitly for a fully-hidden navbar", and at 0px the grid column is zero, so
// the ELEMENT must not keep 25px and paint clipped labels.
//
// Both are measured on the real thing in a real browser: the defect depends on `matchMedia` and on
// layout, and neither survives a happy-dom test.

import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const BASE = '/gotchas.html?case=';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

type NavRead = {
    x: number; width: number; hidden: boolean; overlay: boolean;
    prop: boolean; viewport: number;
};
type RailRead = { width: number; column: string; childCount: number; viewport: number };

async function openCase(page: Page, name: string): Promise<void> {
    await openPage(page, BASE + name);
}

function read<T>(page: Page): Promise<T> {
    return page.evaluate(() => (window as unknown as { __gotcha: { read(): unknown } }).__gotcha.read()) as Promise<T>;
}

function setCollapsed(page: Page, v: boolean): Promise<void> {
    return page.evaluate(
        (value) => (window as unknown as { __gotcha: { setCollapsed(v: boolean): void } }).__gotcha.setCollapsed(value),
        v,
    );
}

test.describe('pdx-app-layout · the navbar follows its documented property', () => {
    test('on a phone, clearing navbarCollapsed opens the navbar', async ({ page }) => {
        await page.setViewportSize(PHONE);
        await openCase(page, 'navbar-collapsed-prop');

        const closed = await read<NavRead>(page);
        expect(closed.viewport, 'the case must actually be below the 900px breakpoint').toBe(390);
        expect(closed.overlay, 'below the breakpoint the navbar is an overlay drawer').toBe(true);
        expect(closed.hidden, 'it starts collapsed, as the attribute says').toBe(true);

        await setCollapsed(page, false);
        await page.waitForTimeout(400); // the layout animates over --pdx-app-transition (200ms)
        const open = await read<NavRead>(page);

        expect(open.prop, 'the property took the value we wrote').toBe(false);
        expect(open.hidden, 'and the navbar is no longer hidden').toBe(false);
        expect(open.x, 'an open overlay navbar starts on screen, not at -width').toBeGreaterThanOrEqual(0);
    });

    test('on a phone, setting it back collapses the navbar again', async ({ page }) => {
        await page.setViewportSize(PHONE);
        await openCase(page, 'navbar-collapsed-prop');

        await setCollapsed(page, false);
        await page.waitForTimeout(400);
        expect((await read<NavRead>(page)).hidden).toBe(false);

        await setCollapsed(page, true);
        await page.waitForTimeout(400);
        const closed = await read<NavRead>(page);
        expect(closed.hidden, 'the property closes it as well as opens it').toBe(true);
        expect(closed.x + closed.width).toBeLessThanOrEqual(1);
    });

    test('on desktop the property has always worked, and still does', async ({ page }) => {
        // The control: if this one were red too, the case itself would be wrong rather than the
        // component. It is the same property, above the breakpoint.
        await page.setViewportSize(DESKTOP);
        await openCase(page, 'navbar-collapsed-prop');

        await setCollapsed(page, false);
        await page.waitForTimeout(400);
        const open = await read<NavRead>(page);
        expect(open.overlay, 'above the breakpoint the navbar is in the grid, not an overlay').toBe(false);
        expect(open.width).toBeGreaterThan(200);
    });
});

test.describe('pdx-app-layout · a 0px rail is fully hidden, as the prop documents', () => {
    test('the collapsed navbar occupies no width on desktop', async ({ page }) => {
        await page.setViewportSize(DESKTOP);
        await openCase(page, 'navbar-rail-zero');

        const m = await read<RailRead>(page);
        expect(m.viewport).toBe(1440);
        expect(m.column, 'the grid column is zero — that part already worked').toBe('0px');
        expect(m.width, 'and so is the element: "0px explicitly for a fully-hidden navbar"').toBe(0);
    });

    // ⚠️ There is deliberately no second test catching the same defect through the navbar's
    // contents. Each way of doing it, checked by mutation — putting the bug back — stays GREEN:
    //   · the children's widths compared to zero: inside an `overflow: hidden` box they keep their
    //     layout width, so it could never pass at all;
    //   · hit-testing the children: clipped children are painted nowhere even WITH the defect;
    //   · hit-testing the left edge of the layout: still green with a 24px navbar sitting there.
    // The width assertion above is red with the bug and green without it. A second test that
    // cannot fail adds no coverage and does add the false comfort of a bigger number.
});
