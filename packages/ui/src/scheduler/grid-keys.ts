// The keys of pdx-scheduler's grid (#1020), as the WAI-ARIA grid pattern has them
// (https://www.w3.org/WAI/ARIA/apg/patterns/grid/): the arrows move one cell and stop at the edges,
// Home and End go to the row's first and last cell, Ctrl+Home and Ctrl+End to the grid's first and
// last, and PageUp / PageDown page through periods, the author's choice the pattern leaves open.

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
