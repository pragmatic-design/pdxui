// The filter popover opens under the funnel that opened it, not at the far side of the column.
//
// Anchored to the header CELL, the popover takes `left = rect.left` — the column's left edge. On
// the built site's Email column that puts the funnel at x=825 and the popover at 609, 216px away
// from the thing that was clicked, and overflowing the column's right edge by 109px onto the next
// column.
//
// The column menu of the same component passes its button (`openColumnMenu(gc, colBtn)`), so the
// two overlays agree with each other.
//
// This measures the geometry in a browser, which is the only place it exists: the anchor is a
// runtime rect, and happy-dom has no layout.

import { test, expect, type Page } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES, schemeFor } from '../../manifests/_themes';

const SCENARIO = 'data-grid-basic';
const THEME = THEMES[0];
type Box = { left: number; right: number; width: number };
type Measured = { pop: Box; btn: Box; th: Box; viewport: number };

async function openFilter(page: Page): Promise<Measured> {
    await goToScenario(page, SCENARIO, THEME, { page: scenarioPage[SCENARIO], scheme: schemeFor(THEME) });
    // The widest filterable column: the offset this is about grows with the column's width.
    const target = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('section:not([hidden]) .pdx-dg-filter-icon')] as HTMLElement[];
        const widest = btns
            .map((b, i) => ({ i, w: (b.closest('.pdx-dg-th') as HTMLElement).getBoundingClientRect().width }))
            .sort((a, b) => b.w - a.w)[0];
        btns[widest.i].setAttribute('data-probe', 'filter');
        (btns[widest.i].closest('.pdx-dg-th') as HTMLElement).setAttribute('data-probe-th', 'cell');
        return widest.w;
    });
    expect(target, 'no filterable column wide enough to measure').toBeGreaterThan(80);

    // The funnel is transparent until its header CELL is hovered or focused (data-grid.css:314),
    // so the pointer has to arrive the way a person's does: over the cell, then the funnel.
    await page.hover('[data-probe-th="cell"]');
    await page.click('[data-probe="filter"]');
    await page.waitForSelector('.pdx-dg-filter-popover');
    // The popover is placed twice: at append, and again on the next frame, once its editors have
    // filled in and its width settled (filter-popover.ts, `place()` and its requestAnimationFrame).
    // Measured between the two, on a busy runner, it read 24px off the funnel (#81). So: the frame
    // the second placement runs in, and one more for its layout, then the measurement.
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    return page.evaluate(() => {
        const box = (el: Element): Box => {
            const r = el.getBoundingClientRect();
            return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
        };
        const btn = document.querySelector('[data-probe="filter"]')!;
        return {
            pop: box(document.querySelector('.pdx-dg-filter-popover')!),
            btn: box(btn),
            th: box(btn.closest('.pdx-dg-th')!),
            viewport: window.innerWidth,
        };
    });
}

test.describe('the data-grid filter popover is anchored to its funnel', () => {
    test('it opens under the button, not at the column edge', async ({ page }) => {
        const m = await openFilter(page);
        // The measurement that fails when the popover sits at the column's left.
        expect(Math.abs(m.pop.right - m.btn.right),
            `the popover's right edge is ${Math.abs(m.pop.right - m.btn.right)}px from the funnel it opened from`)
            .toBeLessThanOrEqual(8);
        // Anchored to the funnel, not to the column: the popover lines up with the funnel's edge more
        // closely than with the cell's. Not `pop.left > th.left`, which holds only while the popover
        // is narrower than the cell minus the funnel's inset. In the Linux image the popover
        // measures 380 in a 386px column with the funnel 16px in, so a correctly anchored popover
        // starts 10px left of its column.
        const fromFunnel = Math.abs(m.pop.right - m.btn.right);
        const fromCellEdge = Math.abs(m.pop.left - m.th.left);
        expect(fromFunnel, `the popover lines up with the column edge (${fromCellEdge}px off) rather than the funnel (${fromFunnel}px off)`)
            .toBeLessThan(fromCellEdge);
    });

    test('and it stays on screen', async ({ page }) => {
        // The collision guard uses the popover's real width, which is 290-355 depending on the
        // field: an assumed width makes the flip to the other side trigger late.
        const m = await openFilter(page);
        expect(m.pop.right, 'the popover overflows the viewport').toBeLessThanOrEqual(m.viewport);
        expect(m.pop.left, 'the popover starts off the left edge').toBeGreaterThanOrEqual(0);
    });
});
