// The layout engines of pdx-scheduler (#1020): where each event goes when several share the time.
//
// One algorithm, three uses. Events are intervals `[start, end)` on one axis: minutes in a day column
// of the time grid, day indexes in a week row of the month view, minutes along a resource's row of the
// timeline. `assignLanes` gives each the first lane free at its start; the views read the lanes as
// side-by-side columns (time grid), stacked bars (month) or stacked rows (timeline).
//
// Pure, with no DOM: the views measure nothing to lay events out, so the layout is the same in a test,
// on the server and in the browser.

export interface Interval {
    id: string;
    start: number;
    /** Exclusive. An interval with `end <= start` is given the length of one unit. */
    end: number;
}

export interface Lane {
    id: string;
    lane: number;
}

/**
 * Order for placement: earlier first, and of two that start together the longer first, so a long event
 * keeps the leftmost lane and the short ones fit beside it. Ties on the id, so the order is stable.
 */
function placementOrder(a: Interval, b: Interval): number {
    return a.start - b.start || (b.end - b.start) - (a.end - a.start) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function normalised(items: readonly Interval[]): Interval[] {
    return items.map((i) => (i.end > i.start ? i : { ...i, end: i.start + 1 })).sort(placementOrder);
}

/** Each interval in the first lane that is free at its start. Returns them in placement order. */
export function assignLanes(items: readonly Interval[]): Lane[] {
    return placeInLanes(normalised(items)).map(({ i, lane }) => ({ id: i.id, lane }));
}

function placeInLanes(sorted: readonly Interval[]): { i: Interval; lane: number }[] {
    const laneEnds: number[] = [];
    return sorted.map((i) => {
        let lane = laneEnds.findIndex((end) => end <= i.start);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = i.end;
        return { i, lane };
    });
}

export interface ColumnPlacement {
    id: string;
    /** The column, from 0. */
    column: number;
    /** How many columns the group of overlapping events it belongs to has. */
    columns: number;
    /** How many columns it takes: 1, or more where the columns to its right are free for its whole length. */
    span: number;
}

/**
 * The time grid's layout of one day column. Events that overlap, directly or through others, form a
 * group that shares the column's width; each takes the first column free at its start, and widens to
 * the right over the columns no event of the group uses while it lasts.
 */
export function layoutColumns(items: readonly Interval[]): ColumnPlacement[] {
    const out: ColumnPlacement[] = [];
    let group: { i: Interval; column: number }[] = [];
    let groupEnd = -Infinity;
    const flush = () => {
        const columns = group.reduce((n, g) => Math.max(n, g.column + 1), 0);
        for (const g of group) {
            let span = 1;
            while (g.column + span < columns && !group.some((o) => o.column === g.column + span && o.i.start < g.i.end && g.i.start < o.i.end)) span++;
            out.push({ id: g.i.id, column: g.column, columns, span });
        }
        group = [];
        groupEnd = -Infinity;
    };
    for (const i of normalised(items)) {
        // An event that starts once every event of the group has ended begins a new group.
        if (group.length && i.start >= groupEnd) flush();
        const used = group.filter((g) => g.i.end > i.start).map((g) => g.column);
        let column = 0;
        while (used.includes(column)) column++;
        group.push({ i, column });
        groupEnd = Math.max(groupEnd, i.end);
    }
    if (group.length) flush();
    return out;
}

export interface RowLayout {
    /** The intervals in a lane under the limit. */
    placed: Lane[];
    /** For each unit of the row, how many intervals covering it did not fit: the "+N". */
    more: number[];
}

/**
 * A row of the month view (a week) or of the timeline: intervals stacked in lanes, at most `maxLanes`
 * of them. What would go in a lane past the limit is not placed; `more[u]` counts, for unit `u` of the
 * row (`0 ≤ u < length`), the intervals over it that were left out.
 */
export function layoutRow(items: readonly Interval[], length: number, maxLanes = Infinity): RowLayout {
    const more = new Array<number>(length).fill(0);
    const placed: Lane[] = [];
    for (const { i, lane } of placeInLanes(normalised(items))) {
        if (lane < maxLanes) { placed.push({ id: i.id, lane }); continue; }
        for (let u = Math.max(0, i.start); u < Math.min(length, i.end); u++) more[u]++;
    }
    return { placed, more };
}
