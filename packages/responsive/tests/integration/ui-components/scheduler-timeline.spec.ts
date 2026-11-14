// pdx-scheduler's timeline (#1020, part 5), in Chromium.
// - 500 resources over a day of half-hour slots: only the rows and columns in view are in the DOM, and
//   scrolling brings the others in, the last resource's event included.
// - The grid's one tab stop stays drawn and focused while the arrows walk it far out of the first window.
// - A parent row opens and closes with Enter and the arrows, as a treegrid's; its children go and come.
// - A click on a cell emits `slot-open` with the column's instants and the row's resource.
//
// On the `scheduler-timeline` and `scheduler-timeline-many` scenarios: September 2026 in Rome, from
// Tuesday the 22nd (see the manifest for why September).

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

async function record(page: Page, names: string[]): Promise<void> {
    await page.evaluate(([sel, list]) => {
        const w = window as unknown as { __events: { type: string; detail: unknown }[] };
        w.__events = [];
        const host = document.querySelector(`section:not([hidden]) ${sel}`) as HTMLElement;
        for (const n of list) host.addEventListener(n, (e) => w.__events.push({ type: n, detail: (e as CustomEvent).detail }));
    }, [root, names] as const);
}
const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: { type: string; detail: Record<string, unknown> }[] }).__events);

test.describe('the scheduler timeline, 500 resources', () => {
    test('draws the rows and columns in view, not 24 000 cells', async ({ page }) => {
        const scheduler = await open(page, 'scheduler-timeline-many');
        const grid = scheduler.getByRole('grid', { name: 'Tuesday, September 22, 2026' });
        await expect(grid).toHaveAttribute('aria-rowcount', '501');
        await expect(grid).toHaveAttribute('aria-colcount', '49');
        const rows = await scheduler.locator('[role="row"][aria-rowindex]:not([aria-rowindex="1"])').count();
        const cells = await scheduler.locator('[role="gridcell"]').count();
        expect(rows, 'rows in the DOM').toBeGreaterThan(5);
        expect(rows, 'rows in the DOM').toBeLessThan(40);
        expect(cells, 'cells in the DOM').toBeLessThan(40 * 20);
        await expect(scheduler.getByRole('button', { name: /^First, 9:00\sAM/ })).toHaveCount(1);
        await expect(scheduler.locator('[data-id="last"]')).toHaveCount(0);
    });

    test('opens at scroll-to, and scrolling brings in the last resource and its event', async ({ page }) => {
        const scheduler = await open(page, 'scheduler-timeline-many');
        const grid = scheduler.locator('[data-part="grid"]');
        // 08:00 is the 17th half-hour slot: its header is the first one right of the resources' column.
        await expect(scheduler.getByRole('columnheader', { name: '8:00 AM, Tuesday, September 22, 2026' })).toBeInViewport();
        await grid.evaluate((g) => { g.scrollTop = g.scrollHeight; });
        await expect(scheduler.getByRole('rowheader', { name: 'Resource 500' })).toBeVisible();
        await expect(scheduler.locator('[data-id="last"]')).toBeVisible();
        const rows = await scheduler.locator('[role="row"][aria-rowindex]:not([aria-rowindex="1"])').count();
        expect(rows, 'rows in the DOM at the bottom').toBeLessThan(40);
        await expect(scheduler.getByRole('row', { name: /Resource 500/ })).toHaveAttribute('aria-rowindex', '501');
        // Another period opens at scroll-to too, wherever the last one was scrolled.
        await grid.evaluate((g) => { g.scrollLeft = 0; });
        await scheduler.locator('[data-part="next"]').click();
        await expect(scheduler.getByRole('columnheader', { name: '8:00 AM, Wednesday, September 23, 2026' })).toBeInViewport();
    });

    test('the tab stop is drawn wherever the arrows take it', async ({ page }) => {
        const scheduler = await open(page, 'scheduler-timeline-many');
        await expect(scheduler.locator('[data-row="0"][tabindex="0"]')).toHaveAttribute('data-col', '17');
        await scheduler.locator('[data-row="0"][data-col="17"]').focus();
        for (let i = 0; i < 60; i++) await page.keyboard.press('ArrowDown');
        const cell = scheduler.locator('[data-row="60"][data-col="17"]');
        await expect(cell).toBeFocused();
        await expect(cell).toBeInViewport();
        await page.keyboard.press('End');
        await expect(scheduler.locator('[data-row="60"][data-col="48"]')).toBeFocused();
        await page.keyboard.press('Control+End');
        await expect(scheduler.locator('[data-row="499"][data-col="48"]')).toBeFocused();
        await page.keyboard.press('Home');
        await expect(scheduler.locator('[data-row="499"][data-col="0"]')).toBeFocused();
        // Scrolled back to the top by hand, the focused cell is still in the DOM: Tab still reaches the grid.
        await scheduler.locator('[data-part="grid"]').evaluate((g) => { g.scrollTop = 0; });
        await expect(scheduler.locator('[data-row="499"][data-col="0"]')).toHaveCount(1);
    });
});

