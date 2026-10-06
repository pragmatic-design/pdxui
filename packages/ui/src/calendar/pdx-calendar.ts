// pdx-calendar — Standalone ARIA calendar grid.
// Supports: date/range/multi/week/month/year/quarter selection modes,
// 13 calendar systems (display via Intl), week numbers, fiscal year, highlighted dates.
// Keyboard: Arrow (day), PageUp/Down (month), Shift+PageUp/Down (year), Home/End (week), Enter/Space (select).

import { component, html, signal, registerComponentStrings, getComponentString } from '@pdxui/core';
import {
    generateMonthGrid, addMonths, addYears, addDays,
    getMonthNames, formatWithCalendar, getFirstDayOfWeek,
    isSameDay, isInRange, today, parseISO, toISO, clampDate,
    dayOfWeek, getFiscalQuarter, getFiscalYear,
    getMonthRange, getQuarterRange, getYearRange, getWeekRange,
} from '@pdxui/core';
import type { CalendarCell, CalendarSystem } from '@pdxui/core';
import { uiString, uiAttr} from '../shared/i18n';
import { resolveLocale } from '../shared/locale';
import { setOwnProp } from '../shared/own-prop';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/calendar';

registerComponentStrings('calendar', {
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    prevYear: 'Previous year',
    nextYear: 'Next year',
    // The year view's arrows move twelve years at a time.
    prevYears: 'Previous years',
    nextYears: 'Next years',
    today: 'Today',
    selectMonth: 'Select month',
    selectYear: 'Select year',
    weekNumber: 'W',
});

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

type ViewMode = 'days' | 'months' | 'years';
type SelectionMode = 'date' | 'range' | 'multi' | 'week' | 'month' | 'year' | 'quarter';

/**
 * A standalone calendar grid in which the user selects a date, a range of dates or several dates,
 * also from the keyboard alone.
 *
 * @fires pdx-change {{ value } | { rangeStart, rangeEnd } | { values } | { value, rangeStart, rangeEnd } | { value, quarter, fiscalYear, rangeStart, rangeEnd }} - Fired when the value changes.
 */
