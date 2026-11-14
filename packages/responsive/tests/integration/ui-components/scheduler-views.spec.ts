// pdx-scheduler's month, year and agenda views (#1020, part 4), in Chromium.
// - The month's tab stop is the reference date; Enter on a day goes into its events and the «+N»,
//   Enter on an empty day emits `slot-open` for the whole day.
// - The «+N» opens its day in the day view, focused, at `scroll-to`: the grid scrolled to 08:00 even
//   though the focus scrolled it first (the all-day row is sticky, and its offsetTop moved with it).
// - A month bar is named by its days, not only the first.
// - The year moves by day and week across months; Enter opens the day.
// - The agenda lists the period's events by day; a click emits `event-open`.
//
// On the `scheduler-month`, `-year` and `-agenda` scenarios: September 2026 in Rome, from Tuesday the 22nd.
// September, not November: a scenario holding today's date would mark it, and its baseline would change.

import { test, expect, type Page } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES, schemeFor } from '../../manifests/_themes';

const THEME = THEMES[0];
const root = '[data-test="scheduler"]';

async function open(page: Page, scenario: string) {
    await goToScenario(page, scenario, THEME, { page: scenarioPage[scenario], scheme: schemeFor(THEME) });
    return page.locator(`section:not([hidden]) ${root}`);
}

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

test.describe('the scheduler month', () => {
    test('its tab stop is the reference date, and it names the month', async ({ page }) => {
        const scheduler = await open(page, 'scheduler-month');
        await expect(scheduler.getByRole('grid', { name: 'September 2026' })).toHaveCount(1);
        // Tuesday 22 September: the week from 21 September is row 3 (from 31 August), Tuesday column 1.
        await expect(scheduler.locator('[role="gridcell"][tabindex="0"]')).toHaveAttribute('data-row', '3');
        await expect(scheduler.locator('[role="gridcell"][tabindex="0"]')).toHaveAttribute('data-col', '1');
    });

    test('a bar over several days is named by them', async ({ page }) => {
        const scheduler = await open(page, 'scheduler-month');
        await expect(scheduler.getByRole('button', { name: /^Trip, All day, Friday, September 25\s–\sSunday, September 27, 2026$/ })).toHaveCount(1);
        await expect(scheduler.getByRole('button', { name: /^Call, 10:30\sAM, Tuesday, September 22, 2026$/ })).toHaveCount(1);
    });

    test('Enter on a day goes into its events and its «+N»; on an empty day, slot-open for the day', async ({ page }) => {
        const scheduler = await open(page, 'scheduler-month');
        await record(page, ['slot-open']);
        const thursday = scheduler.locator('[data-row="3"][data-col="3"]');
        await thursday.focus();
        await page.keyboard.press('Enter');
        await expect(scheduler.locator('[data-id="t1"]')).toBeFocused();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await expect(scheduler.getByRole('button', { name: '2 more events, Thursday, September 24, 2026' })).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(thursday).toBeFocused();
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('Enter');
        // Wednesday 23 September in Rome (summer time): 22:00 UTC the day before, to 22:00 UTC.
        expect(await events(page)).toEqual([
            { type: 'slot-open', detail: { start: '2026-09-22T22:00:00.000Z', end: '2026-09-23T22:00:00.000Z', resource: null, allDay: true } },
        ]);
    });

    test('the «+N» opens its day, focused at scroll-to', async ({ page }) => {
        const scheduler = await open(page, 'scheduler-month');
        await record(page, ['period-change']);
        await scheduler.locator('[data-part="more"]').click();
        await expect(scheduler.locator('[data-part="period"]')).toHaveText('Thursday, September 24, 2026');
        expect(await events(page)).toEqual([{ type: 'period-change', detail: { view: 'day', start: '2026-09-24', end: '2026-09-25' } }]);
        // The scenario's hours start at midnight; scroll-to is 08:00, the 17th slot of half an hour: row 17.
        const eight = scheduler.locator('[data-row="17"][data-col="0"]');
        await expect(eight).toBeFocused();
        // The 08:00 slot is the first under the all-day row, not the last in the window.
        await expect.poll(async () => {
            const [cell, head] = await Promise.all([eight.boundingBox(), scheduler.locator('[data-part="allDayRow"] [role="rowheader"]').boundingBox()]);
            return Math.abs(Math.round((cell?.y ?? 0) - ((head?.y ?? 0) + (head?.height ?? 0))));
        }).toBeLessThanOrEqual(2);
    });
});

test.describe('the scheduler year', () => {
    test('the arrows move by day and week across months; Enter opens the day', async ({ page }) => {
        const scheduler = await open(page, 'scheduler-year');
        await expect(scheduler.locator('[data-date][tabindex="0"]')).toHaveAttribute('data-date', '2026-09-22');
        await expect(scheduler.getByRole('gridcell', { name: 'Thursday, September 24, 2026, 4 events' })).toHaveCount(1);
        await scheduler.locator('[data-date="2026-09-22"]').focus();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowRight');
        await expect(scheduler.locator('[data-date="2026-10-07"]')).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(scheduler.locator('[data-part="period"]')).toHaveText('Wednesday, October 7, 2026');
    });
});

test.describe('the scheduler agenda', () => {
    test('the period\'s events by day; a click opens one', async ({ page }) => {
        const scheduler = await open(page, 'scheduler-agenda');
        await record(page, ['event-open']);
        const list = scheduler.locator('[data-part="agendaList"]');
        // From Tuesday 22 September, seven days: the call, Thursday's four, the trip from Friday on.
        await expect(list.getByRole('list')).toHaveCount(6);
        await expect(list.getByRole('list', { name: 'Thursday, September 24, 2026' }).getByRole('button')).toHaveCount(4);
        await list.getByRole('button', { name: /Call/ }).click();
        const got = await events(page);
        expect(got.map((e) => (e.detail.event as { id: string }).id)).toEqual(['call']);
    });
});
