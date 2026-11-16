// The keyboard way to move and resize an event of pdx-scheduler (#1020, part 7), computed without the
// DOM. Space lifts a focused event; then each arrow is a pointer that steps one cell: the arrows move
// it, Shift+arrows move its end, Alt+Shift+arrows its start. A step reads the event's edge as a cell of
// the grid on screen, moves that cell along the view's axis, and hands the two cells' points to the
// pointer's own moveEvent and resizeEvent: one rule for where an event lands, whatever moved it.
//
// The axis is the view's. The time grid: Up and Down a slot, Left and Right a column (another day or
// resource), an all-day event a column and, resized, a day. The month: Left and Right a day, Up and
// Down a week, across the rows. The timeline: Left and Right a column, Up and Down a resource's row; a
// resize only along the time.
//
// Shift+arrows on an empty cell select a range to create an event over (keySelect): from the cell the
// selection began on to the one the keys reached, the range a drag over them gives (createRange).

import { addDays } from '@pdxui/core';
import { eventInstant, zonedInstant, zonedParts } from './time';
import { eventDates, isAllDay, type SchedulerEvent } from './grid-model';
import { createRange, moveEvent, resizeEvent, type DropPoint, type Placement } from './drag-model';
import { cellOfPoint, pointOfCell, type PointModel } from './drop-point';
import type { Cell } from './grid-keys';

/** What the arrows do while an event is lifted: move it, or move its start or its end. */
export type KeyGesture = 'move' | 'start' | 'end';
type Arrow = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

const DELTA: Record<Arrow, { dr: number; dc: number }> = {
    ArrowUp: { dr: -1, dc: 0 }, ArrowDown: { dr: 1, dc: 0 }, ArrowLeft: { dr: 0, dc: -1 }, ArrowRight: { dr: 0, dc: 1 },
};

/** The gesture an arrow key makes on a lifted event, or null for any other key or modifier. */
export function keyGesture(e: { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): { gesture: KeyGesture; key: Arrow } | null {
    if (!(e.key in DELTA) || e.ctrlKey || e.metaKey) return null;
    const key = e.key as Arrow;
    if (e.shiftKey) return { gesture: e.altKey ? 'start' : 'end', key };
    return e.altKey ? null : { gesture: 'move', key };
}

/** The point of an event's edge: its start, or its last instant or day (its end is exclusive). */
export function edgePoint(e: SchedulerEvent, edge: 'start' | 'end', resource: string | null, timeZone: string): DropPoint {
    if (isAllDay(e)) {
        const d = eventDates(e, timeZone);
        const date = edge === 'start' ? d.from : addDays(d.to, -1);
        return { at: zonedInstant(date, 0, timeZone), date, resource, allDay: true };
    }
    const at = edge === 'start' ? eventInstant(e.start, timeZone) : eventInstant(e.end, timeZone) - 1;
    return { at, date: zonedParts(at, timeZone).date, resource, allDay: false };
}

export interface KeyStep {
    gesture: KeyGesture;
    key: Arrow;
    /** The resource the event was lifted in: the column or row it moves from. */
    resource: string | null;
    /** The cell the event was last drawn in, for an edge the grid on screen has no cell for. */
    cell: Cell;
    /** A slot's length in ms, the step of a timed resize. */
    step: number;
    timeZone: string;
}

/**
 * Event `e` (as it is drawn now) one key further, in the grid `m` of `size`: its new placement and the
 * cell its moved edge is now in. Null when the key does not step it: an edge of the grid, an axis the
 * gesture does not use.
 */
export function keyStep(m: PointModel, size: { rows: number; cols: number }, e: SchedulerEvent, o: KeyStep): { placement: Placement; cell: Cell } | null {
    const edge = o.gesture === 'end' ? 'end' : 'start';
    const from = cellOfPoint(m, edgePoint(e, edge, o.resource, o.timeZone)) ?? o.cell;
    const to = targetCell(m, size, from, e, o);
    if (!to || (to.row === from.row && to.col === from.col)) return null;
    const fromPoint = pointOfCell(m, from.row, from.col);
    const toPoint = pointOfCell(m, to.row, to.col);
    if (!fromPoint || !toPoint) return null;
    const placement = o.gesture === 'move'
        ? moveEvent(e, { point: fromPoint }, toPoint, o.timeZone)
        : resizeEvent(e, edge, toPoint, o.step, o.timeZone);
    return { placement, cell: to };
}

export interface KeySelect {
    /** The cell the selection began on. */
    anchor: Cell;
    /** The cell the keys reached so far. */
    cell: Cell;
    key: Arrow;
    /** A slot's length in ms: a timed range ends a slot after the last one it takes in. */
    step: number;
    timeZone: string;
}

/**
 * A selection over empty cells one Shift+arrow further, in the grid `m` of `size`: the cell it reaches
 * and the range from the anchor's cell to it, both included. Null when the key cannot take it there: off
 * the grid, or to a cell of another resource or of the other kind (a whole day against a slot), which
 * one event could not cover.
 */
export function keySelect(m: PointModel, size: { rows: number; cols: number }, o: KeySelect): { cell: Cell; range: ReturnType<typeof createRange> } | null {
    const { dr, dc } = DELTA[o.key];
    const to = { row: o.cell.row + dr, col: o.cell.col + dc };
    if (to.row < 0 || to.row >= size.rows || to.col < 0 || to.col >= size.cols) return null;
    const anchor = pointOfCell(m, o.anchor.row, o.anchor.col);
    const reached = pointOfCell(m, to.row, to.col);
    if (!anchor || !reached || reached.resource !== anchor.resource || reached.allDay !== anchor.allDay) return null;
    return { cell: to, range: createRange(anchor, reached, o.step, o.timeZone) };
}

/** The cell an arrow takes the edge to, along the view's axis; null off the grid or off the axis. */
function targetCell(m: PointModel, size: { rows: number; cols: number }, from: Cell, e: SchedulerEvent, o: KeyStep): Cell | null {
    const { dr, dc } = DELTA[o.key];
    const clamp = (row: number, col: number, minRow: number, maxRow: number, minCol: number): Cell =>
        ({ row: Math.max(minRow, Math.min(maxRow, row)), col: Math.max(minCol, Math.min(size.cols - 1, col)) });
    // By date: the month's days, which run on across its rows, and an all-day resize in the time grid,
    // whose next column may be another resource's.
    const byDate = (days: number): Cell | null => {
        if (days === 0 || m.view === 'timeline') return null;
        const here = pointOfCell(m, from.row, from.col);
        if (!here) return null;
        const date = addDays(here.date, days);
        return cellOfPoint(m, { at: zonedInstant(date, 0, m.timeZone), date, resource: here.resource, allDay: true });
    };
    if (m.view === 'month') return byDate(dc !== 0 ? dc : dr * 7);
    if (m.view === 'time') {
        if (isAllDay(e)) return o.gesture === 'move' ? (dc === 0 ? null : clamp(0, from.col + dc, 0, 0, 0)) : byDate(dc);
        if (o.gesture !== 'move' && dc !== 0) return null;
        return clamp(from.row + dr, from.col + dc, 1, size.rows - 1, 0);
    }
    if (o.gesture !== 'move' && dr !== 0) return null;
    return clamp(from.row + dr, from.col + dc, 0, size.rows - 1, 1);
}
