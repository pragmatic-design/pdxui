// `createVirtualizer` over items of variable height (#252), measured in Chromium: happy-dom lays
// nothing out, so the unit tests cannot see where an item lands.
//
// The harness renders 2 000 items whose heights come from a fixed seed, 24 to 120 px, with an
// estimate of 48, and hands every rendered item to `measureElement`. What a caller is promised:
//   · `scrollTo(index)` lands on the item, not where the estimates put it;
//   · an item that changes height after it rendered moves the items after it;
//   · an item ABOVE the viewport that grows does not move what the reader is looking at.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Let the virtualizer, the observers and the layout settle: a few frames. */
async function frames(page: Page, n = 4): Promise<void> {
    await page.evaluate((count) => new Promise<void>((resolve) => {
        let left = count;
        const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
    }), n);
}

/** Where item `index` is, in px from the scroller's top edge; null when it is not rendered. */
function topOf(page: Page, index: number): Promise<number | null> {
    return page.evaluate((i) => {
        const el = document.querySelector(`[data-test="item-${i}"]`);
        const scroller = document.querySelector('[data-test="scroller"]')!;
        if (!el) return null;
        return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - scroller.clientTop;
    }, index);
}

/** The first item whose box reaches below the scroller's top edge. */
function firstVisible(page: Page): Promise<number> {
    return page.evaluate(() => {
        const scroller = document.querySelector('[data-test="scroller"]')!;
        const top = scroller.getBoundingClientRect().top + scroller.clientTop;
        const items = [...document.querySelectorAll<HTMLElement>('[data-virtual-index]')]
            .filter((el) => el.getBoundingClientRect().bottom > top + 0.5)
            .map((el) => Number(el.dataset.virtualIndex));
        return Math.min(...items);
    });
}

test.beforeEach(async ({ page }) => {
    await openPage(page, '/virtualizer-heights.html');
    await page.locator('[data-test="item-0"]').waitFor();
});

test('scrollTo(500) puts item 500 at the top of the scroller, within 1 px', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __virt: { scrollTo(i: number): void } }).__virt.scrollTo(500));
    await frames(page, 8);
    const top = await topOf(page, 500);
    expect(top, 'item 500 is not rendered after scrollTo(500)').not.toBeNull();
    expect(Math.abs(top!), `item 500 landed ${top} px from the top`).toBeLessThanOrEqual(1);
});

test("scrollTo(500, { align: 'end' }) puts item 500's bottom at the bottom of the scroller, within 1 px", async ({ page }) => {
    // The target depends on the item's own height, which the estimate gets wrong until the item has
    // rendered: only a second pass, once it is measured, lands on it.
    await page.evaluate(() => (window as unknown as { __virt: { scrollTo(i: number, o: { align: string }): void } }).__virt.scrollTo(500, { align: 'end' }));
    await frames(page, 8);
    const bottom = await page.evaluate(() => {
        const el = document.querySelector('[data-test="item-500"]');
        const scroller = document.querySelector('[data-test="scroller"]')!;
        if (!el) return null;
        const s = scroller.getBoundingClientRect();
        return s.top + scroller.clientTop + scroller.clientHeight - el.getBoundingClientRect().bottom;
    });
    expect(bottom, 'item 500 is not rendered after scrollTo(500)').not.toBeNull();
    expect(Math.abs(bottom!), `item 500's bottom landed ${bottom} px from the scroller's bottom`).toBeLessThanOrEqual(1);
});

test('an item whose height changes after it rendered moves the items after it by the difference', async ({ page }) => {
    await frames(page);
    const height2 = await page.locator('[data-test="item-2"]').evaluate((el) => (el as HTMLElement).offsetHeight);
    const before = await topOf(page, 3);
    expect(before).not.toBeNull();

    await page.evaluate(() => (window as unknown as { __heights: { set(i: number, h: number): void } }).__heights.set(2, 200));
    await frames(page);

    const after = await topOf(page, 3);
    expect(after).not.toBeNull();
    expect(Math.abs(after! - before! - (200 - height2)),
        `item 2 grew by ${200 - height2} px and item 3 moved by ${after! - before!}`).toBeLessThanOrEqual(1);
});

test('an item above the viewport growing by 100 px does not move the first visible item', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __virt: { scrollTo(i: number): void } }).__virt.scrollTo(100));
    await frames(page, 8);
    const first = await firstVisible(page);
    const above = first - 2;
    expect(await topOf(page, above), `item ${above}, in the overscan above the viewport, is not rendered`).not.toBeNull();
    const before = await topOf(page, first);

    await page.evaluate((i) => {
        const el = document.querySelector<HTMLElement>(`[data-test="item-${i}"]`)!;
        (window as unknown as { __heights: { set(i: number, h: number): void } }).__heights.set(i, el.offsetHeight + 100);
    }, above);
    await frames(page);

    const after = await topOf(page, first);
    expect(Math.abs(after! - before!), `item ${first} moved from ${before} to ${after} px`).toBeLessThanOrEqual(1);
});
