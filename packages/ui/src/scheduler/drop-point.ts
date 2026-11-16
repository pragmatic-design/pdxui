// Where a cell of pdx-scheduler's grids is in time (#1020, part 6): the drop point a pointer over it
// gives. The time grid's row 0 is the all-day row and each row after it a slot of a column's day; a
// month's cell is a day; a timeline's cell is a column of a resource's row (column 0 is the resource's
// name, not a time).

import { zonedInstant, zonedParts } from './time';
import type { DropPoint } from './drag-model';
import type { Column } from './grid-model';
import type { MonthWeek } from './calendar-model';
import type { TimelineColumn, TimelineRow } from './timeline-model';

export type PointModel =
    | { view: 'time'; columns: readonly Column[]; slots: readonly number[]; timeZone: string }
    | { view: 'month'; weeks: readonly MonthWeek[]; timeZone: string }
    | { view: 'timeline'; columns: readonly TimelineColumn[]; rows: readonly TimelineRow[] };

/** The drop point of cell (`row`, `col`), or null where there is no time. */
export function pointOfCell(m: PointModel, row: number, col: number): DropPoint | null {
    if (m.view === 'time') {
        const c = m.columns[col];
        if (!c) return null;
        const resource = c.resource?.id ?? null;
        if (row === 0) return { at: zonedInstant(c.date, 0, m.timeZone), date: c.date, resource, allDay: true };
        const minutes = m.slots[row - 1];
        if (minutes === undefined) return null;
        return { at: zonedInstant(c.date, minutes, m.timeZone), date: c.date, resource, allDay: false };
    }
    if (m.view === 'month') {
        const date = m.weeks[row]?.days[col];
        return date === undefined ? null : { at: zonedInstant(date, 0, m.timeZone), date, resource: null, allDay: true };
    }
    const c = m.columns[col - 1];
    const r = m.rows[row];
    if (!c || !r) return null;
    return { at: c.start, date: c.date, resource: r.resource?.id ?? null, allDay: c.minutes === null };
}

/**
 * The cell a point is in, the inverse of pointOfCell: the time grid's column of its date and resource
 * (the first of its date without one) and its slot, or the all-day row for a whole-day point; the
 * month's day; the timeline's row of its resource and the column its instant falls in. Null where the
 * grid on screen has no such cell: another period, an hour outside the visible ones.
 */
export function cellOfPoint(m: PointModel, p: DropPoint): { row: number; col: number } | null {
    if (m.view === 'time') {
        const col = m.columns.findIndex((c) => c.date === p.date && (p.resource === null || c.resource?.id === p.resource));
        if (col < 0) return null;
        if (p.allDay) return { row: 0, col };
        const minutes = zonedParts(p.at, m.timeZone).minutes;
        let slot = -1;
        for (let i = 0; i < m.slots.length && m.slots[i] <= minutes; i++) slot = i;
        return slot < 0 ? null : { row: slot + 1, col };
    }
    if (m.view === 'month') {
        for (let row = 0; row < m.weeks.length; row++) {
            const col = m.weeks[row].days.indexOf(p.date);
            if (col >= 0) return { row, col };
        }
        return null;
    }
    const row = m.rows.findIndex((r) => (r.resource?.id ?? null) === p.resource);
    const col = m.columns.findIndex((c) => p.at >= c.start && p.at < c.end);
    return row < 0 || col < 0 ? null : { row, col: col + 1 };
}

/**
 * The grid cell of `grid` under the viewport point (`x`, `y`): its row and column, from its data. The
 * cell itself under the point, not the cell an element drawn over it belongs to: a timed event is a
 * child of its start cell and reaches down over the cells below, so the cell an event's button sits in
 * is not the cell under the pointer. Read that way, an end dragged a slot down was redrawn under the
 * pointer, the next move read the event's own start cell, and the end flipped on every move.
 */
export function cellAt(grid: HTMLElement, x: number, y: number): { row: number; col: number } | null {
    for (const el of document.elementsFromPoint(x, y)) {
        if (el instanceof HTMLElement && el.matches('[role="gridcell"][data-row][data-col]') && grid.contains(el)) {
            return { row: Number(el.dataset.row), col: Number(el.dataset.col) };
        }
    }
    return null;
}
