// pdx-scheduler on paper (#1020, part 10c), in Chromium under print media. The owner's decision
// (2026-11-16): print() prints the view and period on screen, whole — every slot, row and column the
// windowing would leave out on screen, no scroll clip, no buttons but the period's title, events with a
// border instead of a fill — and the scheduler alone on the page. The browser's own print (Ctrl+P)
// gets the whole scheduler too, in the page it is in. «Print» is in the bar's menu.
//
// window.print() is replaced by a probe that measures the page as the printer would get it, then says
// the print is over (`afterprint`), as the browser does.

import { test, expect, type Page, type Locator } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES, schemeFor } from '../../manifests/_themes';

const THEME = THEMES[0];
const root = '[data-test="scheduler"]';

/**
 * The scenario, with a paragraph outside the scheduler. The week is a whole day of half hours (48
 * slots), more than its windowing draws on screen. Screen media: what the windowing draws depends on
 * the print state alone, not on a print stylesheet that lifts the clip.
 */
async function open(page: Page, scenario: string): Promise<Locator> {
    await goToScenario(page, scenario, THEME, { page: scenarioPage[scenario], scheme: schemeFor(THEME) });
    await page.evaluate((sel) => {
        const p = document.createElement('p');
        p.id = 'outside';
        p.textContent = 'The rest of the page';
        document.body.appendChild(p);
        const host = document.querySelector(`section:not([hidden]) ${sel}`) as HTMLElement & { startHour: string; endHour: string; view: string };
        if (host.view === 'week') { host.startHour = '00:00'; host.endHour = '24:00'; }
    }, root);
    const s = page.locator(`section:not([hidden]) ${root}`);
    await expect.poll(() => s.locator('[role="gridcell"][data-row]').count()).toBeGreaterThan(0);
    return s;
}

type Measure = { calls: number; printing: boolean; alone: boolean; slotRows: number; timelineRows: number; clipped: boolean;
    outside: string; prev: string; period: string; eventFill: string; eventBorder: string };

/** window.print as a probe: what the printer would get, then `afterprint`. */
async function probePrint(page: Page): Promise<void> {
    await page.evaluate((sel) => {
        const w = window as unknown as { __printed: Measure[] };
        w.__printed = [];
        window.print = () => {
            window.dispatchEvent(new Event('beforeprint'));
            const host = document.querySelector(`section:not([hidden]) ${sel}`) as HTMLElement;
            const grid = host.querySelector('[data-part="grid"]') as HTMLElement | null;
            const event = host.querySelector('.pdx-scheduler-event') as HTMLElement | null;
            const style = (el: Element | null, p: string) => (el ? getComputedStyle(el).getPropertyValue(p) : '');
            w.__printed.push({
                calls: w.__printed.length + 1,
                printing: host.matches(':state(printing)'),
                alone: document.documentElement.hasAttribute('data-pdx-print-only'),
                slotRows: new Set([...host.querySelectorAll('[role="gridcell"][data-row]')].map((c) => Number((c as HTMLElement).dataset.row)).filter((r) => r > 0)).size,
                timelineRows: host.querySelectorAll('[data-part="rowHeader"]').length,
                clipped: grid ? grid.scrollHeight > grid.clientHeight + 1 : false,
                outside: style(document.getElementById('outside'), 'display'),
                prev: style(host.querySelector('[data-part="prev"]'), 'display'),
                period: style(host.querySelector('[data-part="period"]'), 'display'),
                eventFill: style(event, 'background-color'),
                eventBorder: style(event, 'border-top-width'),
            });
            window.dispatchEvent(new Event('afterprint'));
        };
    }, root);
}
const printed = (page: Page) => page.evaluate(() => (window as unknown as { __printed: Measure[] }).__printed);
const callPrint = (s: Locator) => s.evaluate((el) => (el as unknown as { print: () => Promise<void> }).print());
const slotRowsNow = (s: Locator) => s.evaluate((el) =>
    new Set([...el.querySelectorAll('[role="gridcell"][data-row]')].map((c) => Number((c as HTMLElement).dataset.row)).filter((r) => r > 0)).size);

test.describe('print()', () => {
    test('the week whole and alone: every slot drawn while it prints', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        expect(await slotRowsNow(s)).toBeLessThan(48);
        await probePrint(page);
        await callPrint(s);
        const [m] = await printed(page);
        expect(m).toEqual(expect.objectContaining({ calls: 1, printing: true, alone: true, slotRows: 48 }));
    });

    test('on paper: nothing clipped, no buttons but the period, events bordered, the rest of the page left out', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await page.emulateMedia({ media: 'print' });
        await probePrint(page);
        await callPrint(s);
        const [m] = await printed(page);
        expect(m).toEqual(expect.objectContaining({ clipped: false, outside: 'none', prev: 'none' }));
        expect(m.period).not.toBe('none');
        expect(m.eventFill).toBe('rgba(0, 0, 0, 0)');
        expect(parseFloat(m.eventBorder)).toBeGreaterThanOrEqual(1);
    });

    test('after the print the page is as it was', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await probePrint(page);
        await callPrint(s);
        await expect.poll(() => slotRowsNow(s)).toBeLessThan(48);
        expect(await s.evaluate((el) => el.matches(':state(printing)'))).toBe(false);
        expect(await page.evaluate(() => document.documentElement.hasAttribute('data-pdx-print-only'))).toBe(false);
        expect(await page.locator('#outside').evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
    });

    test('the timeline prints every resource, not the screenful it draws', async ({ page }) => {
        const s = await open(page, 'scheduler-timeline-many');
        await s.evaluate((el) => { (el as unknown as { timelineScale: string }).timelineScale = 'week'; });
        await expect.poll(() => s.locator('[data-part="rowHeader"]').count()).toBeLessThan(500);
        await probePrint(page);
        await callPrint(s);
        const [m] = await printed(page);
        expect(m.timelineRows).toBe(500);
    });
});

test.describe('the browser\'s own print', () => {
    test('Ctrl+P gets the whole scheduler, in its page', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        expect(await slotRowsNow(s)).toBeLessThan(48);
        await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
        expect(await slotRowsNow(s)).toBe(48);
        expect(await page.evaluate(() => document.documentElement.hasAttribute('data-pdx-print-only'))).toBe(false);
        expect(await page.locator('#outside').evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
        await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
        await expect.poll(() => slotRowsNow(s)).toBeLessThan(48);
    });
});

test('the bar\'s menu offers Print, after the files', async ({ page }) => {
    const s = await open(page, 'scheduler-week');
    await probePrint(page);
    await s.getByRole('button', { name: 'Export' }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['CSV (.csv)', 'Excel (.xlsx)', 'iCalendar (.ics)', 'Print']);
    await page.getByRole('menuitem', { name: 'Print' }).click();
    await expect.poll(async () => (await printed(page)).length).toBe(1);
});
