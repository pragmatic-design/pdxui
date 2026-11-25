// pdx-calendar's three views — days, months, years — built as the TypeScript version built them.
// Beside the component, which holds the state and passes what each view needs in a CalendarViews.

import {
    generateMonthGrid, getMonthNames, formatWithCalendar, toISO, isSameDay, getComponentString,
} from '@pdxui/core';
import type { CalendarCell, CalendarSystem } from '@pdxui/core';

export type SelectionMode = 'date' | 'range' | 'multi' | 'week' | 'month' | 'year' | 'quarter';
export type ViewMode = 'days' | 'months' | 'years';

/** What the views read from the component and call back into. */
export type CalendarViews = {
    /** iso → day button, filled by the day view, read by the component's style pass. */
    cellMap: Map<string, HTMLElement>;
    cellClass: (cell: CalendarCell) => string;
    isDateDisabled: (iso: string) => boolean;
    getHighlight: (iso: string) => string | false;
    focusedDate: () => string;
    viewMonth: () => number;
    viewYear: () => number;
    selMode: () => SelectionMode;
    fixedWeeks: () => boolean;
    navigate: (delta: number, unit: 'month' | 'year') => void;
    switchView: (mode: ViewMode) => void;
    setViewYear: (year: number) => void;
    selectDate: (iso: string) => void;
    selectMonth: (month: number) => void;
    selectYear: (year: number) => void;
    hover: (iso: string) => void;
    focus: (iso: string) => void;
};

/** A day cell's accessible name: "Monday, June 15, 2026", in the calendar's locale. */
const FULL_DATE: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };

/** The months on screen as one span, "June – July 2026" or "December 2026 – January 2027". */
function monthSpan(year: number, month: number, count: number, loc: string, cal: CalendarSystem): string {
    let lastMonth = month + count - 1;
    let lastYear = year;
    while (lastMonth > 12) { lastMonth -= 12; lastYear++; }
    const fmt = new Intl.DateTimeFormat(loc, { year: 'numeric', month: 'long', calendar: cal });
    return fmt.formatRange(new Date(year, month - 1, 15), new Date(lastYear, lastMonth - 1, 15));
}

