// What of the time grid is drawn (#1085): its slots in view and a few beyond, through the runtime
// virtualizer (`createVirtualizer`), as the timeline draws its rows (`timeline-window.ts`). A week of
// 30-minute slots over a whole day is 336 cells, of which some 14 rows are on screen; each cell is a
// focusable grid cell with its bindings, and drawing all of them was what made the scheduler slow to
// mount.
//
// Every slot is as tall as the theme's `--pdx-scheduler-slot-height`, which the view measures once. The
// header rows and the all-day row are sticky, so the slot under them is the one at the scroll offset
// divided by that height: the window is the virtualizer's, with no margin to add. The slot that holds
// the grid's one tab stop is always drawn, wherever the scroll is: the grid stays reachable by Tab, and
// a focused cell is not taken out from under the focus.

import { computed, createVirtualizer, type ReadonlySignal } from '@pdxui/core';

export interface SlotWindowOptions {
    /** The scroll container, the time grid; null while another view is on screen. */
    grid: () => HTMLElement | null;
    /** How many slots the grid has. */
    count: () => number;
    /** A slot's height, in px. */
    slotHeight: () => number;
    /** The slot of the tab stop, or -1 when it is not on a slot (the all-day row). */
    pinned: () => number;
}

export interface SlotWindow {
    /** The slots drawn, in order: the window, and the tab stop's slot wherever it is. */
    rows: ReadonlySignal<number[]>;
    /** The first slot of the window, which also draws the events that started above it. */
    first: ReadonlySignal<number>;
    dispose: () => void;
}

export function slotWindow(o: SlotWindowOptions): SlotWindow {
    const v = createVirtualizer({
        count: o.count,
        estimateSize: () => o.slotHeight(),
        getScrollElement: o.grid,
        overscan: 4,
    });
    const first = computed(() => v.items()[0]?.index ?? 0);
    const rows = computed(() => {
        const shown = v.items().map((it) => it.index);
        const pin = o.pinned();
        if (pin < 0 || pin >= o.count() || shown.includes(pin)) return shown;
        return [...shown, pin].sort((a, b) => a - b);
    });
    return { rows, first, dispose: v.dispose };
}
