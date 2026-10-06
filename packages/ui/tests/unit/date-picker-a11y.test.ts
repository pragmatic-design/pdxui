// pdx-date-picker: one pdx-change per pick, focus back on the trigger after a pick, a view that opens
// where min/max allow, and a popup that is the dialog the trigger announces.
//
// The inner calendar's pdx-change does not bubble out of the picker next to the picker's own, which
// would give a listener two per pick with two shapes; a pick that closes the popup does not leave
// focus on <body>; "2024 only" does not open on today's month with all 42 cells disabled; the panel
// has a role and a name, and opening it moves focus into it; the month and year grids have a label.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/date-picker/pdx-date-picker';

const trigger = (el: HTMLElement) => el.querySelector('.pdx-date-picker-trigger') as HTMLElement;
const panel = (el: HTMLElement) => el.querySelector('.pdx-date-picker-panel') as HTMLElement;
const cell = (el: HTMLElement, iso: string) => el.querySelector(`[data-iso="${iso}"]`) as HTMLElement;
const key = (target: Element, k: string) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

async function open(el: HTMLElement): Promise<void> {
    trigger(el).click();
    await tick(50);
}

function changes(el: HTMLElement): CustomEvent[] {
    const seen: CustomEvent[] = [];
    el.addEventListener('pdx-change', (e) => seen.push(e as CustomEvent));
    return seen;
}

beforeEach(cleanup);

describe('one pdx-change per change', () => {
    it('a date pick is one event, with the picked value, and the host value follows', async () => {
        const el = await mount('pdx-date-picker', { value: '2024-06-15' });
        await tick(50);
        await open(el);
        const seen = changes(el);
        cell(el, '2024-06-23').click();
        await tick(20);
        expect(seen.map(e => e.detail)).toEqual([{ value: '2024-06-23' }]);
        expect((el as unknown as { value: string }).value).toBe('2024-06-23');
    });

    it('a range is one event per click, each with the range so far', async () => {
        const el = await mount('pdx-date-picker', { mode: 'daterange', rangeStart: '2024-06-10', rangeEnd: '2024-06-12' });
        await tick(50);
        await open(el);
        const seen = changes(el);
        cell(el, '2024-06-03').click();
        await tick(20);
        cell(el, '2024-06-08').click();
        await tick(20);
        expect(seen).toHaveLength(2);
        expect(seen[1].detail).toEqual({ rangeStart: '2024-06-03', rangeEnd: '2024-06-08', value: '2024-06-03' });
    });

    it('a time change in datetime mode is one event', async () => {
        const el = await mount('pdx-date-picker', { mode: 'datetime', value: '2024-06-15' });
        await tick(50);
        await open(el);
        const seen = changes(el);
        const tp = el.querySelector('pdx-time-picker')!;
        tp.dispatchEvent(new CustomEvent('pdx-change', { detail: { value: '10:30' }, bubbles: true }));
        await tick(20);
        expect(seen.map(e => e.detail)).toEqual([{ value: '2024-06-15', time: '10:30' }]);
    });
});

describe('focus', () => {
    it('on open, focus is on the selected day, inside a named dialog', async () => {
        const el = await mount('pdx-date-picker', { value: '2024-06-15' });
        await tick(50);
        trigger(el).focus();
        key(trigger(el), 'Enter');
        await tick(50);
        expect(panel(el).getAttribute('role')).toBe('dialog');
        expect(panel(el).getAttribute('aria-label')).toBe('Choose date');
        expect(document.activeElement).toBe(cell(el, '2024-06-15'));
    });

    it('opened before the calendar has drawn, focus still lands on the day — not on Today', async () => {
        // The certify scenario opens with host.openPopover() right after mount: the panel exists,
        // the calendar has not drawn its first view, so the first button found is the wrong one.
        const el = document.createElement('pdx-date-picker') as HTMLElement & { value: string; openPopover(): void };
        el.value = '2024-06-15';
        document.body.appendChild(el);
        await new Promise(r => requestAnimationFrame(r));
        expect(el.querySelector('.pdx-date-picker-panel'), 'the panel is built').toBeTruthy();
        expect(el.querySelector('[data-iso]'), 'the calendar has not drawn yet').toBeNull();
        el.openPopover();
        // Until the calendar has drawn — it keeps the focus pending and gives it then — not a fixed
        // 60 ms, which the full gate's load outruns.
        await vi.waitFor(() => expect(document.activeElement).toBe(cell(el, '2024-06-15')));
    });

    it('a keyboard pick closes the popup and returns focus to the trigger', async () => {
        const el = await mount('pdx-date-picker', { value: '2024-06-15' });
        await tick(50);
        trigger(el).focus();
        key(trigger(el), 'Enter');
        await tick(50);
        key(document.activeElement!, 'ArrowRight');
        await tick(20);
        key(document.activeElement!, 'Enter');
        await tick(20);
        expect(panel(el).style.display).toBe('none');
        expect((el as unknown as { value: string }).value).toBe('2024-06-16');
        expect(document.activeElement).toBe(trigger(el));
    });
});

describe('the view', () => {
    it('min/max with no value open on the nearest allowed month, with days to pick', async () => {
        // Today is after 2024: the nearest allowed month is December 2024.
        const el = await mount('pdx-date-picker', { min: '2024-01-01', max: '2024-12-31' });
        await tick(50);
        await open(el);
        const grid = el.querySelector('.pdx-cal-grid')!;
        expect(grid.getAttribute('aria-label')).toBe('December 2024');
        const enabled = [...grid.querySelectorAll('[role="gridcell"]')].filter(c => !c.hasAttribute('aria-disabled'));
        expect(enabled.length).toBeGreaterThan(0);
        expect(document.activeElement?.getAttribute('aria-disabled'), 'focus lands on a day that can be picked').toBeNull();
    });

    it('the month and year grids are labelled with the year or the years shown, and their arrows are named', async () => {
        const month = await mount('pdx-date-picker', { mode: 'month', value: '2024-06-15' });
        await tick(50);
        await open(month);
        const mg = month.querySelector('.pdx-cal-month-grid')!;
        expect(mg.getAttribute('aria-label')).toBe('2024');
        const monthNav = [...month.querySelectorAll('.pdx-cal-nav-btn')].map(b => b.getAttribute('aria-label'));
        expect(monthNav).toEqual(['Previous year', 'Next year']);
        month.remove();

        const year = await mount('pdx-date-picker', { mode: 'year', value: '2024-06-15' });
        await tick(50);
        await open(year);
        const yg = year.querySelector('.pdx-cal-year-grid')!;
        expect(yg.getAttribute('aria-label')).toBe('2016 – 2027');
        const yearNav = [...year.querySelectorAll('.pdx-cal-nav-btn')].map(b => b.getAttribute('aria-label'));
        expect(yearNav).toEqual(['Previous years', 'Next years']);
    });
});
