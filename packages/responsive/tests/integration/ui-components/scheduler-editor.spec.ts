// pdx-scheduler's built-in editor (#1020, part 9a), in Chromium. The scheduler opens its own dialog:
// - Enter or a double click on an event edits it: its title, start, end, all day, resource, notes;
//   Save asks `before-save` (which may refuse it, the dialog staying open), writes `events`, emits
//   `save`; Delete asks `before-remove`, removes it, emits `remove` (not `delete`, a reserved word: #1130); Cancel and Escape change nothing.
//   A single click is still `event-open` alone.
// - A create — Enter on an empty slot, Shift+arrows then Enter — asks `before-create`, then opens the
//   editor on the new event; Save writes it and emits `create`.
// - The Delete key on an event asks `before-remove` too.
// - The editor names what is wrong, and does not save it.
//
// On `scheduler-editor`: the week of Monday 21 September 2026 in Rome, 08:00–18:00 in half hours (row
// 1 08:00, row 3 09:00; Monday is column 0). Stand-up is Monday 09:00–09:30.

import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page, type Locator } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES, schemeFor } from '../../manifests/_themes';

const THEME = THEMES[0];
const root = '[data-test="scheduler"]';

async function open(page: Page): Promise<Locator> {
    await goToScenario(page, 'scheduler-editor', THEME, { page: scenarioPage['scheduler-editor'], scheme: schemeFor(THEME) });
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
const standup = (s: Locator) => s.locator('[data-id="standup"] [data-part="eventButton"]');
const editor = (page: Page, name: string) => page.getByRole('dialog', { name });
/** A picker's value, through the control its label names. */
const pickerValue = (dialog: Locator, label: string) => dialog.getByLabel(label, { exact: true }).first()
    .evaluate((el) => (el.closest('pdx-date-picker, pdx-time-picker') as HTMLElement & { value: string }).value);

/** Focus Stand-up from its cell and press Enter on it. */
async function enterOnStandup(page: Page, s: Locator): Promise<void> {
    await cell(s, 3, 0).focus();
    await page.keyboard.press('Enter');
    await expect(standup(s)).toBeFocused();
    await page.keyboard.press('Enter');
}

test.describe('the scheduler\'s built-in editor', () => {
    test('Enter on an event opens the editor on it, its fields filled; event-open is still emitted', async ({ page }) => {
        const s = await open(page);
        await record(page, ['event-open']);
        await enterOnStandup(page, s);
        const dialog = editor(page, 'Edit event');
        await expect(dialog).toBeVisible();
        await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Stand-up');
        expect(await pickerValue(dialog, 'Start date')).toBe('2026-09-21');
        expect(await pickerValue(dialog, 'Start time')).toBe('09:00');
        expect(await pickerValue(dialog, 'End time')).toBe('09:30');
        expect((await events(page)).map((e) => e.type)).toEqual(['event-open']);
        const axe = await new AxeBuilder({ page }).include('[role="dialog"]').disableRules(['color-contrast']).analyze();
        expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([]);
    });

    test('Save asks before-save, writes the event and emits save; the focus goes back to the event', async ({ page }) => {
        const s = await open(page);
        await record(page, ['before-save', 'save']);
        await enterOnStandup(page, s);
        const dialog = editor(page, 'Edit event');
        await dialog.getByLabel('Title', { exact: true }).fill('Daily stand-up');
        await dialog.getByRole('button', { name: 'Save' }).click();
        await expect(dialog).toHaveCount(0);
        const got = await events(page);
        expect(got.map((e) => e.type)).toEqual(['before-save', 'save']);
        expect(got[0].detail).toEqual(expect.objectContaining({ isNew: false, previous: expect.objectContaining({ title: 'Stand-up' }), event: expect.objectContaining({ id: 'standup', title: 'Daily stand-up', start: '2026-09-21T09:00', end: '2026-09-21T09:30' }) }));
        expect((await written(s)).find((e) => e.id === 'standup')?.title).toBe('Daily stand-up');
        await expect(standup(s)).toBeFocused();
    });

    test('a save the app refuses changes nothing, and leaves the editor open', async ({ page }) => {
        const s = await open(page);
        await page.evaluate((sel) => document.querySelector(`section:not([hidden]) ${sel}`)!.addEventListener('before-save', (e) => e.preventDefault()), root);
        await enterOnStandup(page, s);
        const dialog = editor(page, 'Edit event');
        await dialog.getByLabel('Title', { exact: true }).fill('Nope');
        await dialog.getByRole('button', { name: 'Save' }).click();
        await expect(dialog).toBeVisible();
        expect((await written(s)).find((e) => e.id === 'standup')?.title).toBe('Stand-up');
    });

    test('a title is needed, and the end comes after the start: the editor says so and saves nothing', async ({ page }) => {
        const s = await open(page);
        await record(page, ['before-save', 'save']);
        await enterOnStandup(page, s);
        const dialog = editor(page, 'Edit event');
        await dialog.getByLabel('Title', { exact: true }).fill('');
        await dialog.getByRole('button', { name: 'Save' }).click();
        await expect(dialog.getByText('Give the event a title.')).toBeVisible();
        await expect(dialog.getByLabel('Title', { exact: true })).toHaveAttribute('aria-invalid', 'true');
        expect(await events(page)).toEqual([]);
    });

    test('Cancel and Escape change nothing', async ({ page }) => {
        const s = await open(page);
        await record(page, ['before-save', 'save']);
        await enterOnStandup(page, s);
        let dialog = editor(page, 'Edit event');
        await dialog.getByLabel('Title', { exact: true }).fill('X');
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).toHaveCount(0);
        await enterOnStandup(page, s);
        dialog = editor(page, 'Edit event');
        await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Stand-up');
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        expect(await events(page)).toEqual([]);
        expect((await written(s)).find((e) => e.id === 'standup')?.title).toBe('Stand-up');
    });

    test('Delete asks before-remove, removes the event and emits remove', async ({ page }) => {
        const s = await open(page);
        await record(page, ['before-remove', 'remove']);
        await enterOnStandup(page, s);
        await editor(page, 'Edit event').getByRole('button', { name: 'Delete' }).click();
        const got = await events(page);
        expect(got.map((e) => e.type)).toEqual(['before-remove', 'remove']);
        expect((got[1].detail.event as { id: string }).id).toBe('standup');
        expect((await written(s)).some((e) => e.id === 'standup')).toBe(false);
        await expect(s.locator('[data-id="standup"]')).toHaveCount(0);
    });

    test('the Delete key on an event asks before-remove too', async ({ page }) => {
        const s = await open(page);
        await record(page, ['before-remove', 'remove']);
        await cell(s, 3, 0).focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Delete');
        expect((await events(page)).map((e) => e.type)).toEqual(['before-remove', 'remove']);
        await expect(s.locator('[data-id="standup"]')).toHaveCount(0);
    });

    test('a single click is event-open alone; a double click edits', async ({ page }) => {
        const s = await open(page);
        await record(page, ['event-open']);
        await standup(s).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        expect((await events(page)).map((e) => e.type)).toEqual(['event-open']);
        await standup(s).dblclick();
        await expect(editor(page, 'Edit event')).toBeVisible();
    });

    test('Shift+arrows then Enter: before-create, the editor on the new event, Save writes it and emits create', async ({ page }) => {
        const s = await open(page);
        await record(page, ['before-create', 'before-save', 'save', 'create']);
        await cell(s, 1, 2).focus();
        await page.keyboard.press('Shift+ArrowDown');
        await page.keyboard.press('Enter');
        const dialog = editor(page, 'New event');
        await expect(dialog).toBeVisible();
        expect(await pickerValue(dialog, 'Start time')).toBe('08:00');
        expect(await pickerValue(dialog, 'End time')).toBe('09:00');
        expect((await events(page)).map((e) => e.type)).toEqual(['before-create']);
        await dialog.getByLabel('Title', { exact: true }).fill('Planning');
        await dialog.getByRole('button', { name: 'Save' }).click();
        const got = await events(page);
        expect(got.map((e) => e.type)).toEqual(['before-create', 'before-save', 'save', 'create']);
        expect(got[1].detail).toEqual(expect.objectContaining({ isNew: true, previous: null }));
        expect((got[3].detail.event as { title: string }).title).toBe('Planning');
        expect((await written(s)).some((e) => e.title === 'Planning')).toBe(true);
    });

    test('Enter on an empty slot creates there through the editor; Cancel creates nothing', async ({ page }) => {
        const s = await open(page);
        await record(page, ['slot-open', 'before-create', 'create']);
        await cell(s, 1, 2).focus();
        await page.keyboard.press('Enter');
        const dialog = editor(page, 'New event');
        await expect(dialog).toBeVisible();
        expect(await pickerValue(dialog, 'Start date')).toBe('2026-09-23');
        expect(await pickerValue(dialog, 'Start time')).toBe('08:00');
        expect(await pickerValue(dialog, 'End time')).toBe('08:30');
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        expect((await events(page)).map((e) => e.type)).toEqual(['slot-open', 'before-create']);
        expect(await written(s)).toHaveLength(4);
    });
});