export function renderDayView(
    root: HTMLElement, year: number, month: number,
    numMonths: number, loc: string, cal: CalendarSystem,
    showWeekNums: boolean, fd: number, v: CalendarViews,
): void {
    // Navigation header
    const nav = document.createElement('div');
    nav.className = 'pdx-cal-nav';
    nav.setAttribute('data-part', 'nav');

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'pdx-cal-nav-btn';
    prevBtn.setAttribute('data-part', 'prev');
    prevBtn.setAttribute('aria-label', getComponentString('calendar', 'prevMonth')());
    prevBtn.textContent = '‹';
    prevBtn.addEventListener('click', () => v.navigate(-1, 'month'));

    const titleBtn = document.createElement('button');
    titleBtn.type = 'button';
    titleBtn.className = 'pdx-cal-title';
    titleBtn.setAttribute('data-part', 'title');

    if (numMonths > 1) {
        // The span on screen, "June – July 2026", not only the first month.
        titleBtn.textContent = monthSpan(year, month, numMonths, loc, cal);
    } else if (cal !== 'gregory') {
        titleBtn.textContent = formatWithCalendar(
            toISO({ year, month, day: 15 }), loc, cal, { year: 'numeric', month: 'long' }
        );
    } else {
        const monthNames = getMonthNames(loc, cal, 'long');
        titleBtn.textContent = `${monthNames[month - 1]} ${year}`;
    }
    titleBtn.setAttribute('aria-live', 'polite');
    titleBtn.addEventListener('click', () => v.switchView('months'));

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'pdx-cal-nav-btn';
    nextBtn.setAttribute('data-part', 'next');
    nextBtn.setAttribute('aria-label', getComponentString('calendar', 'nextMonth')());
    nextBtn.textContent = '›';
    nextBtn.addEventListener('click', () => v.navigate(1, 'month'));

    nav.appendChild(prevBtn);
    nav.appendChild(titleBtn);
    nav.appendChild(nextBtn);
    root.appendChild(nav);

    // Grids (multi-month)
    const gridsWrap = document.createElement('div');
    gridsWrap.className = 'pdx-cal-grids' + (numMonths > 1 ? ` pdx-cal-grids-${numMonths}` : '');

    for (let i = 0; i < numMonths; i++) {
        let gridMonth = month + i;
        let gridYear = year;
        while (gridMonth > 12) { gridMonth -= 12; gridYear++; }

        const grid = generateMonthGrid(gridYear, gridMonth, {
            firstDay: fd,
            fixedWeeks: v.fixedWeeks(),
            weekNumbers: showWeekNums,
            locale: loc,
        });

        // One block per month, its title above its grid: as siblings in the row of
        // `.pdx-cal-grids`, the titles would sit beside the grids.
        const monthBlock = document.createElement('div');
        monthBlock.className = 'pdx-cal-month';
        if (numMonths > 1) {
            const subHeader = document.createElement('div');
            subHeader.className = 'pdx-cal-sub-header';
            const monthNames = getMonthNames(loc, cal, 'long');
            subHeader.textContent = `${monthNames[gridMonth - 1]} ${gridYear}`;
            monthBlock.appendChild(subHeader);
        }

        const table = document.createElement('div');
        table.className = 'pdx-cal-grid';
        table.setAttribute('data-part', 'grid');
        table.setAttribute('role', 'grid');
        table.setAttribute('aria-label', `${getMonthNames(loc, cal, 'long')[gridMonth - 1]} ${gridYear}`);

        // Day name headers
        const headerRow = document.createElement('div');
        headerRow.className = 'pdx-cal-header-row';
        headerRow.setAttribute('role', 'row');

        if (showWeekNums) {
            const wkHeader = document.createElement('div');
            wkHeader.className = 'pdx-cal-wk-header';
            wkHeader.textContent = getComponentString('calendar', 'weekNumber')();
            headerRow.appendChild(wkHeader);
        }

        for (const dayName of grid.dayNames) {
            const dayHeader = document.createElement('div');
            dayHeader.className = 'pdx-cal-day-header';
            dayHeader.setAttribute('role', 'columnheader');
            dayHeader.textContent = dayName;
            headerRow.appendChild(dayHeader);
        }
        table.appendChild(headerRow);

        // Weeks
        for (let w = 0; w < grid.weeks.length; w++) {
            const week = grid.weeks[w];
            const row = document.createElement('div');
            row.className = 'pdx-cal-row';
            row.setAttribute('role', 'row');

            if (showWeekNums && grid.weekNumbers) {
                const wkNum = document.createElement('div');
                wkNum.className = 'pdx-cal-wk-num';
                wkNum.textContent = String(grid.weekNumbers[w]);
                row.appendChild(wkNum);
            }

            for (const cell of week) {
                const cellEl = document.createElement('button');
                cellEl.type = 'button';
                cellEl.className = v.cellClass(cell);
                cellEl.setAttribute('role', 'gridcell');
                cellEl.setAttribute('data-part', 'cell');
                cellEl.setAttribute('tabindex', isSameDay(cell.iso, v.focusedDate()) ? '0' : '-1');
                // Store metadata for style-only updates
                cellEl.dataset.iso = cell.iso;
                cellEl.dataset.outside = cell.outside ? '1' : '0';
                cellEl.dataset.today = cell.today ? '1' : '0';
                v.cellMap.set(cell.iso, cellEl);

                if (cell.today) cellEl.setAttribute('aria-current', 'date');
                if (v.isDateDisabled(cell.iso)) cellEl.setAttribute('aria-disabled', 'true');

                // Display: use calendar system for non-Gregorian
                if (cal !== 'gregory') {
                    cellEl.textContent = formatWithCalendar(cell.iso, loc, cal, { day: 'numeric' });
                } else {
                    cellEl.textContent = String(cell.day);
                }
                // Named by the full date: the number alone carries no month or year for a
                // screen reader that reads the cell out of its grid.
                cellEl.setAttribute('aria-label', formatWithCalendar(cell.iso, loc, cal, FULL_DATE));

                // Highlight tooltip
                const hl = v.getHighlight(cell.iso);
                if (hl && typeof hl === 'string') {
                    cellEl.title = hl;
                }

                const iso = cell.iso;
                cellEl.addEventListener('click', () => v.selectDate(iso));
                cellEl.addEventListener('mouseenter', () => v.hover(iso));
                cellEl.addEventListener('focus', () => v.focus(iso));

                row.appendChild(cellEl);
            }

            table.appendChild(row);
        }

        monthBlock.appendChild(table);
        gridsWrap.appendChild(monthBlock);
    }

    root.appendChild(gridsWrap);
}

