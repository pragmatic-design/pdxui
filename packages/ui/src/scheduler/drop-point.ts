// Where a cell of pdx-scheduler's grids is in time (#1020, part 6): the drop point a pointer over it
// gives. The time grid's row 0 is the all-day row and each row after it a slot of a column's day; a
// month's cell is a day; a timeline's cell is a column of a resource's row (column 0 is the resource's
// name, not a time).

import { zonedInstant } from './time';
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

/** The grid cell of `grid` under the viewport point (`x`, `y`): its row and column, from its data. */
export function cellAt(grid: HTMLElement, x: number, y: number): { row: number; col: number } | null {
    for (const el of document.elementsFromPoint(x, y)) {
        if (!(el instanceof HTMLElement) || !grid.contains(el)) continue;
        const cell = el.closest('[role="gridcell"][data-row][data-col]') as HTMLElement | null;
        if (cell && grid.contains(cell)) return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
    }
    return null;
}
