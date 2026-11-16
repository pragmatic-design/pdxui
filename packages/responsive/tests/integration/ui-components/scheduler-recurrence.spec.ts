// pdx-scheduler's recurring events (#1020, part 8b), in Chromium:
// - a series (an event with `rrule`) is drawn once per occurrence in the period; EXDATE leaves one out;
// - an override (`seriesId` and `recurrenceId`) takes its occurrence's place;
// - moving or resizing an occurrence asks `before-move` / `before-resize` with `scope: 'occurrence'`;
//   left so, it writes an override to `events` and leaves the series alone; set to 'series' by the
//   app, it moves the series and writes no override.
//
// On `scheduler-recurring`: the week of Monday 21 September 2026 in Rome, 08:00–18:00 in half hours
// (row 3 is 09:00, row 4 09:30; Monday is column 0). The series «Daily» is every weekday at 9:00,
// from Monday 14.

import { test, expect, type Page, type Locator } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES, schemeFor } from '../../manifests/_themes';

const THEME = THEMES[0];
const root = '[data-test="scheduler"]';

async function open(page: Page): Promise<Locator> {
    await goToScenario(page, 'scheduler-recurring', THEME, { page: scenarioPage['scheduler-recurring'], scheme: schemeFor(THEME) });
    return page.locator(`section:not([hidden]) ${root}`);
}
type Recorded = { type: string; detail: Record<string, unknown> };
/** Record these events; `series` makes the app answer `before-*` with scope 'series'. */
async function record(page: Page, names: string[], series = false): Promise<void> {
    await page.evaluate(([sel, list, wholeSeries]) => {
        const w = window as unknown as { __events: { type: string; detail: unknown }[] };
        w.__events = [];
        const host = document.querySelector(`section:not([hidden]) ${sel}`) as HTMLElement;
        for (const n of list) host.addEventListener(n, (e) => {
            const d = (e as CustomEvent).detail as { scope?: string };
            w.__events.push({ type: n, detail: { ...d } });
            if (wholeSeries && n.startsWith('before-')) d.scope = 'series';
        });
    }, [root, names, series] as const);
}
const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Recorded[] }).__events);
/** The scheduler's `events`, as it wrote them. */
const written = (s: Locator) => s.evaluate((el) => (el as HTMLElement & { events: Record<string, unknown>[] }).events);
const setEvents = (s: Locator, list: unknown[]) => s.evaluate((el, l) => { (el as HTMLElement & { events: unknown }).events = l; }, list);
const cell = (s: Locator, row: number, col: number) => s.locator(`[role="gridcell"][data-row="${row}"][data-col="${col}"]`);
const daily = (s: Locator) => s.locator('[data-part="event"]').filter({ hasText: 'Daily' });

/** Lift the occurrence in cell (`row`, `col`) from the keyboard. */
async function lift(page: Page, s: Locator, row: number, col: number): Promise<void> {
    await cell(s, row, col).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
}

test.describe('the scheduler, recurring events', () => {
    test('a series is drawn once per occurrence in the period; EXDATE leaves one out', async ({ page }) => {
        const s = await open(page);
        for (let col = 0; col < 5; col++) await expect(cell(s, 3, col).locator('[data-part="event"]')).toHaveCount(1);
        await expect(cell(s, 3, 5).locator('[data-part="event"]')).toHaveCount(0);
        await expect(daily(s)).toHaveCount(5);
        const [series] = await written(s);
        await setEvents(s, [{ ...series, exdate: ['2026-09-23T09:00'] }]);
        await expect(daily(s)).toHaveCount(4);
        await expect(cell(s, 3, 2).locator('[data-part="event"]')).toHaveCount(0);
    });

    test('an override takes its occurrence\'s place', async ({ page }) => {
        const s = await open(page);
        const [series] = await written(s);
        await setEvents(s, [series, { id: 'moved', title: 'Daily', start: '2026-09-24T11:00', end: '2026-09-24T11:30', seriesId: 'daily', recurrenceId: '2026-09-24T09:00' }]);
        await expect(cell(s, 3, 3).locator('[data-part="event"]')).toHaveCount(0);
        await expect(cell(s, 7, 3).locator('[data-part="event"][data-id="moved"]')).toHaveCount(1);
        await expect(daily(s)).toHaveCount(5);
    });

    test('moving an occurrence asks with scope occurrence, then writes an override and leaves the series', async ({ page }) => {
        const s = await open(page);
        await record(page, ['before-move', 'move']);
        await lift(page, s, 3, 2);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        const got = await events(page);
        expect(got.map((e) => e.type)).toEqual(['before-move', 'move']);
        expect(got[0].detail.scope).toBe('occurrence');
        const list = await written(s);
        expect(list).toHaveLength(2);
        expect(list[0]).toEqual(expect.objectContaining({ id: 'daily', start: '2026-09-14T09:00', rrule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR' }));
        expect(list[1]).toEqual(expect.objectContaining({ seriesId: 'daily', recurrenceId: '2026-09-23T09:00', start: '2026-09-23T09:30', end: '2026-09-23T10:00' }));
        expect(list[1].id).not.toBe('daily');
        expect(list[1].rrule).toBeUndefined();
        await expect(cell(s, 4, 2).locator('[data-part="event"]')).toHaveCount(1);
        await expect(cell(s, 3, 2).locator('[data-part="event"]')).toHaveCount(0);
        await expect(cell(s, 3, 1).locator('[data-part="event"]')).toHaveCount(1);
        // The moved occurrence keeps the focus, under its new id.
        await expect(cell(s, 4, 2).locator('[data-part="eventButton"]')).toBeFocused();
    });

    test('with scope series from the app, the whole series moves and no override is written', async ({ page }) => {
        const s = await open(page);
        await record(page, ['before-move', 'move'], true);
        await lift(page, s, 3, 2);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        const got = await events(page);
        expect(got.map((e) => e.type)).toEqual(['before-move', 'move']);
        expect(got[1].detail.scope).toBe('series');
        const list = await written(s);
        expect(list).toEqual([expect.objectContaining({ id: 'daily', start: '2026-09-14T09:30', end: '2026-09-14T10:00' })]);
        for (let col = 0; col < 5; col++) await expect(cell(s, 4, col).locator('[data-part="event"]')).toHaveCount(1);
    });

    test('resizing an occurrence writes an override with the new end', async ({ page }) => {
        const s = await open(page);
        await record(page, ['before-resize', 'resize']);
        await lift(page, s, 3, 0);
        await page.keyboard.press('Shift+ArrowDown');
        await page.keyboard.press('Enter');
        const got = await events(page);
        expect(got[0].detail).toEqual(expect.objectContaining({ edge: 'end', scope: 'occurrence' }));
        const list = await written(s);
        expect(list[1]).toEqual(expect.objectContaining({ seriesId: 'daily', recurrenceId: '2026-09-21T09:00', start: '2026-09-21T09:00', end: '2026-09-21T10:00' }));
    });

    test('a refused move writes nothing', async ({ page }) => {
        const s = await open(page);
        await page.evaluate((sel) => document.querySelector(`section:not([hidden]) ${sel}`)!.addEventListener('before-move', (e) => e.preventDefault()), root);
        await lift(page, s, 3, 2);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        expect(await written(s)).toHaveLength(1);
        await expect(cell(s, 3, 2).locator('[data-part="event"]')).toHaveCount(1);
    });
});
