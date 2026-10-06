// pdx-data-grid's maxHeight caps a plain grid, and its body scrolls under a sticky header.
//
// maxHeight applies outside the virtualScroll branch too: without it, `:max-height="620"` leaves a
// 20-row grid 1007 px tall, with `.pdx-dg-scroll` at `max-height: none`. The unit test checks the
// style the grid sets; this measures what a browser does with it: the element is capped, and the
// rows beyond the cap are reached by scrolling it.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

type Box = { height: number; scrollHeight: number; clientHeight: number; overflowY: string } | null;
type Gotcha = { read(): { capped: Box; free: Box }; scrollCapped(y: number): { scrollTop: number; headerFromTop: number } };

async function open(page: Page): Promise<{ capped: NonNullable<Box>; free: NonNullable<Box> }> {
    await openPage(page, '/gotchas.html?case=grid-max-height');
    // Wait for both grids to have rendered their 20 rows, rather than for a number of milliseconds.
    await page.waitForFunction(() => {
        const r = (window as unknown as { __gotcha: Gotcha }).__gotcha.read();
        return !!r.capped && !!r.free;
    });
    return page.evaluate(() => (window as unknown as { __gotcha: Gotcha }).__gotcha.read()) as never;
}

test.describe('pdx-data-grid maxHeight without virtualScroll', () => {
    test('a grid with maxHeight=200 is at most 200 px tall, and its rows scroll inside it', async ({ page }) => {
        const { capped } = await open(page);
        expect(capped.height, 'maxHeight caps nothing: the grid is as tall as its rows').toBeLessThanOrEqual(200.5);
        expect(capped.overflowY).toBe('auto');
        expect(capped.scrollHeight, 'nothing to scroll: the case measures nothing').toBeGreaterThan(capped.clientHeight);
    });

    test('the header stays at the top while the body scrolls', async ({ page }) => {
        await open(page);
        const r = await page.evaluate(() => (window as unknown as { __gotcha: Gotcha }).__gotcha.scrollCapped(150));
        expect(r.scrollTop, 'the capped grid did not scroll').toBeGreaterThan(100);
        expect(Math.abs(r.headerFromTop), 'the header scrolled away with the rows').toBeLessThanOrEqual(1);
    });

    test('a grid with no maxHeight is as tall as its rows — the control', async ({ page }) => {
        const { free } = await open(page);
        expect(free.height, '20 rows fit in less than 400 px: the control is not a tall grid').toBeGreaterThan(400);
        expect(free.scrollHeight).toBeLessThanOrEqual(free.clientHeight + 1);
    });
});
