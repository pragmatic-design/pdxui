// pdx-scheduler's built-in editor on repeating events (#1020, part 9b), in Chromium:
// - on an occurrence of a series it asks how far a change goes, «This occurrence» first; Save and
//   Delete say it in `before-save` / `before-remove` (`scope`). This occurrence: an override, or the
//   occurrence into the series' `exdate`. The whole series: the series changed, or removed.
// - with the whole series, «Repeats» edits the series' rule through its fields, never a typed string;
// - a plain event is made a series from the same fields.
//
// On `scheduler-editor-series`: the week of Monday 21 September 2026 in Rome, 08:00–18:00 in half hours
// (row 3 is 09:00; Monday is column 0). «Daily» is FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR at 9:00 from the
// 14th. On `scheduler-editor`, Stand-up is a plain event, Monday 09:00–09:30.

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
type Recorded = { type: string; detail: Record<string, unknown> };
async function record(page: Page, names: string[]): Promise<void> {
    await page.evaluate(([sel, list]) => {
        const w = window as unknown as { __events: { type: string; detail: unknown }[] };
        w.__events = [];
        const host = document.querySelector(`section:not([hidden]) ${sel}`) as HTMLElement;
        for (const n of list) host.addEventListener(n, (e) => { w.__events.push({ type: n, detail: (e as CustomEvent).detail }); });
    }, [root, names] as const);
}
const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Recorded[] }).__events);
const written = (s: Locator) => s.evaluate((el) => (el as HTMLElement & { events: Record<string, unknown>[] }).events);
const cell = (s: Locator, row: number, col: number) => s.locator(`[role="gridcell"][data-row="${row}"][data-col="${col}"]`);
const eventIn = (s: Locator, row: number, col: number) => cell(s, row, col).locator('[data-part="event"]');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Edit event' });

/** Enter on the event in cell (`row`, `col`): the editor opens on it. */
async function edit(page: Page, s: Locator, row: number, col: number): Promise<Locator> {
    await cell(s, row, col).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toBeVisible();
    return dialog(page);
}
/** Pick `option` in the select labelled `label`. */
async function choose(page: Page, d: Locator, label: string, option: string): Promise<void> {
    await d.getByRole('combobox', { name: label }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
}

test.describe('the editor on an occurrence of a series', () => {
    test('it asks how far a change goes, this occurrence first; the repeats are the series\', shown for it', async ({ page }) => {
        const s = await open(page, 'scheduler-editor-series');
        const d = await edit(page, s, 3, 2);
        await expect(d.getByRole('radio', { name: 'This occurrence' })).toBeChecked();
        await expect(d.getByRole('combobox', { name: 'Repeats' })).toHaveCount(0);
        await d.getByRole('radio', { name: 'The whole series' }).check();
        await expect(d.getByRole('combobox', { name: 'Repeats' })).toContainText('Every week');
        await expect(d.getByRole('button', { name: 'Friday' })).toHaveAttribute('aria-pressed', 'true');
    });

    test('this occurrence: an override, the series left alone', async ({ page }) => {
        const s = await open(page, 'scheduler-editor-series');
        await record(page, ['before-save', 'save']);
        const d = await edit(page, s, 3, 2);
        await d.getByLabel('Title', { exact: true }).fill('Daily, with guests');
        await d.getByRole('button', { name: 'Save' }).click();
        const got = await events(page);
        expect(got[0].detail.scope).toBe('occurrence');
        const list = await written(s);
        expect(list).toHaveLength(2);
        expect(list[0]).toEqual(expect.objectContaining({ id: 'daily', title: 'Daily' }));
        expect(list[1]).toEqual(expect.objectContaining({ seriesId: 'daily', recurrenceId: '2026-09-23T09:00', title: 'Daily, with guests' }));
    });

    test('the whole series: the series changed, every occurrence with it, no override', async ({ page }) => {
        const s = await open(page, 'scheduler-editor-series');
        await record(page, ['before-save', 'save']);
        const d = await edit(page, s, 3, 2);
        await d.getByRole('radio', { name: 'The whole series' }).check();
        await d.getByLabel('Title', { exact: true }).fill('Stand-up');
        await d.getByRole('button', { name: 'Save' }).click();
        const got = await events(page);
        expect(got[0].detail).toEqual(expect.objectContaining({ scope: 'series', previous: expect.objectContaining({ id: 'daily', title: 'Daily' }) }));
        const list = await written(s);
        expect(list).toEqual([expect.objectContaining({ id: 'daily', title: 'Stand-up', start: '2026-09-14T09:00', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' })]);
        for (let col = 0; col < 5; col++) await expect(eventIn(s, 3, col)).toContainText('Stand-up');
    });

    test('the whole series, Friday off: the rule is written from the weekdays, and Friday is gone', async ({ page }) => {
        const s = await open(page, 'scheduler-editor-series');
        const d = await edit(page, s, 3, 2);
        await d.getByRole('radio', { name: 'The whole series' }).check();
        await d.getByRole('button', { name: 'Friday' }).click();
        await d.getByRole('button', { name: 'Save' }).click();
        const [series] = await written(s);
        expect(series.rrule).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH');
        await expect(eventIn(s, 3, 4)).toHaveCount(0);
        await expect(eventIn(s, 3, 3)).toHaveCount(1);
    });

    test('Delete, this occurrence: into the series\' exdate', async ({ page }) => {
        const s = await open(page, 'scheduler-editor-series');
        await record(page, ['before-remove', 'remove']);
        const d = await edit(page, s, 3, 2);
        await d.getByRole('button', { name: 'Delete' }).click();
        expect((await events(page))[0].detail.scope).toBe('occurrence');
        expect(await written(s)).toEqual([expect.objectContaining({ id: 'daily', exdate: ['2026-09-23T09:00'] })]);
        await expect(eventIn(s, 3, 2)).toHaveCount(0);
        await expect(eventIn(s, 3, 1)).toHaveCount(1);
    });

    test('Delete, the whole series: the series is gone', async ({ page }) => {
        const s = await open(page, 'scheduler-editor-series');
        await record(page, ['before-remove', 'remove']);
        const d = await edit(page, s, 3, 2);
        await d.getByRole('radio', { name: 'The whole series' }).check();
        await d.getByRole('button', { name: 'Delete' }).click();
        const got = await events(page);
        expect(got[0].detail.scope).toBe('series');
        expect((got[1].detail.event as { id: string }).id).toBe('daily');
        expect(await written(s)).toEqual([]);
        await expect(s.locator('[data-part="event"]')).toHaveCount(0);
    });
});

test.describe('the editor on a plain event', () => {
    test('no question of scope; Repeats every day, ending after 3 times, makes it a series', async ({ page }) => {
        const s = await open(page, 'scheduler-editor');
        const d = await edit(page, s, 3, 0);
        await expect(d.getByRole('radio', { name: 'This occurrence' })).toHaveCount(0);
        await choose(page, d, 'Repeats', 'Every day');
        await choose(page, d, 'Ends', 'After');
        await d.getByRole('spinbutton', { name: 'Times' }).fill('3');
        await d.getByRole('button', { name: 'Save' }).click();
        const standup = (await written(s)).find((e) => e.id === 'standup');
        expect(standup?.rrule).toBe('FREQ=DAILY;COUNT=3');
        for (const col of [0, 1, 2]) await expect(eventIn(s, 3, col)).toHaveCount(1);
        await expect(eventIn(s, 3, 3)).toHaveCount(0);
    });
});
