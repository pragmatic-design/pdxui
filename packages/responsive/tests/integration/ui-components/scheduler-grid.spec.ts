// pdx-scheduler's grid (#1020, part 3), in Chromium: what the keyboard runner's arrows do not cover.
// - Enter on a slot with events goes into them; Escape gives the grid its keys back on that slot.
// - Enter on an empty slot emits `slot-open` with its start, end and resource; a click does the same.
// - A click on an event emits `event-open` with the event.
// - PageDown pages to the next period: the period's name changes and `period-change` says so.
// - An event is named by its title, time and date: what a screen reader hears on it.
//
// On the `scheduler-week` scenario: the week of Monday 21 September 2026 in Rome, 08:00 to 18:00.

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
        await expect(scheduler.getByRole('grid', { name: 'Sep 21 – 27, 2026' })).toHaveCount(1);
        // en-US writes the range with both halves' day periods, its spaces ICU's own (narrow or thin).
        await expect(scheduler.getByRole('button', { name: /^Review, 10:00\sAM\s–\s12:00\sPM, Tuesday, September 22, 2026$/ })).toHaveCount(1);
        await expect(scheduler.getByRole('button', { name: /^Offsite, All day, Wednesday, September 23, 2026$/ })).toHaveCount(1);
    });

    test('Enter on a slot goes into its events, Escape back to the slot', async ({ page }) => {
        const scheduler = page.locator(`section:not([hidden]) ${root}`);
        // Tuesday (column 1), 10:00: row 5 of the slots from 08:00 (row 0 is the all-day row).
        const slot = scheduler.locator('[data-row="5"][data-col="1"]');
        await slot.focus();
        await page.keyboard.press('Enter');
        await expect(scheduler.locator('[data-id="review"] [data-part="eventButton"]')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(slot).toBeFocused();
        await expect(slot).toHaveAttribute('tabindex', '0');
        await expect(scheduler.locator('[data-id="review"] [data-part="eventButton"]')).toHaveAttribute('tabindex', '-1');
        await expect(scheduler.locator('[data-id="review"] [data-part="eventMenu"]')).toHaveAttribute('tabindex', '-1');
    });

    test('Enter on an empty slot, or a click on it, emits slot-open with its time', async ({ page }) => {
        await record(page, ['slot-open']);
        const scheduler = page.locator(`section:not([hidden]) ${root}`);
        // Wednesday (column 2), 08:30: row 2. 08:30 in Rome is 06:30 UTC (summer time).
        await scheduler.locator('[data-row="2"][data-col="2"]').focus();
        await page.keyboard.press('Enter');
        await scheduler.locator('[data-row="3"][data-col="2"]').click();
        expect(await events(page)).toEqual([
            { type: 'slot-open', detail: { start: '2026-09-23T06:30:00.000Z', end: '2026-09-23T07:00:00.000Z', resource: null, allDay: false } },
            { type: 'slot-open', detail: { start: '2026-09-23T07:00:00.000Z', end: '2026-09-23T07:30:00.000Z', resource: null, allDay: false } },
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
        await expect(scheduler.locator('[data-part="period"]')).toHaveText('Sep 28 – Oct 4, 2026');
        expect(await events(page)).toEqual([{ type: 'period-change', detail: { view: 'week', start: '2026-09-28', end: '2026-10-05' } }]);
        await expect(scheduler.locator('[data-row="1"][data-col="0"]'), 'the focus stays in the grid').toBeFocused();
    });
});

test.describe('the time grid draws the slots in view (#1085)', () => {
    /** The week, its hours made a whole day: 48 slots of half an hour, 336 cells, some 14 rows in view. */
    async function wholeDay(page: Page, events?: string) {
        await goToScenario(page, SCENARIO, THEME, { page: scenarioPage[SCENARIO], scheme: schemeFor(THEME) });
        const scheduler = page.locator(`section:not([hidden]) ${root}`);
        await scheduler.evaluate((el, ev) => {
            el.setAttribute('start-hour', '00:00');
            el.setAttribute('end-hour', '24:00');
            if (ev) (el as unknown as { events: unknown }).events = JSON.parse(ev);
        }, events ?? null);
        await expect(scheduler.locator('[data-part="grid"]')).toHaveAttribute('aria-rowcount', '50');
        return scheduler;
    }
    const slotCells = (scheduler: ReturnType<Page['locator']>) => scheduler.locator('[role="gridcell"][data-row]:not([data-row="0"])');

    test('a day of 48 slots draws the rows in view and a few beyond, not all of them', async ({ page }) => {
        const scheduler = await wholeDay(page);
        const rows = await slotCells(scheduler).evaluateAll((cells) => new Set(cells.map((c) => (c as HTMLElement).dataset.row)).size);
        expect(rows, `${rows} slot rows drawn of 48`).toBeLessThanOrEqual(30);
        expect(rows).toBeGreaterThanOrEqual(14);
        // Scrolled to the end, the last slot is drawn, in its own track at the bottom.
        const grid = scheduler.locator('[data-part="grid"]');
        await grid.evaluate((g) => { g.scrollTop = g.scrollHeight; });
        const last = scheduler.locator('[data-row="48"][data-col="0"]');
        await expect(last).toHaveCount(1);
        const [cell, box] = await Promise.all([last.boundingBox(), grid.boundingBox()]);
        expect(Math.abs((cell!.y + cell!.height) - (box!.y + box!.height)), 'the last slot ends at the bottom of the grid').toBeLessThanOrEqual(2);
    });

    test('an event that starts above the slots drawn is still drawn, from where it starts', async ({ page }) => {
        // Tuesday 22 September, 01:00 to 23:00 in Rome.
        const scheduler = await wholeDay(page, '[{"id":"long","title":"Long","start":"2026-09-22T01:00","end":"2026-09-22T23:00"}]');
        const grid = scheduler.locator('[data-part="grid"]');
        await grid.evaluate((g) => { g.scrollTop = g.scrollHeight; });
        await expect(scheduler.locator('[data-row="3"]'), 'the 01:00 slot is no longer drawn').toHaveCount(0);
        const long = scheduler.locator('[data-id="long"]');
        await expect(long).toHaveCount(1);
        // It runs from 01:00 to 23:00: its bottom is the top of the 23:00 slot (row 47), wherever it is drawn from.
        const [ev, eleven] = await Promise.all([long.boundingBox(), scheduler.locator('[data-row="47"][data-col="1"]').boundingBox()]);
        expect(Math.abs((ev!.y + ev!.height) - eleven!.y), `ends at ${ev!.y + ev!.height}, 23:00 at ${eleven!.y}`).toBeLessThanOrEqual(3);
    });

    test('the tab stop stays drawn when the grid scrolls away from it', async ({ page }) => {
        const scheduler = await wholeDay(page);
        // A click makes a cell the tab stop (a focus() from a script does not move it).
        const first = scheduler.locator('[data-row="1"][data-col="0"]');
        await first.click();
        await scheduler.locator('[data-part="grid"]').evaluate((g) => { g.scrollTop = g.scrollHeight; });
        await expect(first).toBeFocused();
        await expect(first).toHaveAttribute('tabindex', '0');
        // And the arrows reach a slot that was not drawn: Down from 00:00 is 00:30.
        await page.keyboard.press('ArrowDown');
        await expect(scheduler.locator('[data-row="2"][data-col="0"]')).toBeFocused();
    });
});

test.describe('the current-time line', () => {
    test('is one line, across its day, at its minute of its slot', async ({ browser }) => {
        // A context of its own, closed with the test: a clock is installed on the whole context, and
        // the certify fixture shares one context among a worker's tests and cannot take a clock off.
        // Installed there, the fixed clock reached every later page of the worker, and a later test's
        // page lost its execution context mid-evaluate (#1094).
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        try {
            const page = await context.newPage();
            // Wednesday 23 September 2026, 09:15 in Rome (07:15 UTC, summer time): column 2, the 09:00
            // slot (row 3 from 08:00, row 0 being the all-day row), half way down it.
            await page.clock.setFixedTime(new Date('2026-09-23T07:15:00.000Z'));
            await goToScenario(page, SCENARIO, THEME, { page: scenarioPage[SCENARIO], scheme: schemeFor(THEME) });
            const scheduler = page.locator(`section:not([hidden]) ${root}`);
            // The scenario turns the line off, so the visual baselines do not move with the clock.
            await scheduler.evaluate((el) => { (el as unknown as { nowIndicator: boolean }).nowIndicator = true; });
            const line = scheduler.locator('[data-part="nowLine"]');
            await expect(line).toHaveCount(1);
            const cell = await scheduler.locator('[data-row="3"][data-col="2"]').boundingBox();
            const box = await line.boundingBox();
            expect(cell && box, 'the line and its cell are drawn').toBeTruthy();
            expect(Math.abs(box!.y - (cell!.y + cell!.height / 2)), `line at ${box!.y}, the slot ${cell!.y}–${cell!.y + cell!.height}`).toBeLessThanOrEqual(1.5);
            expect(Math.abs(box!.x - cell!.x), 'the line starts at its day').toBeLessThanOrEqual(1.5);
            expect(Math.abs(box!.width - cell!.width), 'the line spans its day').toBeLessThanOrEqual(1.5);
        } finally {
            await context.close();
        }
    });
});