component('pdx-calendar', {
    props: {
        /** Selected date (ISO string) for single mode. */
        value: { type: String, default: '' },
        /** Range start (ISO). */
        rangeStart: { type: String, default: '' },
        /** Range end (ISO). */
        rangeEnd: { type: String, default: '' },
        /** Selection mode. */
        mode: { type: String, default: 'date' },
        /** Locale for month/day names. Empty: the page's language (`lang`), then the browser's. */
        locale: { type: String, default: '' },
        /** Calendar system for display. */
        calendar: { type: String, default: 'gregory' },
        /** Number of months to display (1-3). */
        numberOfMonths: { type: Number, default: 1 },
        /** Always show 6 weeks per month. */
        fixedWeeks: { type: Boolean, default: true },
        /** Show ISO week numbers. */
        weekNumbers: { type: Boolean, default: false },
        /** Minimum selectable date (ISO). */
        min: { type: String, default: '' },
        /** Maximum selectable date (ISO). */
        max: { type: String, default: '' },
        /** Function returning true if date should be disabled. */
        disabledDates: { type: Object, default: null },
        /** Function returning highlight label or false. */
        highlightedDates: { type: Object, default: null },
        /** Fiscal year start month (1-12). */
        fiscalStartMonth: { type: Number, default: 1 },
        /** Compare range start (ISO) for analytics overlay. */
        compareStart: { type: String, default: '' },
        /** Compare range end (ISO). */
        compareEnd: { type: String, default: '' },
        /** First day of week override (0=Sun..6=Sat). Auto-detected from locale if -1. */
        firstDay: { type: Number, default: -1 },
        /** Inline mode (no external popover wrapper). */
        inline: { type: Boolean, default: false },
        /** Disabled state. */
        disabled: { type: Boolean, default: false },
    },
    setup(ctx) {
        const _viewYear = signal(0);
        const _viewMonth = signal(0);
        const _viewMode = signal<ViewMode>('days');
        const _focusedDate = signal('');
        const _hoverDate = signal('');
        // Multi-select: list of selected ISO dates
        const _multiSelected = signal<string[]>([]);
        // Range building: partial range
        const _rangeBuilding = signal(false);
        // The start of the range being built — authoritative, it does not depend on the parent's echo
        const _pendingRangeStart = signal('');

        // Helper accessors (must be before initView for hoisting)
        // The prop, then the page's lang, then the browser.
        const locale = () => resolveLocale(ctx.el, ctx.locale() as string);
        const calSys = () => ctx.calendar() as CalendarSystem;
        const selMode = () => ctx.mode() as SelectionMode;
        const firstDayOfWeek = () => {
            const fd = ctx.firstDay() as number;
            return fd >= 0 ? fd : getFirstDayOfWeek(locale());
        };

        // The view opens on the selection: `value`, then `rangeStart`, then today — a range opened on
        // today's month would show nothing selected until the user paged back to it.
        // Today is clamped into [min, max]: otherwise "2024 only" would open on today's month with
        // every day disabled, months away from the first one that can be picked.
        function initView(): void {
            const min = (ctx.min() as string) || undefined;
            const max = (ctx.max() as string) || undefined;
            const start = (ctx.value() as string) || (ctx.rangeStart() as string) || clampDate(today(), min, max);
            const d = parseISO(start);
            _viewYear.set(d.year);
            _viewMonth.set(d.month);
            _focusedDate.set(start);
            // Open directly to the appropriate view for non-day modes
            const mode = selMode();
            if (mode === 'month' || mode === 'quarter') _viewMode.set('months');
            else if (mode === 'year') _viewMode.set('years');
            else _viewMode.set('days');
            _viewReady = true;
        }
        setTimeout(initView, 0);

        // ─── Focus into the view ───────────────────────────
        // A popup that opens on the calendar puts focus on the day it holds its tab stop on (or the
        // month / year shown). The picker may open it before the calendar has drawn its first view, so
        // a request made early is kept and honoured by the first draw after initView.
        let _viewReady = false;
        let _focusPending = false;
        function focusActiveCell(): boolean {
            const target = ctx.el.querySelector<HTMLElement>(
                '.pdx-cal-grid [tabindex="0"], .pdx-cal-month-cell.pdx-cal-selected, .pdx-cal-year-cell.pdx-cal-selected');
            if (!target) return false;
            target.focus();
            return true;
        }
        /** Focus the active day (or month, or year) now, or as soon as the view is drawn. */
        function focusView(): void {
            _focusPending = !(_viewReady && focusActiveCell());
        }

        // Sync external value changes
        ctx.track(() => {
            const val = ctx.value() as string;
            if (val) {
                const d = parseISO(val);
                _viewYear.set(d.year);
                _viewMonth.set(d.month);
                _focusedDate.set(val);
            }
            // Keep view mode synced with selection mode
            const mode = selMode();
            if (mode === 'month' || mode === 'quarter') {
                if (_viewMode.peek() === 'days') _viewMode.set('months');
            } else if (mode === 'year') {
                if (_viewMode.peek() === 'days') _viewMode.set('years');
            }
        });

        function isDateDisabled(iso: string): boolean {
            const min = ctx.min() as string;
            const max = ctx.max() as string;
            if (min && iso < min) return true;
            if (max && iso > max) return true;
            const fn = ctx.disabledDates() as ((iso: string) => boolean) | null;
            return fn ? fn(iso) : false;
        }

        function getHighlight(iso: string): string | false {
            const fn = ctx.highlightedDates() as ((iso: string) => string | false) | null;
            return fn ? fn(iso) : false;
        }

        // ─── Navigation ────────────────────────────────────

        function navigate(delta: number, unit: 'month' | 'year'): void {
            if (unit === 'month') {
                let m = _viewMonth.peek() + delta;
                let y = _viewYear.peek();
                while (m > 12) { m -= 12; y++; }
                while (m < 1) { m += 12; y--; }
                _viewMonth.set(m);
                _viewYear.set(y);
            } else {
                _viewYear.set(_viewYear.peek() + delta);
            }
            ctx.emit('pdx-navigate', { year: _viewYear.peek(), month: _viewMonth.peek() });
        }

        function goToday(): void {
            const t = today();
            const d = parseISO(t);
            _viewYear.set(d.year);
            _viewMonth.set(d.month);
            _focusedDate.set(t);
        }

        function switchView(mode: ViewMode): void {
            _viewMode.set(mode);
            ctx.emit('pdx-view-change', { view: mode });
        }

        // ─── Selection ─────────────────────────────────────

        /** A choice is written to the host's own props before it is announced: the
         *  cells are styled from `value` / `rangeStart` / `rangeEnd`, so otherwise a calendar on its
         *  own would emit and show nothing selected. `values` (multi mode) has no prop. */
        function choose(detail: { value?: string; rangeStart?: string; rangeEnd?: string } & Record<string, unknown>): void {
            if (detail.value !== undefined) setOwnProp(ctx.el, 'value', detail.value);
            if (detail.rangeStart !== undefined) setOwnProp(ctx.el, 'rangeStart', detail.rangeStart);
            if (detail.rangeEnd !== undefined) setOwnProp(ctx.el, 'rangeEnd', detail.rangeEnd);
            ctx.emit('pdx-change', detail);
        }

        function selectDate(iso: string): void {
            if (isDateDisabled(iso)) return;
            const mode = selMode();

            if (mode === 'date') {
                choose({ value: iso });
            } else if (mode === 'range') {
                // The start being built lives in an INTERNAL authoritative state:
                // reading it from the prop would require the parent's echo (standalone the
                // range would never complete; with an echo through a rAF there is a race on a fast
                // second click).
                const start = _pendingRangeStart.peek() || (ctx.rangeStart() as string);
                if (!start || _rangeBuilding.peek() === false) {
                    // Start new range
                    _rangeBuilding.set(true);
                    _pendingRangeStart.set(iso);
                    choose({ rangeStart: iso, rangeEnd: '' });
                } else {
                    // Complete range
                    _rangeBuilding.set(false);
                    _pendingRangeStart.set('');
                    const [s, e] = iso < start ? [iso, start] : [start, iso];
                    choose({ rangeStart: s, rangeEnd: e });
                }
            } else if (mode === 'multi') {
                const current = _multiSelected.peek().slice();
                const idx = current.indexOf(iso);
                if (idx >= 0) current.splice(idx, 1);
                else current.push(iso);
                _multiSelected.set(current);
                choose({ values: current });
            } else if (mode === 'week') {
                const range = getWeekRange(iso, firstDayOfWeek());
                choose({ rangeStart: range.start, rangeEnd: range.end });
            } else if (mode === 'month') {
                const d = parseISO(iso);
                const range = getMonthRange(d.year, d.month);
                choose({ value: iso, rangeStart: range.start, rangeEnd: range.end });
            } else if (mode === 'year') {
                const d = parseISO(iso);
                const range = getYearRange(d.year);
                choose({ value: iso, rangeStart: range.start, rangeEnd: range.end });
            } else if (mode === 'quarter') {
                const d = parseISO(iso);
                const fiscal = ctx.fiscalStartMonth() as number;
                const q = getFiscalQuarter(d.month, fiscal);
                const fy = getFiscalYear(d.year, d.month, fiscal);
                const range = getQuarterRange(fy, q, fiscal);
                choose({ value: iso, quarter: q, fiscalYear: fy, rangeStart: range.start, rangeEnd: range.end });
            }
        }

        function selectMonth(month: number): void {
            const mode = selMode();
            if (mode === 'month') {
                // Month selection mode: emit and stay in months view
                const range = getMonthRange(_viewYear.peek(), month);
                choose({ value: range.start, rangeStart: range.start, rangeEnd: range.end });
                return;
            }
            if (mode === 'quarter') {
                // Quarter selection: compute quarter from month clicked
                const fiscal = ctx.fiscalStartMonth() as number;
                const q = getFiscalQuarter(month, fiscal);
                const fy = getFiscalYear(_viewYear.peek(), month, fiscal);
                const range = getQuarterRange(fy, q, fiscal);
                choose({ value: range.start, quarter: q, fiscalYear: fy, rangeStart: range.start, rangeEnd: range.end });
                return;
            }
            // Normal drill-down to days
            _viewMonth.set(month);
            _viewMode.set('days');
        }

        function selectYear(year: number): void {
            const mode = selMode();
            if (mode === 'year') {
                // Year selection mode: emit and stay in years view
                const range = getYearRange(year);
                choose({ value: range.start, rangeStart: range.start, rangeEnd: range.end });
                return;
            }
            // Drill-down to months
            _viewYear.set(year);
            _viewMode.set('months');
        }

        // ─── Cell State ────────────────────────────────────

        function cellClass(cell: CalendarCell): string {
            const iso = cell.iso;
            let cls = 'pdx-cal-cell';
            if (cell.outside) cls += ' pdx-cal-outside';
            if (cell.today) cls += ' pdx-cal-today';
            if (isDateDisabled(iso)) cls += ' pdx-cal-disabled';

            const val = ctx.value() as string;
            const rStart = _pendingRangeStart() || (ctx.rangeStart() as string);
            const rEnd = ctx.rangeEnd() as string;
            const cStart = ctx.compareStart() as string;
            const cEnd = ctx.compareEnd() as string;
            const hover = _hoverDate();

            // Single selection
            if (val && isSameDay(iso, val)) cls += ' pdx-cal-selected';

            // Multi selection
            if (selMode() === 'multi' && _multiSelected().includes(iso)) cls += ' pdx-cal-selected';

            // Range
            if (rStart) {
                if (isSameDay(iso, rStart)) cls += ' pdx-cal-selected pdx-cal-range-start';
                if (rEnd) {
                    if (isSameDay(iso, rEnd)) cls += ' pdx-cal-selected pdx-cal-range-end';
                    if (isInRange(iso, rStart, rEnd)) cls += ' pdx-cal-in-range';
                }
            }

            // Range preview (hover while building range)
            if (rStart && !rEnd && hover && _rangeBuilding()) {
                const [ps, pe] = hover < rStart ? [hover, rStart] : [rStart, hover];
                if (isInRange(iso, ps, pe)) cls += ' pdx-cal-range-preview';
            }

            // Week mode: highlight entire week on hover
            if (selMode() === 'week' && hover) {
                const weekRange = getWeekRange(hover, firstDayOfWeek());
                if (isInRange(iso, weekRange.start, weekRange.end)) cls += ' pdx-cal-range-preview';
            }

            // Comparison range overlay
            if (cStart && cEnd && isInRange(iso, cStart, cEnd)) {
                cls += ' pdx-cal-compare';
                if (isSameDay(iso, cStart)) cls += ' pdx-cal-compare-start';
                if (isSameDay(iso, cEnd)) cls += ' pdx-cal-compare-end';
            }

            // Highlighted dates
            const hl = getHighlight(iso);
            if (hl) cls += ' pdx-cal-highlighted';

            // Focused
            if (isSameDay(iso, _focusedDate())) cls += ' pdx-cal-focused';

            return cls;
        }

        // ─── Keyboard ──────────────────────────────────────

        function onKeydown(e: KeyboardEvent): void {
            if (ctx.disabled()) return;
            const view = _viewMode.peek();
            if (view !== 'days') return; // keyboard only in day view for now

            const focused = _focusedDate.peek();
            if (!focused) return;

            let newDate = focused;
            let handled = true;

            switch (e.key) {
                case 'ArrowLeft': newDate = addDays(focused, -1); break;
                case 'ArrowRight': newDate = addDays(focused, 1); break;
                case 'ArrowUp': newDate = addDays(focused, -7); break;
                case 'ArrowDown': newDate = addDays(focused, 7); break;
                case 'PageUp':
                    newDate = e.shiftKey ? addYears(focused, -1) : addMonths(focused, -1);
                    break;
                case 'PageDown':
                    newDate = e.shiftKey ? addYears(focused, 1) : addMonths(focused, 1);
                    break;
                case 'Home': {
                    const d = parseISO(focused);
                    const dow = dayOfWeek(d.year, d.month, d.day);
                    const offset = ((dow - firstDayOfWeek()) % 7 + 7) % 7;
                    newDate = addDays(focused, -offset);
                    break;
                }
                case 'End': {
                    const d = parseISO(focused);
                    const dow = dayOfWeek(d.year, d.month, d.day);
                    const offset = ((dow - firstDayOfWeek()) % 7 + 7) % 7;
                    newDate = addDays(focused, 6 - offset);
                    break;
                }
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    selectDate(focused);
                    return;
                default:
                    handled = false;
            }

            if (handled) {
                e.preventDefault();
                const min = ctx.min() as string;
                const max = ctx.max() as string;
                newDate = clampDate(newDate, min || undefined, max || undefined);
                _focusedDate.set(newDate);
                // Ensure viewed month follows focus
                const nd = parseISO(newDate);
                if (nd.year !== _viewYear.peek() || nd.month !== _viewMonth.peek()) {
                    _viewYear.set(nd.year);
                    _viewMonth.set(nd.month);
                }
                // WAI-ARIA roving tabindex: besides updating the tabindexes (the style track), the REAL
                // focus must follow the active cell, otherwise arrow navigation does not move
                // the focus for whoever uses a keyboard or a screen reader. rAF: it waits for the grid to re-render.
                requestAnimationFrame(() => _cellMap.get(newDate)?.focus());
            }
        }

        // ─── Imperative Render ─────────────────────────────
        // Track 1: Structure — rebuilds grid when nav/view/locale changes
        // Track 2: Style — updates CSS classes on existing cells (no DOM recreation)

        let _cellMap = new Map<string, HTMLElement>(); // iso → button element

        // Structure track: rebuild grid on navigation/view changes
        ctx.track(() => {
            const year = _viewYear();
            const month = _viewMonth();
            const view = _viewMode();
            const loc = locale();
            const cal = calSys();
            const numMonths = Math.min(3, Math.max(1, ctx.numberOfMonths() as number));
            const showWeekNums = ctx.weekNumbers() as boolean;
            const fd = firstDayOfWeek();
            const disabled = ctx.disabled() as boolean;
            const isInline = ctx.inline() as boolean;

            requestAnimationFrame(() => {
                const el = ctx.el;
                el.innerHTML = '';
                _cellMap.clear();

                const root = document.createElement('div');
                root.className = 'pdx-calendar' + (isInline ? ' pdx-calendar-inline' : '') + (disabled ? ' disabled' : '');
                // A named group, not role="application", which switches a screen reader's browse mode
                // off for the whole widget, header buttons included; the grid role gives the keys.
                root.setAttribute('role', 'group');
                uiAttr(root, 'aria-label', () => uiString('calendar', 'label'));
                root.addEventListener('keydown', onKeydown);

                if (view === 'days') {
                    renderDayView(root, year, month, numMonths, loc, cal, showWeekNums, fd);
                } else if (view === 'months') {
                    renderMonthView(root, year, loc, cal);
                } else if (view === 'years') {
                    renderYearView(root, year);
                }

                el.appendChild(root);
                // After building, apply current selection styles
                updateCellStyles();
                if (_focusPending && _viewReady) _focusPending = !focusActiveCell();
            });
        });

        // Style track: update CSS classes without DOM recreation
        ctx.track(() => {
            // Read all selection-related signals to subscribe
            void ctx.value();
            void ctx.rangeStart();
            void ctx.rangeEnd();
            void ctx.compareStart();
            void ctx.compareEnd();
            void _focusedDate();
            void _hoverDate();
            void _multiSelected();
            // Apply styles synchronously — _cellMap may be empty on first run (before structure rAF)
            if (_cellMap.size > 0) updateCellStyles();
        });

        function updateCellStyles(): void {
            const val = ctx.value() as string;
            const rStart = _pendingRangeStart() || (ctx.rangeStart() as string);
            const rEnd = ctx.rangeEnd() as string;
            const mode = selMode();

            for (const [iso, cellEl] of _cellMap) {
                const cell = { iso, outside: false, today: false, day: 0, month: 0, year: 0 } as CalendarCell;
                cell.outside = cellEl.dataset.outside === '1';
                cell.today = cellEl.dataset.today === '1';
                cellEl.className = cellClass(cell);

                // Update aria-selected
                const isSelected = (val && isSameDay(iso, val))
                    || (mode === 'multi' && _multiSelected.peek().includes(iso))
                    || (rStart && rEnd && (isSameDay(iso, rStart) || isSameDay(iso, rEnd)));
                if (isSelected) cellEl.setAttribute('aria-selected', 'true');
                else cellEl.removeAttribute('aria-selected');

                // Update tabindex for roving focus
                cellEl.setAttribute('tabindex', isSameDay(iso, _focusedDate.peek()) ? '0' : '-1');
            }
        }

        function renderDayView(
            root: HTMLElement, year: number, month: number,
            numMonths: number, loc: string, cal: CalendarSystem,
            showWeekNums: boolean, fd: number,
        ): void {
            // Navigation header
            const nav = document.createElement('div');
            nav.className = 'pdx-cal-nav';

            const prevBtn = document.createElement('button');
            prevBtn.type = 'button';
            prevBtn.className = 'pdx-cal-nav-btn';
            prevBtn.setAttribute('aria-label', getComponentString('calendar', 'prevMonth')());
            prevBtn.textContent = '‹';
            prevBtn.addEventListener('click', () => navigate(-1, 'month'));

            const titleBtn = document.createElement('button');
            titleBtn.type = 'button';
            titleBtn.className = 'pdx-cal-title';

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
            titleBtn.addEventListener('click', () => switchView('months'));

            const nextBtn = document.createElement('button');
            nextBtn.type = 'button';
            nextBtn.className = 'pdx-cal-nav-btn';
            nextBtn.setAttribute('aria-label', getComponentString('calendar', 'nextMonth')());
            nextBtn.textContent = '›';
            nextBtn.addEventListener('click', () => navigate(1, 'month'));

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
                    fixedWeeks: ctx.fixedWeeks() as boolean,
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
                        cellEl.className = cellClass(cell);
                        cellEl.setAttribute('role', 'gridcell');
                        cellEl.setAttribute('tabindex', isSameDay(cell.iso, _focusedDate.peek()) ? '0' : '-1');
                        // Store metadata for style-only updates
                        cellEl.dataset.iso = cell.iso;
                        cellEl.dataset.outside = cell.outside ? '1' : '0';
                        cellEl.dataset.today = cell.today ? '1' : '0';
                        _cellMap.set(cell.iso, cellEl);

                        if (cell.today) cellEl.setAttribute('aria-current', 'date');
                        if (isDateDisabled(cell.iso)) cellEl.setAttribute('aria-disabled', 'true');

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
                        const hl = getHighlight(cell.iso);
                        if (hl && typeof hl === 'string') {
                            cellEl.title = hl;
                        }

                        const iso = cell.iso;
                        cellEl.addEventListener('click', () => selectDate(iso));
                        cellEl.addEventListener('mouseenter', () => _hoverDate.set(iso));
                        cellEl.addEventListener('focus', () => _focusedDate.set(iso));

                        row.appendChild(cellEl);
                    }

                    table.appendChild(row);
                }

                monthBlock.appendChild(table);
                gridsWrap.appendChild(monthBlock);
            }

            root.appendChild(gridsWrap);
        }

        function renderMonthView(root: HTMLElement, year: number, loc: string, cal: CalendarSystem): void {
            const nav = document.createElement('div');
            nav.className = 'pdx-cal-nav';

            const prevBtn = document.createElement('button');
            prevBtn.type = 'button';
            prevBtn.className = 'pdx-cal-nav-btn';
            prevBtn.setAttribute('aria-label', getComponentString('calendar', 'prevYear')());
            prevBtn.textContent = '‹';
            prevBtn.addEventListener('click', () => { _viewYear.set(year - 1); });

            const mode = selMode();
            // In month/quarter mode, title is not clickable (stays in months view)
            const canDrillToYears = mode !== 'month' && mode !== 'quarter';
            const titleBtn = document.createElement(canDrillToYears ? 'button' : 'span');
            if (canDrillToYears) (titleBtn as HTMLButtonElement).type = 'button';
            titleBtn.className = 'pdx-cal-title' + (canDrillToYears ? '' : ' pdx-cal-title-static');
            titleBtn.textContent = String(year);
            if (canDrillToYears) titleBtn.addEventListener('click', () => switchView('years'));

            const nextBtn = document.createElement('button');
            nextBtn.type = 'button';
            nextBtn.className = 'pdx-cal-nav-btn';
            nextBtn.setAttribute('aria-label', getComponentString('calendar', 'nextYear')());
            nextBtn.textContent = '›';
            nextBtn.addEventListener('click', () => { _viewYear.set(year + 1); });

            nav.appendChild(prevBtn);
            nav.appendChild(titleBtn);
            nav.appendChild(nextBtn);
            root.appendChild(nav);

            // A named group of buttons, labelled with the year shown, not a role="grid" with no
            // rows and no arrow keys: the buttons are what a user reaches.
            const grid = document.createElement('div');
            grid.className = 'pdx-cal-month-grid';
            grid.setAttribute('role', 'group');
            grid.setAttribute('aria-label', String(year));

            const monthNames = getMonthNames(loc, cal, 'short');
            for (let m = 0; m < 12; m++) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'pdx-cal-month-cell';
                if (m + 1 === _viewMonth.peek()) btn.className += ' pdx-cal-selected';
                btn.textContent = monthNames[m];
                const monthNum = m + 1;
                btn.addEventListener('click', () => selectMonth(monthNum));
                grid.appendChild(btn);
            }

            root.appendChild(grid);
        }

        function renderYearView(root: HTMLElement, year: number): void {
            const startYear = year - (year % 12);
            const endYear = startYear + 11;

            const nav = document.createElement('div');
            nav.className = 'pdx-cal-nav';

            const prevBtn = document.createElement('button');
            prevBtn.type = 'button';
            prevBtn.className = 'pdx-cal-nav-btn';
            prevBtn.setAttribute('aria-label', getComponentString('calendar', 'prevYears')());
            prevBtn.textContent = '‹';
            prevBtn.addEventListener('click', () => { _viewYear.set(year - 12); });

            const titleEl = document.createElement('span');
            titleEl.className = 'pdx-cal-title pdx-cal-title-static';
            titleEl.textContent = `${startYear} – ${endYear}`;

            const nextBtn = document.createElement('button');
            nextBtn.type = 'button';
            nextBtn.className = 'pdx-cal-nav-btn';
            nextBtn.setAttribute('aria-label', getComponentString('calendar', 'nextYears')());
            nextBtn.textContent = '›';
            nextBtn.addEventListener('click', () => { _viewYear.set(year + 12); });

            nav.appendChild(prevBtn);
            nav.appendChild(titleEl);
            nav.appendChild(nextBtn);
            root.appendChild(nav);

            const grid = document.createElement('div');
            grid.className = 'pdx-cal-year-grid';
            grid.setAttribute('role', 'group');
            grid.setAttribute('aria-label', titleEl.textContent);

            for (let y = startYear; y <= endYear; y++) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'pdx-cal-year-cell';
                if (y === _viewYear.peek()) btn.className += ' pdx-cal-selected';
                btn.textContent = String(y);
                const yr = y;
                btn.addEventListener('click', () => selectYear(yr));
                grid.appendChild(btn);
            }

            root.appendChild(grid);
        }

        ctx.expose({
            /** Focus the active day (or the month / year shown), now or once the view is drawn. */
            focusView,
        });

        return { navigate, goToday, switchView, selectDate };
    },
    render: () => html``,
});
