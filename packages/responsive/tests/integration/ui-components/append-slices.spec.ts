// A `@for` that receives 10 000 rows from one click (#242), measured in Chromium. The list renders
// the first slice in the click's task and the rest in slices that yield to input, so the click's
// interaction (Event Timing, by `interactionId`) ends in the frame after it, with the first rows in
// that frame. The control builds the same rows with the same row render in one loop, outside the
// list, and must measure over 200 ms, so the measurement can fail.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Click `button`, wait for `rows` rows under `container`, and return what the click cost. */
async function clickAndMeasure(page: Page, button: string, container: string, rows: number) {
    await page.evaluate(({ button: b }) => {
        const w = window as unknown as Record<string, unknown>;
        const durations: number[] = [];
        w.__interaction = durations;
        new PerformanceObserver((list) => {
            // `interactionId` is newer than this TypeScript's DOM library.
            for (const e of list.getEntries() as Array<PerformanceEntry & { interactionId?: number }>) {
                if (e.interactionId) durations.push(e.duration);
            }
        }).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
        // Registered before the click: what the frame after the click will paint.
        document.querySelector(`[data-test="${b}"]`)!.addEventListener('click', () => {
            requestAnimationFrame(() => {
                w.__rowsInFirstFrame = document.querySelectorAll('[data-test="row"]').length;
            });
        });
    }, { button });
    await page.locator(`[data-test="${button}"]`).click();
    await expect(page.locator(`[data-test="${container}"] [data-test="row"]`)).toHaveCount(rows, { timeout: 20_000 });
    // Event Timing reports an interaction once its frame is presented.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 100))));
    return page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        const durations = w.__interaction as number[];
        return {
            inp: durations.length ? Math.max(...durations) : 0,
            rowsInFirstFrame: w.__rowsInFirstFrame as number,
        };
    });
}

test('the control: 10 000 rows built in one loop make the click cost over 200 ms', async ({ page }) => {
    await openPage(page, '/append-slices.html');
    const { inp } = await clickAndMeasure(page, 'control', 'control-box', 10_000);
    test.info().annotations.push({ type: 'INP, control', description: `${Math.round(inp)} ms` });
    expect(inp).toBeGreaterThan(200);
});

test('appending 10 000 rows to a @for from a click: INP under 200 ms, the first rows in the next frame', async ({ page }) => {
    await openPage(page, '/append-slices.html');
    const { inp, rowsInFirstFrame } = await clickAndMeasure(page, 'append', 'list', 10_000);
    test.info().annotations.push({ type: 'INP, 10 000 rows', description: `${Math.round(inp)} ms` });
    expect(inp).toBeLessThan(200);
    expect(rowsInFirstFrame, 'rows in the frame after the click').toBeGreaterThan(0);
    expect(rowsInFirstFrame, 'the rest waits for later slices').toBeLessThan(10_000);
});

// Up to LIST_SLICE_THRESHOLD (1 000) new rows the list keeps one pass, a choice made against
// js-framework-benchmark: what one pass costs depends on the machine (1 000 rows: 32-112 ms locally,
// 200 ms on a CI runner), so these are reported, not held to a number.
for (const n of [500, 1_000]) {
    test(`appending ${n} rows: the INP is reported`, async ({ page }) => {
        await openPage(page, `/append-slices.html?n=${n}`);
        const { inp } = await clickAndMeasure(page, 'append', 'list', n);
        test.info().annotations.push({ type: `INP, ${n} rows`, description: `${Math.round(inp)} ms` });
        expect(inp, 'Event Timing reported the click').toBeGreaterThan(0);
    });
}
