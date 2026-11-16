// pdx-scheduler from the keyboard (#1020, part 7), in Chromium:
// - Space on a focused event lifts it; the arrows carry it a cell, Space or Enter drops it, asking
//   `before-move` first; Escape puts it back. The event keeps the focus, and each step is announced.
// - Shift+arrows move its end, Alt+Shift+arrows its start: `before-resize`, then `resize`.
// - Enter on an event that is not lifted still opens it; Tab does not leave a lifted event behind.
// - The timeline carries an event to another resource's row; the month, to the next day.
// - Shift+arrows on an empty cell select slots or days, drawn as a drag over them draws them; Enter
//   creates an event there, asking `before-create` first; Escape drops the selection, and so does an
//   arrow without Shift.
//
// On the `scheduler-week`, `scheduler-timeline` and `scheduler-month` scenarios: September 2026 in Rome.
// The week's grid starts at 08:00 with half-hour slots: row 1 is 08:00, row 3 09:00; Monday 21 is
// column 0. Stand-up is Monday 09:00–09:30, Review Tuesday 10:00–12:00.

import { test, expect, type Page, type Locator } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES, schemeFor } from '../../manifests/_themes';

const THEME = THEMES[0];
const root = '[data-test="scheduler"]';

async function open(page: Page, scenario: string): Promise<Locator> {
    await goToScenario(page, scenario, THEME, { page: scenarioPage[scenario], scheme: schemeFor(THEME) });
    return page.locator(`section:not([hidden]) ${root}`);
}

/** Record the scheduler's events of these names. */
async function record(page: Page, names: string[]): Promise<void> {
    await page.evaluate(([sel, list]) => {
        const w = window as unknown as { __events: { type: string; detail: unknown }[] };
        w.__events = [];
        const host = (document.querySelector(`section:not([hidden]) ${sel}`) ?? document.querySelector(sel)) as HTMLElement;
        for (const n of list) host.addEventListener(n, (e) => { w.__events.push({ type: n, detail: (e as CustomEvent).detail }); });
    }, [root, names] as const);
}
type Recorded = { type: string; detail: Record<string, unknown> };
const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Recorded[] }).__events);
const announced = (page: Page) => page.evaluate(() => document.querySelector('body > [role="status"][aria-atomic="true"]')?.textContent ?? '');
const cell = (s: Locator, row: number, col: number) => s.locator(`[role="gridcell"][data-row="${row}"][data-col="${col}"]`);
/** The id of the event whose button has the focus; null when the focus is anywhere else, its ⋯ too. */
const focusedId = (page: Page) => page.evaluate(() => {
    const el = document.activeElement;
    return el?.matches('[data-part="eventButton"]') ? (el.closest('[data-part="event"]') as HTMLElement | null)?.dataset.id ?? null : null;
});
const lifted = (s: Locator) => s.evaluate((el) => el.matches(':state(lifted)'));

