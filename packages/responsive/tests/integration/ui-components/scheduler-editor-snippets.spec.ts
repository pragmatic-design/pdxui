// pdx-scheduler's editor, extended and replaced by the app (#1020, part 9c), in Chromium:
// - `editorFields(event, set)` draws the app's fields under Notes, in the built-in editor; `set(patch)`
//   merges its values into the event Save writes, and a key set to undefined is left out;
// - `editorContent(event, actions)` draws the dialog's content instead of the built-in fields. The
//   scheduler keeps the dialog, the occurrence / series question, `before-save` / `before-remove`, and
//   writing `events`: `actions.save(next)`, `actions.remove()`, `actions.cancel()`.
//
// On `scheduler-editor`: Stand-up is a plain event, Monday 09:00–09:30 (row 3, column 0). On
// `scheduler-editor-series`, «Daily» repeats on weekdays at 9:00; Wednesday is column 2.

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
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Edit event' });

async function edit(page: Page, s: Locator, row: number, col: number): Promise<Locator> {
    await cell(s, row, col).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toBeVisible();
    return dialog(page);
}

/** An `editorFields` snippet: a «Client» input that sets `client`, and a «No client» button that unsets it. */
async function withFields(s: Locator): Promise<void> {
    await s.evaluate((host) => {
        type Set = (patch: Record<string, unknown>) => void;
        (host as unknown as { editorFields: (e: Record<string, unknown>, set: Set) => Node }).editorFields = (e, set) => {
            const box = document.createElement('div');
            const label = document.createElement('label');
            label.textContent = 'Client';
            const input = document.createElement('input');
            input.value = typeof e.client === 'string' ? e.client : '';
            input.addEventListener('input', () => set({ client: input.value }));
            label.appendChild(input);
            const clear = document.createElement('button');
            clear.type = 'button';
            clear.textContent = 'No client';
            clear.addEventListener('click', () => set({ client: undefined }));
            box.append(label, clear);
            return box;
        };
    });
}

/** An `editorContent` snippet: a «Subject» input and three buttons calling the actions. */
async function withContent(s: Locator): Promise<void> {
    await s.evaluate((host) => {
        type Actions = { save: (next: Record<string, unknown>) => void; remove: () => void; cancel: () => void };
        (host as unknown as { editorContent: (e: Record<string, unknown>, a: Actions) => Node }).editorContent = (e, a) => {
            const form = document.createElement('div');
            form.className = 'app-form';
            const label = document.createElement('label');
            label.textContent = 'Subject';
            const input = document.createElement('input');
            input.value = String(e.title);
            label.appendChild(input);
            const button = (name: string, run: () => void) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = name;
                b.addEventListener('click', run);
                return b;
            };
            form.append(label,
                button('Keep', () => a.save({ ...e, title: input.value })),
                button('Drop', () => a.remove()),
                button('Back', () => a.cancel()));
            return form;
        };
    });
}

test.describe('editorFields: the app adds fields to the built-in editor', () => {
    test('they are drawn under Notes with the event, and what they set is saved with it', async ({ page }) => {
        const s = await open(page, 'scheduler-editor');
        await withFields(s);
        await record(page, ['before-save']);
        const d = await edit(page, s, 3, 0);
        await expect(d.getByLabel('Notes')).toBeVisible();
        const client = d.getByLabel('Client');
        await expect(client).toHaveValue('');
        const notesBox = await d.getByLabel('Notes').boundingBox();
        const clientBox = await client.boundingBox();
        expect(clientBox!.y).toBeGreaterThan(notesBox!.y);
        await client.fill('ACME');
        await d.getByRole('button', { name: 'Save' }).click();
        await expect(dialog(page)).toHaveCount(0);
        const standup = (await written(s)).find((e) => e.id === 'standup');
        expect(standup).toEqual(expect.objectContaining({ title: 'Stand-up', client: 'ACME' }));
        expect((await events(page))[0].detail.event).toEqual(expect.objectContaining({ client: 'ACME' }));
    });

    test('a key set to undefined is left out of the saved event', async ({ page }) => {
        const s = await open(page, 'scheduler-editor');
        await withFields(s);
        let d = await edit(page, s, 3, 0);
        await d.getByLabel('Client').fill('ACME');
        await d.getByRole('button', { name: 'Save' }).click();
        await expect(dialog(page)).toHaveCount(0);
        d = await edit(page, s, 3, 0);
        await expect(d.getByLabel('Client')).toHaveValue('ACME');
        await d.getByRole('button', { name: 'No client' }).click();
        await d.getByRole('button', { name: 'Save' }).click();
        await expect(dialog(page)).toHaveCount(0);
        const standup = (await written(s)).find((e) => e.id === 'standup');
        expect(standup && 'client' in standup).toBe(false);
    });

    test('Cancel forgets what they set', async ({ page }) => {
        const s = await open(page, 'scheduler-editor');
        await withFields(s);
        const d = await edit(page, s, 3, 0);
        await d.getByLabel('Client').fill('ACME');
        await d.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog(page)).toHaveCount(0);
        const standup = (await written(s)).find((e) => e.id === 'standup');
        expect(standup && 'client' in standup).toBe(false);
    });
});

test.describe('editorContent: the app draws the editor, the scheduler keeps the rest', () => {
    test('it replaces the built-in fields and buttons, in the scheduler\'s dialog', async ({ page }) => {
        const s = await open(page, 'scheduler-editor');
        await withContent(s);
        const d = await edit(page, s, 3, 0);
        await expect(d.getByLabel('Subject')).toHaveValue('Stand-up');
        await expect(d.getByLabel('Title', { exact: true })).toHaveCount(0);
        await expect(d.getByRole('button', { name: 'Save' })).toHaveCount(0);
        await expect(d.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    });

    test('actions.save asks before-save and writes the event; actions.cancel changes nothing', async ({ page }) => {
        const s = await open(page, 'scheduler-editor');
        await withContent(s);
        await record(page, ['before-save', 'save']);
        let d = await edit(page, s, 3, 0);
        await d.getByLabel('Subject').fill('Retro');
        await d.getByRole('button', { name: 'Back' }).click();
        await expect(dialog(page)).toHaveCount(0);
        expect(await events(page)).toEqual([]);
        d = await edit(page, s, 3, 0);
        await d.getByLabel('Subject').fill('Retro');
        await d.getByRole('button', { name: 'Keep' }).click();
        await expect(dialog(page)).toHaveCount(0);
        expect((await events(page)).map((e) => e.type)).toEqual(['before-save', 'save']);
        expect((await written(s)).find((e) => e.id === 'standup')).toEqual(expect.objectContaining({ title: 'Retro' }));
    });

    test('on an occurrence the scheduler still asks how far it goes, and actions carry the choice', async ({ page }) => {
        const s = await open(page, 'scheduler-editor-series');
        await withContent(s);
        await record(page, ['before-remove', 'remove']);
        const d = await edit(page, s, 3, 2);
        await expect(d.getByRole('radio', { name: 'This occurrence' })).toBeChecked();
        await d.getByRole('radio', { name: 'The whole series' }).check();
        await d.getByRole('button', { name: 'Drop' }).click();
        await expect(dialog(page)).toHaveCount(0);
        const got = await events(page);
        expect(got.map((e) => e.detail.scope)).toEqual(['series', 'series']);
        expect(await written(s)).toEqual([]);
    });
});
