// pdx-scheduler from the keyboard (#1020, part 7), in Chromium:
// - Space on a focused event lifts it; the arrows carry it a cell, Space or Enter drops it, asking
//   `before-move` first; Escape puts it back. The event keeps the focus, and each step is announced.
// - Shift+arrows move its end, Alt+Shift+arrows its start: `before-resize`, then `resize`.
// - Enter on an event that is not lifted still opens it; Tab does not leave a lifted event behind.
// - The timeline carries an event to another resource's row; the month, to the next day.
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
const focusedId = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.id ?? null);
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