test.describe('the scheduler from the keyboard, a week', () => {
    test('Space lifts an event, an arrow carries it a slot, Space drops it, asking first', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await record(page, ['before-move', 'move', 'event-open']);
        await s.getByRole('button', { name: /^Stand-up, / }).focus();
        await page.keyboard.press('Space');
        expect(await lifted(s)).toBe(true);
        await expect.poll(() => announced(page)).toContain('Stand-up lifted');
        await page.keyboard.press('ArrowDown');
        await expect(cell(s, 4, 0).locator('[data-id="standup"][data-dragging]')).toHaveCount(1);
        expect(await focusedId(page)).toBe('standup');
        // Intl writes the range with thin and narrow no-break spaces, which `\s` matches.
        await expect.poll(() => announced(page)).toMatch(/^9:30\s–\s10:00\sAM, Monday, September 21/);
        await page.keyboard.press('Space');
        const got = await events(page);
        expect(got.map((e) => e.type)).toEqual(['before-move', 'move']);
        expect(got[1].detail.to).toEqual({ start: '2026-09-21T09:30', end: '2026-09-21T10:00' });
        expect(await lifted(s)).toBe(false);
        await expect(cell(s, 4, 0).locator('[data-id="standup"]:not([data-dragging])')).toHaveCount(1);
        expect(await focusedId(page)).toBe('standup');
    });

    test('Escape puts a lifted event back, and says so', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await record(page, ['before-move', 'move']);
        await s.getByRole('button', { name: /^Stand-up, / }).focus();
        await page.keyboard.press('Space');
        await page.keyboard.press('ArrowRight');
        await expect(cell(s, 3, 1).locator('[data-id="standup"]')).toHaveCount(1);
        await page.keyboard.press('Escape');
        expect(await events(page)).toEqual([]);
        await expect(cell(s, 3, 0).locator('[data-id="standup"]:not([data-dragging])')).toHaveCount(1);
        expect(await focusedId(page)).toBe('standup');
        await expect.poll(() => announced(page)).toContain('cancelled');
    });

    test('Shift+arrows move the end, Alt+Shift+arrows the start: before-resize, then resize', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await record(page, ['before-resize', 'resize']);
        await s.getByRole('button', { name: /^Review, / }).focus();
        await page.keyboard.press('Space');
        await page.keyboard.press('Shift+ArrowDown');
        await page.keyboard.press('Shift+ArrowDown');
        await page.keyboard.press('Enter');
        let got = await events(page);
        expect(got.map((e) => e.type)).toEqual(['before-resize', 'resize']);
        expect(got[1].detail).toEqual(expect.objectContaining({ edge: 'end', to: { start: '2026-09-22T10:00', end: '2026-09-22T13:00' } }));
        await record(page, ['before-resize', 'resize']);
        await page.keyboard.press('Space');
        await page.keyboard.press('Alt+Shift+ArrowUp');
        await page.keyboard.press('Space');
        got = await events(page);
        expect(got[1].detail).toEqual(expect.objectContaining({ edge: 'start', to: { start: '2026-09-22T09:30', end: '2026-09-22T13:00' } }));
    });

    test('Enter on an event that is not lifted still opens it; Tab keeps a lifted event focused', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await record(page, ['event-open', 'move']);
        const standup = s.getByRole('button', { name: /^Stand-up, / });
        await standup.focus();
        await page.keyboard.press('Enter');
        expect((await events(page)).map((e) => e.type)).toEqual(['event-open']);
        await standup.focus();
        await page.keyboard.press('Space');
        await page.keyboard.press('Tab');
        expect(await focusedId(page)).toBe('standup');
        expect(await lifted(s)).toBe(true);
        await page.keyboard.press('Escape');
        expect((await events(page)).map((e) => e.type)).toEqual(['event-open']);
    });

    test('a movable event says how it moves', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await expect(s.getByRole('button', { name: /^Stand-up, / })).toHaveAccessibleDescription(/Space/);
    });
});

test.describe('the scheduler from the keyboard, timeline and month', () => {
    test('in the timeline Down carries an event to the next resource\'s row', async ({ page }) => {
        const s = await open(page, 'scheduler-timeline');
        await record(page, ['move']);
        await s.getByRole('button', { name: /^Audit, / }).focus();
        await page.keyboard.press('Space');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Space');
        const [moved] = await events(page);
        expect(moved.detail.to).toEqual({ start: '2026-09-22T12:00', end: '2026-09-23T12:00', resource: 'b' });
    });

    test('in the month Right carries an event to the next day, at its own hour', async ({ page }) => {
        const s = await open(page, 'scheduler-month');
        await record(page, ['move']);
        await s.getByRole('button', { name: /^Call, / }).focus();
        await page.keyboard.press('Space');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Enter');
        const [moved] = await events(page);
        expect(moved.detail.to).toEqual({ start: '2026-09-23T10:30', end: '2026-09-23T11:00' });
    });
});

const selecting = (s: Locator) => s.evaluate((el) => el.matches(':state(selecting)'));
const focusedCell = (page: Page) => page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el?.getAttribute('role') === 'gridcell' ? { row: Number(el.dataset.row), col: Number(el.dataset.col) } : null;
});

