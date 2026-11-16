// pdx-scheduler's export and import (#1020, part 10b), in Chromium:
// - the bar's «Export» menu offers CSV, Excel and iCalendar; `exports` chooses which, and an empty
//   list hides it;
// - CSV and Excel are the occurrences of the period on screen, one row each; iCalendar is `events` as
//   data, a series with its rule (owner's decision, 2026-11-16);
// - the methods `exportCsv`, `exportXlsx` and `exportIcs` return the file and, unless told not to,
//   save it; `exported` says what went out;
// - `importIcs(text)` asks `before-import`, which may change the events or refuse them, then writes
//   `events` (an event of the same id is replaced) and emits `imported`.
//
// On `scheduler-editor-series`: the week of Monday 21 September 2026 in Rome; «Daily» repeats on
// weekdays at 9:00–9:30 from the 14th.

import { test, expect, type Page, type Locator } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES, schemeFor } from '../../manifests/_themes';

const THEME = THEMES[0];
const root = '[data-test="scheduler"]';

async function open(page: Page): Promise<Locator> {
    await goToScenario(page, 'scheduler-editor-series', THEME, { page: scenarioPage['scheduler-editor-series'], scheme: schemeFor(THEME) });
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
/** A Blob a method returned, as text with its byte order mark (Blob.text() drops it). */
const textOf = (s: Locator, method: string) => s.evaluate(async (el, m) => {
    const blob = (el as unknown as Record<string, (save: boolean) => Blob>)[m](false);
    return { type: blob.type, text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(await blob.arrayBuffer()) };
}, method);

const BOM = String.fromCharCode(0xfeff);
const CSV = [
    'Title,Start,End,Notes',
    'Daily,2026-09-21 09:00,2026-09-21 09:30,',
    'Daily,2026-09-22 09:00,2026-09-22 09:30,',
    'Daily,2026-09-23 09:00,2026-09-23 09:30,',
    'Daily,2026-09-24 09:00,2026-09-24 09:30,',
    'Daily,2026-09-25 09:00,2026-09-25 09:30,',
].join('\r\n') + '\r\n';

test.describe('the bar\'s Export menu', () => {
    test('it offers CSV, Excel and iCalendar; CSV saves the period\'s occurrences, one row each', async ({ page }) => {
        const s = await open(page);
        await record(page, ['exported']);
        await s.getByRole('button', { name: 'Export' }).click();
        await expect(page.getByRole('menuitem')).toHaveText(['CSV (.csv)', 'Excel (.xlsx)', 'iCalendar (.ics)', 'Print']);
        const download = page.waitForEvent('download');
        await page.getByRole('menuitem', { name: 'CSV (.csv)' }).click();
        const file = await download;
        expect(file.suggestedFilename()).toBe('scheduler-2026-09-21_2026-09-27.csv');
        const { readFile } = await import('node:fs/promises');
        expect(await readFile(await file.path(), 'utf8')).toBe(BOM + CSV);
        expect(await events(page)).toEqual([{ type: 'exported', detail: { format: 'csv', count: 5 } }]);
    });

    test('`exports` chooses what it offers, and an empty list hides it', async ({ page }) => {
        const s = await open(page);
        await s.evaluate((el) => { (el as unknown as { exports: string[] }).exports = ['ics']; });
        await s.getByRole('button', { name: 'Export' }).click();
        await expect(page.getByRole('menuitem')).toHaveText(['iCalendar (.ics)']);
        await page.keyboard.press('Escape');
        await s.evaluate((el) => { (el as unknown as { exports: string[] }).exports = []; });
        await expect(s.getByRole('button', { name: 'Export' })).toHaveCount(0);
    });
});

test.describe('the export methods', () => {
    test('exportCsv(false) returns the file without saving it', async ({ page }) => {
        const s = await open(page);
        let saved = false;
        page.on('download', () => { saved = true; });
        const csv = await textOf(s, 'exportCsv');
        expect(csv.type).toBe('text/csv;charset=utf-8');
        expect(csv.text).toBe(BOM + CSV);
        expect(saved).toBe(false);
    });

    test('exportXlsx is a workbook', async ({ page }) => {
        const s = await open(page);
        const xlsx = await s.evaluate(async (el) => {
            const blob = (el as unknown as { exportXlsx: (save: boolean) => Blob }).exportXlsx(false);
            return { type: blob.type, magic: Array.from(new Uint8Array(await blob.slice(0, 2).arrayBuffer())) };
        });
        expect(xlsx.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        expect(xlsx.magic).toEqual([0x50, 0x4b]);
    });

    test('exportIcs is `events` as data: the series with its rule, not its occurrences', async ({ page }) => {
        const s = await open(page);
        const ics = await textOf(s, 'exportIcs');
        expect(ics.type).toBe('text/calendar;charset=utf-8');
        expect(ics.text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
        expect(ics.text).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
        expect(ics.text).toContain('DTSTART;TZID=Europe/Rome:20260914T090000');
    });
});

test.describe('importIcs', () => {
    const FILE = [
        'BEGIN:VCALENDAR', 'VERSION:2.0',
        'BEGIN:VEVENT', 'UID:daily', 'SUMMARY:Daily (moved)', 'DTSTART;TZID=Europe/Rome:20260914T100000', 'DTEND;TZID=Europe/Rome:20260914T103000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:review', 'SUMMARY:Review', 'DTSTART;TZID=Europe/Rome:20260923T140000', 'DTEND;TZID=Europe/Rome:20260923T150000', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:pos', 'SUMMARY:Last workday', 'DTSTART:20260930T090000', 'RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1', 'END:VEVENT',
        'END:VCALENDAR', '',
    ].join('\r\n');
    const run = (s: Locator) => s.evaluate((el, text) => (el as unknown as { importIcs: (t: string) => unknown }).importIcs(text), FILE);

    test('asks before-import, then replaces an event of the same id, adds the others, and emits imported', async ({ page }) => {
        const s = await open(page);
        await record(page, ['before-import', 'imported']);
        const result = await run(s) as { events: { id: string }[]; skipped: { uid: string; reason: string }[] };
        expect(result.events.map((e) => e.id)).toEqual(['daily', 'review']);
        expect(result.skipped).toEqual([{ uid: 'pos', title: 'Last workday', reason: 'RRULE: BYSETPOS is not supported' }]);
        const got = await events(page);
        expect(got.map((e) => e.type)).toEqual(['before-import', 'imported']);
        expect((got[0].detail.skipped as unknown[]).length).toBe(1);
        const list = await written(s);
        expect(list.map((e) => [e.id, e.title, e.start])).toEqual([['daily', 'Daily (moved)', '2026-09-14T10:00'], ['review', 'Review', '2026-09-23T14:00']]);
    });

    test('before-import may change what comes in, or refuse it', async ({ page }) => {
        const s = await open(page);
        await s.evaluate((el) => {
            el.addEventListener('before-import', (e) => {
                const d = (e as CustomEvent<{ events: { id: string }[] }>).detail;
                d.events = d.events.filter((x) => x.id !== 'daily');
            }, { once: true });
        });
        await run(s);
        expect((await written(s)).map((e) => [e.id, e.title])).toEqual([['daily', 'Daily'], ['review', 'Review']]);
        await s.evaluate((el) => { el.addEventListener('before-import', (e) => e.preventDefault(), { once: true }); });
        expect(await s.evaluate((el) => (el as unknown as { importIcs: (t: string) => unknown }).importIcs('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\nSUMMARY:X\r\nDTSTART;VALUE=DATE:20260921\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'))).toBeNull();
        expect((await written(s)).map((e) => e.id)).toEqual(['daily', 'review']);
    });
});
