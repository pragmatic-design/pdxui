// pdx-scheduler with a single pointer (#1020, part 7c; WCAG 2.2 2.5.7), in Chromium:
// - an event is a container: its button carries the name, and a ⋯ menu button sits inside it;
// - «Move» or «Resize» in the ⋯ picks the event up, and a click on a slot puts it there (or ends it
//   there), asking `before-move` or `before-resize` first; Escape puts it back;
// - from the keyboard the ⋯ comes after its event, and its «Move» lifts the event for the arrows;
// - the ⋯ shows on hover and focus, and always for a coarse pointer; a disabled scheduler has none.
//
// On the `scheduler-week` scenario: September 2026 in Rome, 08:00–18:00 in half hours. Row 1 is 08:00,
// row 3 09:00, row 9 12:00; Monday 21 is column 0. Stand-up is Monday 09:00–09:30, Review Tuesday
// 10:00–12:00.

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
        const host = document.querySelector(`section:not([hidden]) ${sel}`) as HTMLElement;
        for (const n of list) host.addEventListener(n, (e) => { w.__events.push({ type: n, detail: (e as CustomEvent).detail }); });
    }, [root, names] as const);
}
type Recorded = { type: string; detail: Record<string, unknown> };
const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Recorded[] }).__events);
const announced = (page: Page) => page.evaluate(() => document.querySelector('body > [role="status"][aria-atomic="true"]')?.textContent ?? '');
const cell = (s: Locator, row: number, col: number) => s.locator(`[role="gridcell"][data-row="${row}"][data-col="${col}"]`);
const eventOf = (s: Locator, id: string) => s.locator(`[data-part="event"][data-id="${id}"]`);
const menuOf = (s: Locator, id: string) => eventOf(s, id).locator('[data-part="eventMenu"]');
const lifted = (s: Locator) => s.evaluate((el) => el.matches(':state(lifted)'));

test.describe('the scheduler with a single pointer', () => {
    test('an event is a container: its button carries the name, its ⋯ opens a menu', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        const standup = eventOf(s, 'standup');
        expect(await standup.evaluate((el) => el.tagName)).not.toBe('BUTTON');
        await expect(standup.locator('[data-part="eventButton"]')).toHaveAccessibleName(/^Stand-up, /);
        await expect(menuOf(s, 'standup')).toHaveAccessibleName('Change Stand-up');
        await expect(menuOf(s, 'standup')).toHaveAttribute('aria-haspopup', 'menu');
    });

    test('Move in the ⋯ picks the event up; a click on a slot moves it there, asking first', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await record(page, ['before-move', 'move', 'slot-open', 'event-open']);
        await menuOf(s, 'standup').click();
        await page.getByRole('menuitem', { name: 'Move' }).click();
        expect(await lifted(s)).toBe(true);
        await expect.poll(() => announced(page)).toContain('Stand-up picked up');
        await cell(s, 4, 1).click();
        const got = await events(page);
        expect(got.map((e) => e.type)).toEqual(['before-move', 'move']);
        expect(got[1].detail.to).toEqual({ start: '2026-09-22T09:30', end: '2026-09-22T10:00' });
        expect(await lifted(s)).toBe(false);
        await expect(cell(s, 4, 1).locator('[data-id="standup"]')).toHaveCount(1);
    });

    test('Resize in the ⋯, then a click on a slot ends the event in it', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await record(page, ['before-resize', 'resize']);
        await menuOf(s, 'review').click();
        await page.getByRole('menuitem', { name: 'Resize' }).click();
        await cell(s, 9, 1).click();
        const got = await events(page);
        expect(got.map((e) => e.type)).toEqual(['before-resize', 'resize']);
        expect(got[1].detail).toEqual(expect.objectContaining({ edge: 'end', to: { start: '2026-09-22T10:00', end: '2026-09-22T12:30' } }));
    });

    test('Escape puts an event picked from the ⋯ back; nothing is changed', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await record(page, ['before-move', 'move']);
        await menuOf(s, 'standup').click();
        await page.getByRole('menuitem', { name: 'Move' }).click();
        await page.keyboard.press('Escape');
        expect(await lifted(s)).toBe(false);
        expect(await events(page)).toEqual([]);
        await expect(cell(s, 3, 0).locator('[data-id="standup"]:not([data-dragging])')).toHaveCount(1);
    });

    test('from the keyboard the ⋯ comes after its event, and its Move lifts the event for the arrows', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await record(page, ['move']);
        await cell(s, 3, 0).focus();
        await page.keyboard.press('Enter');
        await expect(eventOf(s, 'standup').locator('[data-part="eventButton"]')).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(menuOf(s, 'standup')).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('menuitem', { name: 'Move' })).toBeFocused();
        await page.keyboard.press('Enter');
        expect(await lifted(s)).toBe(true);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        const [moved] = await events(page);
        expect(moved.detail.to).toEqual({ start: '2026-09-21T09:30', end: '2026-09-21T10:00' });
    });

    test('the ⋯ shows on hover and on focus, not before', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        const opacity = () => menuOf(s, 'review').evaluate((el) => getComputedStyle(el).opacity);
        expect(await opacity()).toBe('0');
        await eventOf(s, 'review').hover();
        await expect.poll(opacity).toBe('1');
    });

    test('a disabled scheduler draws no ⋯', async ({ page }) => {
        const s = await open(page, 'scheduler-disabled');
        await expect(eventOf(s, 'standup')).toHaveCount(1);
        await expect(s.locator('[data-part="eventMenu"]')).toHaveCount(0);
    });
});

test.describe('the scheduler with a coarse pointer', () => {
    test.use({ hasTouch: true, isMobile: true });

    test('the ⋯ is always shown', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
        expect(await menuOf(s, 'review').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    });
});
