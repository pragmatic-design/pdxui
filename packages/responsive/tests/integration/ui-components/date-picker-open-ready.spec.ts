// The date-picker-open scenario is ready only once its state is whole: the panel open AND the focus
// on the chosen day (#737).
//
// Opening moves the focus into the dialog, onto the day the calendar holds its tab stop on — but only
// once the calendar's first view is ready, which waits on a zero-delay timer (`pdx-calendar.ts`,
// `initView`). Two things went wrong when that timer ran late, as it can on a loaded runner, and
// `visual: date-picker-open [cyberpunk]` shot day 15 selected and not focused:
//
// - the scenario page declares itself ready two frames after the setup, and nothing ordered that
//   before the timer: the setup now waits for the focus to enter the panel;
// - the calendar kept the early request for a draw after `initView`, and when the picker had already
//   handed it the month, no draw followed and the focus never came at all.
//
// Here the timer is made late on purpose: zero-delay timers are held back past the two frames.
import { test, expect } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { scenarioPage } from './contracts/generated/manifests';

const SCENARIO = 'date-picker-open';
const DAY = 'section:not([hidden]) [data-test="dp-open"] [role="gridcell"][aria-selected="true"]';

test('date-picker-open is ready with the focus already on the chosen day, even when the calendar draws late', async ({ page }) => {
    await page.addInitScript(() => {
        // A loaded runner, made deterministic: a zero-delay timer runs 200 ms late, well after the
        // two frames the page waits before it says it is ready.
        const original = window.setTimeout;
        window.setTimeout = ((fn: TimerHandler, delay?: number, ...args: unknown[]) =>
            original(fn, delay ? delay : 200, ...args)) as typeof window.setTimeout;
        // What has the focus at the moment the page declares itself ready.
        new MutationObserver(() => {
            const w = window as unknown as { __focusAtReady?: string };
            if (w.__focusAtReady === undefined && document.documentElement.hasAttribute('data-pdx-ready')) {
                const a = document.activeElement as HTMLElement | null;
                w.__focusAtReady = a?.getAttribute('aria-label') ?? a?.tagName ?? 'none';
            }
        }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-pdx-ready'] });
    });
    await goToScenario(page, SCENARIO, 'neutral', { page: scenarioPage[SCENARIO] });

    const chosen = await page.locator(DAY).getAttribute('aria-label');
    expect(chosen, 'the scenario holds a fixed value, 2024-06-15').toContain('June 15, 2024');
    const atReady = await page.evaluate(() => (window as unknown as { __focusAtReady?: string }).__focusAtReady);
    expect(atReady, 'the page said ready before the focus reached the chosen day').toBe(chosen);
});
