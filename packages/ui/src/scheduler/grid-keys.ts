// The keys of pdx-scheduler's grid (#1020), as the WAI-ARIA grid pattern has them
// (https://www.w3.org/WAI/ARIA/apg/patterns/grid/): the arrows move one cell and stop at the edges,
// Home and End go to the row's first and last cell, Ctrl+Home and Ctrl+End to the grid's first and
// last, and PageUp / PageDown page through periods, the author's choice the pattern leaves open.

import { addDays, getWeekRange } from '@pdxui/core';

export interface Cell {
    row: number;
    col: number;
}

export type GridKeyTarget = { cell: Cell } | { period: 1 | -1 } | null;

/** Where a key takes the focus from `at`, in a grid of `rows` × `cols`; null when it is not the grid's. */
export function gridKeyTarget(
    e: { key: string; ctrlKey: boolean; metaKey: boolean },
    at: Cell,
    size: { rows: number; cols: number },
): GridKeyTarget {
    const lastRow = size.rows - 1;
    const lastCol = size.cols - 1;
    const clamp = (row: number, col: number): { cell: Cell } => ({
        cell: { row: Math.max(0, Math.min(lastRow, row)), col: Math.max(0, Math.min(lastCol, col)) },
    });
    const whole = e.ctrlKey || e.metaKey;
    switch (e.key) {
        case 'ArrowUp': return clamp(at.row - 1, at.col);
        case 'ArrowDown': return clamp(at.row + 1, at.col);
        case 'ArrowLeft': return clamp(at.row, at.col - 1);
        case 'ArrowRight': return clamp(at.row, at.col + 1);
        case 'Home': return whole ? clamp(0, 0) : clamp(at.row, 0);
        case 'End': return whole ? clamp(lastRow, lastCol) : clamp(at.row, lastCol);
        case 'PageUp': return { period: -1 };
        case 'PageDown': return { period: 1 };
        default: return null;
    }
}

export type DayKeyTarget = { date: string } | { period: 1 | -1 } | null;

/**
 * The year view's keys, a date picker's (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/):
 * the arrows move a day or a week, across the months, Home and End to the week's first and last day,
 * PageUp / PageDown page through years. The focus stays in `[min, max)`, the year on screen.
 */
export function dayKeyTarget(
    e: { key: string },
    at: string,
    o: { firstDay: number; min: string; max: string },
): DayKeyTarget {
    const clamp = (d: string): { date: string } => ({ date: d < o.min ? o.min : d >= o.max ? addDays(o.max, -1) : d });
    const weekStart = getWeekRange(at, o.firstDay).start;
    switch (e.key) {
        case 'ArrowLeft': return clamp(addDays(at, -1));
        case 'ArrowRight': return clamp(addDays(at, 1));
        case 'ArrowUp': return clamp(addDays(at, -7));
        case 'ArrowDown': return clamp(addDays(at, 7));
        case 'Home': return clamp(weekStart);
        case 'End': return clamp(addDays(weekStart, 6));
        case 'PageUp': return { period: -1 };
        case 'PageDown': return { period: 1 };
        default: return null;
    }
}