test.describe('the scheduler from the keyboard, creating', () => {
    test('Shift+Down over empty slots selects them, drawn; Enter creates an event there, asking first', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await record(page, ['before-create', 'create', 'slot-open']);
        await cell(s, 1, 0).focus();
        await page.keyboard.press('Shift+ArrowDown');
        expect(await selecting(s)).toBe(true);
        expect(await focusedCell(page)).toEqual({ row: 2, col: 0 });
        // The range is drawn where a drag over it would draw it: a new event in the slot it starts in.
        await expect(cell(s, 1, 0).locator('[data-part="event"][data-dragging]')).toHaveCount(1);
        await expect.poll(() => announced(page)).toMatch(/^8:00\s–\s9:00\sAM, Monday, September 21, 2026 selected\./);
        await page.keyboard.press('Enter');
        const got = await events(page);
        expect(got.map((e) => e.type)).toEqual(['before-create', 'create']);
        expect(got[0].detail).toEqual(expect.objectContaining({ start: '2026-09-21T06:00:00.000Z', end: '2026-09-21T07:00:00.000Z', resource: null, allDay: false }));
        expect(await selecting(s)).toBe(false);
        await expect(cell(s, 1, 0).locator('[data-part="event"]:not([data-dragging])')).toHaveCount(1);
        expect(await focusedCell(page)).toEqual({ row: 2, col: 0 });
    });

    test('Escape drops the selection, and so does an arrow without Shift; nothing is created', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await record(page, ['before-create', 'create']);
        await cell(s, 1, 0).focus();
        await page.keyboard.press('Shift+ArrowDown');
        await page.keyboard.press('Escape');
        expect(await selecting(s)).toBe(false);
        await expect(s.locator('[data-part="event"][data-dragging]')).toHaveCount(0);
        expect(await focusedCell(page)).toEqual({ row: 2, col: 0 });
        await page.keyboard.press('Shift+ArrowDown');
        await page.keyboard.press('ArrowRight');
        expect(await selecting(s)).toBe(false);
        expect(await focusedCell(page)).toEqual({ row: 3, col: 1 });
        await page.keyboard.press('Enter');
        expect((await events(page)).map((e) => e.type)).toEqual([]);
    });

    test('a refused create leaves the events as they were', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await page.evaluate((sel) => document.querySelector(`section:not([hidden]) ${sel}`)!.addEventListener('before-create', (e) => e.preventDefault()), root);
        await record(page, ['create', 'rejected']);
        await cell(s, 1, 0).focus();
        await page.keyboard.press('Shift+ArrowDown');
        await page.keyboard.press('Enter');
        expect((await events(page)).map((e) => e.type)).toEqual(['rejected']);
        await expect(cell(s, 1, 0).locator('[data-part="event"]')).toHaveCount(0);
    });

    test('in the month Shift+Right selects the next day too: a two-day event', async ({ page }) => {
        const s = await open(page, 'scheduler-month');
        await record(page, ['create']);
        // Wednesday 2 September: the first week's third day.
        await cell(s, 0, 2).focus();
        await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.press('Enter');
        const [made] = await events(page);
        expect(made.detail.event).toEqual(expect.objectContaining({ start: '2026-09-02', end: '2026-09-04', allDay: true }));
    });

    test('in the timeline Shift+Right selects along a resource\'s row; Shift+Down does not leave it', async ({ page }) => {
        const s = await open(page, 'scheduler-timeline');
        await record(page, ['create']);
        // Room B, Monday 21.
        await cell(s, 2, 1).focus();
        await page.keyboard.press('Shift+ArrowDown');
        expect(await selecting(s)).toBe(false);
        expect(await focusedCell(page)).toEqual({ row: 2, col: 1 });
        await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.press('Enter');
        const [made] = await events(page);
        expect(made.detail.event).toEqual(expect.objectContaining({ start: '2026-09-21', end: '2026-09-23', allDay: true, resource: 'b' }));
    });

    test('the grid says how to create from the keyboard', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await expect(s.getByRole('grid')).toHaveAccessibleDescription(/Shift/);
    });
});