export function renderMonthView(root: HTMLElement, year: number, loc: string, cal: CalendarSystem, v: CalendarViews): void {
    const nav = document.createElement('div');
    nav.className = 'pdx-cal-nav';
    nav.setAttribute('data-part', 'nav');

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'pdx-cal-nav-btn';
    prevBtn.setAttribute('data-part', 'prev');
    prevBtn.setAttribute('aria-label', getComponentString('calendar', 'prevYear')());
    prevBtn.textContent = '‹';
    prevBtn.addEventListener('click', () => { v.setViewYear(year - 1); });

    const mode = v.selMode();
    // In month/quarter mode, title is not clickable (stays in months view)
    const canDrillToYears = mode !== 'month' && mode !== 'quarter';
    const titleBtn = document.createElement(canDrillToYears ? 'button' : 'span');
    if (canDrillToYears) (titleBtn as HTMLButtonElement).type = 'button';
    titleBtn.className = 'pdx-cal-title' + (canDrillToYears ? '' : ' pdx-cal-title-static');
    titleBtn.setAttribute('data-part', 'title');
    titleBtn.textContent = String(year);
    if (canDrillToYears) titleBtn.addEventListener('click', () => v.switchView('years'));

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'pdx-cal-nav-btn';
    nextBtn.setAttribute('data-part', 'next');
    nextBtn.setAttribute('aria-label', getComponentString('calendar', 'nextYear')());
    nextBtn.textContent = '›';
    nextBtn.addEventListener('click', () => { v.setViewYear(year + 1); });

    nav.appendChild(prevBtn);
    nav.appendChild(titleBtn);
    nav.appendChild(nextBtn);
    root.appendChild(nav);

    // A named group of buttons, labelled with the year shown, not a role="grid" with no
    // rows and no arrow keys: the buttons are what a user reaches.
    const grid = document.createElement('div');
    grid.className = 'pdx-cal-month-grid';
    grid.setAttribute('data-part', 'grid');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', String(year));

    const monthNames = getMonthNames(loc, cal, 'short');
    for (let m = 0; m < 12; m++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pdx-cal-month-cell';
        btn.setAttribute('data-part', 'cell');
        if (m + 1 === v.viewMonth()) btn.className += ' pdx-cal-selected';
        btn.textContent = monthNames[m];
        const monthNum = m + 1;
        btn.addEventListener('click', () => v.selectMonth(monthNum));
        grid.appendChild(btn);
    }

    root.appendChild(grid);
}

export function renderYearView(root: HTMLElement, year: number, v: CalendarViews): void {
    const startYear = year - (year % 12);
    const endYear = startYear + 11;

    const nav = document.createElement('div');
    nav.className = 'pdx-cal-nav';
    nav.setAttribute('data-part', 'nav');

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'pdx-cal-nav-btn';
    prevBtn.setAttribute('data-part', 'prev');
    prevBtn.setAttribute('aria-label', getComponentString('calendar', 'prevYears')());
    prevBtn.textContent = '‹';
    prevBtn.addEventListener('click', () => { v.setViewYear(year - 12); });

    const titleEl = document.createElement('span');
    titleEl.className = 'pdx-cal-title pdx-cal-title-static';
    titleEl.setAttribute('data-part', 'title');
    titleEl.textContent = `${startYear} – ${endYear}`;

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'pdx-cal-nav-btn';
    nextBtn.setAttribute('data-part', 'next');
    nextBtn.setAttribute('aria-label', getComponentString('calendar', 'nextYears')());
    nextBtn.textContent = '›';
    nextBtn.addEventListener('click', () => { v.setViewYear(year + 12); });

    nav.appendChild(prevBtn);
    nav.appendChild(titleEl);
    nav.appendChild(nextBtn);
    root.appendChild(nav);

    const grid = document.createElement('div');
    grid.className = 'pdx-cal-year-grid';
    grid.setAttribute('data-part', 'grid');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', titleEl.textContent);

    for (let y = startYear; y <= endYear; y++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pdx-cal-year-cell';
        btn.setAttribute('data-part', 'cell');
        if (y === v.viewYear()) btn.className += ' pdx-cal-selected';
        btn.textContent = String(y);
        const yr = y;
        btn.addEventListener('click', () => v.selectYear(yr));
        grid.appendChild(btn);
    }

    root.appendChild(grid);
}
