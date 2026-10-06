// A calendar takes the width its container offers.
//
// `display: inline-flex` on `.pdx-calendar` would size it to content, so a calendar in a 420px card
// would sit at its intrinsic 290px flush left, with 78px of empty space beside it.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const BASE = '/gotchas.html?case=';

type Read = { boxW: number; innerW: number; gapRight: number; cellCount: number; rowSpan: number };

async function read(page: Page): Promise<Read> {
    await openPage(page, BASE + 'calendar-fills');
    await page.waitForSelector('.pdx-cal-cell');
    return page.evaluate(() => (window as unknown as { __gotcha: { read(): Read } }).__gotcha.read());
}

test.describe('pdx-calendar in a container wider than its intrinsic size', () => {
    test('fills the width it is given', async ({ page }) => {
        const m = await read(page);
        expect(m.boxW, 'the case builds a 420px box').toBe(420);
        // Allow the container's own border; anything near a 78px gap is the defect.
        expect(m.gapRight, `${m.gapRight}px of empty space to the right`).toBeLessThanOrEqual(4);
        expect(m.innerW).toBeGreaterThanOrEqual(m.boxW - 8);
    });

    test('spreads the day cells across that width instead of bunching them left', async ({ page }) => {
        // ⚠️ The width fix alone could have moved the empty space rather than removed it: the columns
        // are `repeat(7, 1fr)` but a cell has a fixed 36px, so a wider grid could leave the gap
        // BETWEEN the columns with the row still ending early. This measures the row's real span.
        const m = await read(page);
        expect(m.cellCount, 'the calendar rendered its days').toBeGreaterThan(27);
        expect(m.rowSpan, 'the widest row should reach across the container').toBeGreaterThan(m.boxW * 0.8);
    });
});
