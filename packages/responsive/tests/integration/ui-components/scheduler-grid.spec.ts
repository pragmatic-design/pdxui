// pdx-scheduler's grid (#1020, part 3), in Chromium: what the keyboard runner's arrows do not cover.
// - Enter on a slot with events goes into them; Escape gives the grid its keys back on that slot.
// - Enter on an empty slot emits `slot-open` with its start, end and resource; a click does the same.
// - A click on an event emits `event-open` with the event.
// - PageDown pages to the next period: the period's name changes and `period-change` says so.
// - An event is named by its title, time and date: what a screen reader hears on it.
//
// On the `scheduler-week` scenario: the week of Monday 16 November 2026 in Rome, 08:00 to 18:00.

import { test, expect, type Page } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES, schemeFor } from '../../manifests/_themes';

const SCENARIO = 'scheduler-week';
const THEME = THEMES[0];
const root = '[data-test="scheduler"]';

/** Record the scheduler's events of these names on the page, in `window.__events`. */
async function record(page: Page, names: string[]): Promise<void> {
    await page.evaluate(([sel, list]) => {
        const w = window as unknown as { __events: { type: string; detail: unknown }[] };
        w.__events = [];
        const host = document.querySelector(`section:not([hidden]) ${sel}`) as HTMLElement;
        for (const n of list) host.addEventListener(n, (e) => w.__events.push({ type: n, detail: (e as CustomEvent).detail }));
    }, [root, names] as const);
}
const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: { type: string; detail: Record<string, unknown> }[] }).__events);

test.describe('the scheduler grid', () => {
    test.beforeEach(async ({ page }) => {
        await goToScenario(page, SCENARIO, THEME, { page: scenarioPage[SCENARIO], scheme: schemeFor(THEME) });
    });

    test('an event is named by its title, time and date', async ({ page }) => {
        const scheduler = page.locator(`section:not([hidden]) ${root}`);
        await expect(scheduler.getByRole('grid', { name: 'Nov 16 – 22, 2026' })).toHaveCount(1);
        // en-US writes the range with both halves' day periods, its spaces ICU's own (narrow or thin).
        await expect(scheduler.getByRole('button', { name: /^Review, 10:00\sAM\s–\s12:00\sPM, Tuesday, November 17, 2026$/ })).toHaveCount(1);
        await expect(scheduler.getByRole('button', { name: /^Offsite, All day, Wednesday, November 18, 2026$/ })).toHaveCount(1);
    });

    test('Enter on a slot goes into its events, Escape back to the slot', async ({ page }) => {
        const scheduler = page.locator(`section:not([hidden]) ${root}`);
        // Tuesday (column 1), 10:00: row 5 of the slots from 08:00 (row 0 is the all-day row).
        const slot = scheduler.locator('[data-row="5"][data-col="1"]');
        await slot.focus();
        await page.keyboard.press('Enter');
        await expect(scheduler.locator('[data-id="review"]')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(slot).toBeFocused();
        await expect(slot).toHaveAttribute('tabindex', '0');
        await expect(scheduler.locator('[data-id="review"]')).toHaveAttribute('tabindex', '-1');
    });

    test('Enter on an empty slot, or a click on it, emits slot-open with its time', async ({ page }) => {
        await record(page, ['slot-open']);
        const scheduler = page.locator(`section:not([hidden]) ${root}`);
        // Wednesday (column 2), 08:30: row 2. 08:30 in Rome is 07:30 UTC.
        await scheduler.locator('[data-row="2"][data-col="2"]').focus();
        await page.keyboard.press('Enter');
        await scheduler.locator('[data-row="3"][data-col="2"]').click();
        expect(await events(page)).toEqual([
            { type: 'slot-open', detail: { start: '2026-11-18T07:30:00.000Z', end: '2026-11-18T08:00:00.000Z', resource: null, allDay: false } },
            { type: 'slot-open', detail: { start: '2026-11-18T08:00:00.000Z', end: '2026-11-18T08:30:00.000Z', resource: null, allDay: false } },
        ]);
    });

    test('a click on an event emits event-open with that event', async ({ page }) => {
        await record(page, ['event-open', 'slot-open']);
        await page.locator(`section:not([hidden]) ${root} [data-id="call"]`).click();
        const got = await events(page);
        expect(got.map((e) => e.type), 'the click on an event also opened its slot').toEqual(['event-open']);
        expect((got[0].detail.event as { id: string }).id).toBe('call');
    });

    test('PageDown pages to the next week, names it, and says so', async ({ page }) => {
        await record(page, ['period-change']);
        const scheduler = page.locator(`section:not([hidden]) ${root}`);
        await scheduler.locator('[data-row="1"][data-col="0"]').focus();
        await page.keyboard.press('PageDown');
        await expect(scheduler.locator('[data-part="period"]')).toHaveText('Nov 23 – 29, 2026');
        expect(await events(page)).toEqual([{ type: 'period-change', detail: { view: 'week', start: '2026-11-23', end: '2026-11-30' } }]);
        await expect(scheduler.locator('[data-row="1"][data-col="0"]'), 'the focus stays in the grid').toBeFocused();
    });
});
