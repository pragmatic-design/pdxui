// pdx-date-picker at phone width: one positioning system at a time.
//
// Below 640px the stylesheet turns the panel into a bottom sheet (position:fixed; left/right/bottom 0).
// A popover composable that also positions the same element as a floating panel writes inline
// left/top that win over it: the sheet runs 8px off the right edge, and inside a pdx-dialog the
// panel's ResizeObserver chases its own writes: an inline top on a sheet pinned to bottom:0 sets its
// height, the new height fires the observer, the observer writes a new top. 38+ «ResizeObserver loop»
// error events per open — silent in the console, fifty per date in an app with an error collector.
// The manifest runs measure at 1280×800, where the sheet rules do not match, so this is measured here.
import { test, expect, type Page } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { settle } from './contracts/assertions';
import { scenarioPage } from './contracts/generated/manifests';

const PHONE = { width: 390, height: 844 };

/** Count the ResizeObserver loop error events window receives, from before anything runs. */
async function countObserverErrors(page: Page): Promise<void> {
    await page.addInitScript(() => {
        (window as unknown as { __roErrors: number }).__roErrors = 0;
        window.addEventListener('error', (e) => {
            if (String(e.message).includes('ResizeObserver')) (window as unknown as { __roErrors: number }).__roErrors++;
        });
    });
}
const observerErrors = (page: Page): Promise<number> =>
    page.evaluate(() => (window as unknown as { __roErrors: number }).__roErrors);

/**
 * Let `n` rendering frames go by. ResizeObserver delivers once per frame, and a loop is reported in
 * the frame it overflows, so frames — not milliseconds — are what the count waits on.
 */
function frames(page: Page, n: number): Promise<void> {
    return page.evaluate((count) => new Promise<void>((resolve) => {
        let left = count;
        const step = (): void => { if (--left <= 0) resolve(); else requestAnimationFrame(step); };
        requestAnimationFrame(step);
    }), n);
}

async function openScenario(page: Page): Promise<void> {
    await goToScenario(page, 'date-picker-closed', 'neutral', { page: scenarioPage['date-picker-closed'] });
    await settle(page);
}

/** The open panel's box and its inline left. */
function panel(page: Page, scope: string): Promise<{ left: number; right: number; bottom: number; inlineLeft: string; inlineTop: string }> {
    return page.evaluate((sel) => {
        const p = document.querySelector(sel) as HTMLElement;
        const r = p.getBoundingClientRect();
        return { left: r.left, right: r.right, bottom: r.bottom, inlineLeft: p.style.left, inlineTop: p.style.top };
    }, `${scope} .pdx-date-picker-panel`);
}

test.describe('pdx-date-picker at 390px: the bottom sheet', () => {
    test.use({ viewport: PHONE });

    test('the sheet is on screen, edge to edge, with no inline position', async ({ page }) => {
        await openScenario(page);
        await page.locator('section:not([hidden]) [data-test="dp"] .pdx-date-picker-trigger').click();
        await page.locator('section:not([hidden]) [data-test="dp"] .pdx-date-picker-panel').waitFor({ state: 'visible' });
        await frames(page, 3); // the popover positions in the frame after opening
        const box = await panel(page, 'section:not([hidden]) [data-test="dp"]');
        expect(box.left, 'the sheet starts off the left edge').toBeGreaterThanOrEqual(0);
        expect(box.right, 'the sheet runs off the right edge').toBeLessThanOrEqual(PHONE.width);
        expect(box.bottom).toBeCloseTo(PHONE.height, 0);
        expect(box.inlineLeft, 'the floating position is fighting the sheet').toBe('');
        expect(box.inlineTop).toBe('');
    });

    test('inside a pdx-dialog: opening, choosing a day and reopening fire no ResizeObserver loop errors', async ({ page }) => {
        await countObserverErrors(page);
        await openScenario(page);
        await page.evaluate(() => {
            const dialog = document.createElement('pdx-dialog');
            dialog.setAttribute('data-test', 'dlg');
            const picker = document.createElement('pdx-date-picker');
            picker.setAttribute('data-test', 'dlg-dp');
            dialog.appendChild(picker);
            document.body.appendChild(dialog);
            dialog.setAttribute('open', '');
        });
        const trigger = page.locator('[data-test="dlg-dp"] .pdx-date-picker-trigger');
        await trigger.waitFor({ state: 'visible' });
        await trigger.click();
        await page.locator('[data-test="dlg-dp"] .pdx-date-picker-panel').waitFor({ state: 'visible' });
        await page.locator('[data-test="dlg-dp"] [role="gridcell"][data-outside="0"]').nth(10).click();
        await trigger.click();
        await page.locator('[data-test="dlg-dp"] .pdx-date-picker-panel').waitFor({ state: 'visible' });
        // The loop overflowed within the first frames after opening (38+ events in under a second).
        await frames(page, 30);
        expect(await observerErrors(page), 'ResizeObserver loop errors on window').toBe(0);
        const box = await panel(page, '[data-test="dlg-dp"]');
        expect(box.right).toBeLessThanOrEqual(PHONE.width);
    });
});

test.describe('pdx-date-picker at 1280px: the floating panel (the control)', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('the panel floats under its trigger, positioned inline', async ({ page }) => {
        await openScenario(page);
        const trigger = page.locator('section:not([hidden]) [data-test="dp"] .pdx-date-picker-trigger');
        await trigger.click();
        await page.locator('section:not([hidden]) [data-test="dp"] .pdx-date-picker-panel').waitFor({ state: 'visible' });
        await expect.poll(async () => (await panel(page, 'section:not([hidden]) [data-test="dp"]')).inlineLeft).not.toBe('');
        const t = await trigger.boundingBox();
        const box = await panel(page, 'section:not([hidden]) [data-test="dp"]');
        expect(Math.abs(box.left - t!.x), 'the floating panel is not aligned with its trigger').toBeLessThanOrEqual(2);
    });
});
