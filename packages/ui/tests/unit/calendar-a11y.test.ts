// pdx-calendar opens where its selection is, lays out a multi-month view as months, and names its
// cells by the full date.
//
// - In range mode the view opens on rangeStart, not on today's month: a June range would show an
//   empty month until the user paged back to it.
// - With two months, each month's title sits above its grid, not beside it as a sibling in one flex
//   row. The navigation title names the span shown, not only the first month.
// - A day cell is named by the full date: its number alone ("15"), read out of its grid, carries no
//   month or year.
// - The root is not role="application", which switches a screen reader's browse mode off for the
//   whole widget, header buttons included. The grid role already gives the keyboard model.
import { describe, it, expect, afterEach } from 'vitest';
import { tick } from './helpers';
import '../../src/calendar/pdx-calendar';

async function mount(attrs: string): Promise<HTMLElement> {
    const host = document.createElement('div');
    host.innerHTML = `<pdx-calendar locale="en-US" ${attrs}></pdx-calendar>`;
    document.body.appendChild(host);
    await tick(100);
    return host.querySelector('pdx-calendar') as HTMLElement;
}

const grids = (el: HTMLElement) => Array.from(el.querySelectorAll('[role="grid"]')).map(g => g.getAttribute('aria-label'));

afterEach(() => { document.body.innerHTML = ''; });

describe('pdx-calendar initial view', () => {
    it('range mode opens on rangeStart\'s month', async () => {
        const el = await mount('mode="range" range-start="2026-06-10" range-end="2026-06-18"');
        expect(grids(el)[0]).toBe('June 2026');
    });

    it('value wins over rangeStart', async () => {
        const el = await mount('value="2026-03-04" range-start="2026-06-10"');
        expect(grids(el)[0]).toBe('March 2026');
    });
});

describe('pdx-calendar multi-month layout', () => {
    it('puts each month\'s title and grid in one block, the title first', async () => {
        const el = await mount('value="2026-06-15" number-of-months="2"');
        const months = Array.from(el.querySelectorAll('.pdx-cal-grids > .pdx-cal-month'));
        expect(months.length).toBe(2);
        for (const m of months) {
            expect(m.children[0].classList.contains('pdx-cal-sub-header')).toBe(true);
            expect(m.children[1].getAttribute('role')).toBe('grid');
        }
        expect(months.map(m => m.children[0].textContent)).toEqual(['June 2026', 'July 2026']);
    });

    it('names the span in the navigation title', async () => {
        const el = await mount('value="2026-06-15" number-of-months="2"');
        expect(el.querySelector('.pdx-cal-title')?.textContent).toMatch(/^June\s.\sJuly 2026$/);
    });

    it('a span across a year names both years', async () => {
        const el = await mount('value="2026-12-15" number-of-months="2"');
        expect(el.querySelector('.pdx-cal-title')?.textContent).toMatch(/December 2026.*January 2027/);
    });
});

describe('pdx-calendar names', () => {
    it('names a day cell by its full date; its text stays the number', async () => {
        const el = await mount('value="2026-06-15"');
        const cell = el.querySelector('[data-iso="2026-06-15"]')!;
        expect(cell.textContent).toBe('15');
        expect(cell.getAttribute('aria-label')).toBe('Monday, June 15, 2026');
    });

    it('the root is a named group, not role="application"', async () => {
        const el = await mount('value="2026-06-15"');
        const root = el.querySelector('.pdx-calendar')!;
        expect(root.getAttribute('role')).toBe('group');
        expect(root.getAttribute('aria-label')).toBe('Calendar');
    });
});
