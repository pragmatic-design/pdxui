// `processInSlices` (#240), measured in Chromium: a 100 000-item job that would be one long task
// in a plain loop leaves no frame over 50 ms when it runs in slices, and a click made while it
// runs is answered before it ends.
//
// The browser reports long frames through the Long Animation Frames API (`long-animation-frame`),
// or long tasks (`longtask`) where that is absent: both measure the same 50 ms. Every check has a
// control, the same job in a plain loop, which must fail it, so the measurement can fail.
//
// The harness's progress line changes as the job runs, so there is always a frame to paint. That
// is what tells the ways of yielding apart. Measured while writing this, with the helper yielding
// through `scheduler.yield()`: the frame was held back for 100–105 ms, four runs in four, because
// the continuation runs ahead of rendering. Through a MessageChannel no frame reaches 50 ms.
//
// The click is real input (`page.mouse`), not `element.click()` from a timer: a timer is not how
// input reaches the page.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

type Mode = 'sliced' | 'plain';

/** Run the job one way and return the longest frame (or task) the browser reported during it. */
function longestFrameDuring(page: Page, mode: Mode): Promise<number> {
    return page.evaluate(async (m) => {
        const supported = PerformanceObserver.supportedEntryTypes;
        const type = supported.includes('long-animation-frame') ? 'long-animation-frame' : 'longtask';
        const durations: number[] = [];
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) durations.push(entry.duration);
        });
        observer.observe({ type, buffered: false });
        const job = (window as unknown as { __job: Record<string, () => unknown> }).__job;
        await job[m]();
        // Let the frame that ends the job be reported.
        await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 100)));
        for (const entry of observer.takeRecords()) durations.push(entry.duration);
        observer.disconnect();
        return durations.length ? Math.max(...durations) : 0;
    }, mode);
}

/**
 * Start the job, click a button with the mouse 40 ms in, and return when the click's handler ran
 * and when the job ended, both in ms from the job's start.
 */
async function clickDuring(page: Page, mode: Mode): Promise<{ clickAt: number; jobEnd: number }> {
    const point = await page.evaluate((m) => {
        const w = window as unknown as Record<string, unknown> & { __job: Record<string, () => unknown> };
        const button = document.createElement('button');
        button.textContent = 'Click';
        document.body.prepend(button);
        const start = performance.now();
        button.addEventListener('click', () => { w.__clickAt = performance.now() - start; });
        // Started from a microtask, so this evaluate returns before a plain loop runs.
        w.__jobEnd = Promise.resolve().then(() => w.__job[m]()).then(() => performance.now() - start);
        const r = button.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, mode);
    await page.waitForTimeout(40);
    await page.mouse.click(point.x, point.y);
    return page.evaluate(async () => {
        const w = window as unknown as Record<string, unknown>;
        const jobEnd = await (w.__jobEnd as Promise<number>);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        return { clickAt: w.__clickAt as number, jobEnd };
    });
}

test.beforeEach(async ({ page }) => {
    await openPage(page, '/slices.html');
});

test('the control: the same job in a plain loop produces a frame over 50 ms', async ({ page }) => {
    expect(await longestFrameDuring(page, 'plain')).toBeGreaterThan(50);
    await expect(page.locator('[data-test="result"]')).not.toBeEmpty();
});

test('processInSlices over 100 000 items leaves no frame of 50 ms or more', async ({ page }) => {
    expect(await longestFrameDuring(page, 'sliced')).toBeLessThan(50);
    await expect(page.locator('[data-test="result"]')).not.toBeEmpty();
});

test('the control: a click during the plain loop waits for the whole job', async ({ page }) => {
    const { clickAt, jobEnd } = await clickDuring(page, 'plain');
    expect(clickAt).toBeGreaterThan(jobEnd);
});

test('a click during the sliced job is answered before the job ends', async ({ page }) => {
    const { clickAt, jobEnd } = await clickDuring(page, 'sliced');
    expect(clickAt).toBeLessThan(jobEnd);
});