test.describe('the scheduler timeline, resources that nest', () => {
    test('a treegrid: a parent opens and closes, its children go and come', async ({ page }) => {
        const scheduler = await open(page, 'scheduler-timeline');
        const grid = scheduler.getByRole('treegrid');
        await expect(grid).toHaveCount(1);
        const north = scheduler.getByRole('row', { name: /North site/ });
        await expect(north).toHaveAttribute('aria-expanded', 'true');
        await expect(north).toHaveAttribute('aria-level', '1');
        await expect(scheduler.getByRole('row', { name: /Room A/ })).toHaveAttribute('aria-level', '2');
        const head = scheduler.locator('[data-row="0"][data-col="0"]');
        await head.focus();
        await page.keyboard.press('Enter');
        await expect(north).toHaveAttribute('aria-expanded', 'false');
        await expect(scheduler.getByRole('rowheader', { name: 'Room A' })).toHaveCount(0);
        await expect(head).toBeFocused();
        // The van moved up into the rows the rooms left.
        await expect(scheduler.getByRole('row', { name: /Van/ })).toHaveAttribute('aria-rowindex', '3');
        await page.keyboard.press('ArrowRight');
        await expect(north).toHaveAttribute('aria-expanded', 'true');
        await page.keyboard.press('ArrowDown');
        await expect(scheduler.locator('[data-row="1"][data-col="0"]')).toBeFocused();
        // Left on a child goes to its parent; Left on an open parent closes it.
        await page.keyboard.press('ArrowLeft');
        await expect(head).toBeFocused();
        await page.keyboard.press('ArrowLeft');
        await expect(north).toHaveAttribute('aria-expanded', 'false');
        await head.click();
        await expect(north).toHaveAttribute('aria-expanded', 'true');
    });

    test('an event is named by its days and its resource; a click on a cell opens that slot', async ({ page }) => {
        const scheduler = await open(page, 'scheduler-timeline');
        await expect(scheduler.getByRole('button', { name: /^Audit, 12:00\sPM, Tuesday, September 22\s–\sWednesday, September 23, 2026, Room A$/ })).toHaveCount(1);
        await expect(scheduler.getByRole('button', { name: /^Move, All day, Monday, September 21\s–\sWednesday, September 23, 2026, Van$/ })).toHaveCount(1);
        await record(page, ['slot-open']);
        // Room B (row 2) on Monday 21 September (column 1): the whole day in Rome, summer time.
        await scheduler.locator('[data-row="2"][data-col="1"]').click();
        expect(await events(page)).toEqual([
            { type: 'slot-open', detail: { start: '2026-09-20T22:00:00.000Z', end: '2026-09-21T22:00:00.000Z', resource: 'b', allDay: true } },
        ]);
    });
});
