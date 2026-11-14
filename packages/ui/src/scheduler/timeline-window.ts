// What of the timeline is drawn (#1020): its rows and columns in view, through the runtime virtualizer
// (`createVirtualizer`), one along each axis of the same scroll container. A timeline of 500
// resources over a day of 30-minute slots is 24 000 cells; this draws the ones on screen and a few
// beyond.
//
// A row's height is known without measuring it: its lanes times a lane's height, which the view
// measures once from the theme. The estimate reads the rows, so a row that gains a lane, or a parent
// collapsed, moves the rows after it. The cell that holds the grid's one tab stop is always drawn,
// wherever the scroll is: the grid stays reachable by Tab, and a focused cell is not taken out from
// under the focus.

import { computed, createVirtualizer, type ReadonlySignal, type VirtualItem } from '@pdxui/core';
import type { TimelineRow } from './timeline-model';

export interface TimelineWindowOptions {
    /** The scroll container, the grid; null while another view is on screen. */
    grid: () => HTMLElement | null;
    rows: () => readonly TimelineRow[];
    columns: () => number;
    /** A lane's height and a column's width, in px. */
    metrics: () => { lane: number; column: number };
    /** The tab stop's row and column (among the time columns, from 0). */
    pinned: () => { row: number; col: number };
}

export interface TimelineWindow {
    rows: ReadonlySignal<VirtualItem[]>;
    columns: ReadonlySignal<VirtualItem[]>;
    /** The first column in view, which also draws the events that started before it. */
    firstColumn: ReadonlySignal<number>;
    /** The rows' total height, in px. */
    height: ReadonlySignal<number>;
    rowRect: (index: number) => { start: number; size: number };
    columnRect: (index: number) => { start: number; size: number };
    dispose: () => void;
}

/** `items` with item `index` among them, in order, when it is in range and not already there. */
function including(items: VirtualItem[], index: number, count: number, rect: (i: number) => { start: number; size: number }): VirtualItem[] {
    if (index < 0 || index >= count || items.some((it) => it.index === index)) return items;
    const r = rect(index);
    return [...items, { index, start: r.start, size: r.size, offsetStart: r.start }].sort((a, b) => a.index - b.index);
}

export function timelineWindow(o: TimelineWindowOptions): TimelineWindow {
    const rowsV = createVirtualizer({
        count: () => o.rows().length,
        estimateSize: (i) => (o.rows()[i]?.lanes ?? 1) * o.metrics().lane,
        getScrollElement: o.grid,
        overscan: 4,
    });
    const colsV = createVirtualizer({
        count: o.columns,
        estimateSize: () => o.metrics().column,
        getScrollElement: o.grid,
        horizontal: true,
        overscan: 2,
    });
    return {
        rows: computed(() => including(rowsV.items(), o.pinned().row, o.rows().length, rowsV.itemRect)),
        columns: computed(() => including(colsV.items(), o.pinned().col, o.columns(), colsV.itemRect)),
        firstColumn: computed(() => colsV.items()[0]?.index ?? 0),
        height: rowsV.totalSize,
        rowRect: rowsV.itemRect,
        columnRect: colsV.itemRect,
        dispose: () => { rowsV.dispose(); colsV.dispose(); },
    };
}
