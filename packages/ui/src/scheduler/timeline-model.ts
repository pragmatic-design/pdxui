// The timeline's model (#1020): what pdx-scheduler draws in the `timeline` view, computed without the
// DOM, as grid-model.ts does for the time grid.
//
// A row per resource, children under their parent and hidden while it is collapsed; one row for
// everything when there are no resources. The columns are the scale's units along the period: the
// slots of the visible hours for a day, the days for a week or a month, the months for a year. An
// event is an interval along that axis, in columns and fractions of one, stacked in lanes in its row
// (`layoutRow`): a row is as tall as its lanes. What is on screen is the view's business, through the
// runtime virtualizer; this computes every row and column, and draws nothing.

import { addMonths } from '@pdxui/core';
import { eventInstant, zonedInstant, type TimelineScale } from './time';
import { layoutRow } from './layout';
import type { SchedulerEvent, SchedulerResource } from './grid-model';

// What the view draws, not what an app passes: `type` aliases, not interfaces (see grid-model.ts).

export type TimelineColumn = {
    key: string;
    /** The column's first instant, and its end (exclusive), in ms. */
    start: number;
    end: number;
    /** The date it is on, or its month's first for a year's column. */
    date: string;
    /** Minutes past midnight of its start, for a day's slots; null for a whole day or month. */
    minutes: number | null;
};

export type TimelineItem = {
    id: string;
    event: SchedulerEvent;
    /** Where it starts and ends along the axis, in columns: 2.5 is halfway through the third. */
    start: number;
    end: number;
    lane: number;
    /** It started before the period, or goes on after it. */
    before: boolean;
    after: boolean;
};

export type TimelineRow = {
    /** The resource's id; the one row without resources is `''`. */
    key: string;
    resource: SchedulerResource | null;
    /** 1 for a top-level resource, 2 for its children, as `aria-level` counts. */
    level: number;
    /** It has children: they show under it while it is expanded. */
    parent: boolean;
    expanded: boolean;
    /** Its position among its siblings, from 1, and their number. */
    posinset: number;
    setsize: number;
    items: TimelineItem[];
    /** How many lanes its events take, at least 1. */
    lanes: number;
};

/** The rows shown: every resource in order, a collapsed parent's descendants left out. */
export function timelineRows(resources: readonly SchedulerResource[], collapsed: ReadonlySet<string>): Omit<TimelineRow, 'items' | 'lanes'>[] {
    if (resources.length === 0) return [{ key: '', resource: null, level: 1, parent: false, expanded: false, posinset: 1, setsize: 1 }];
    const out: Omit<TimelineRow, 'items' | 'lanes'>[] = [];
    const walk = (list: readonly SchedulerResource[], level: number) => list.forEach((r, i) => {
        const parent = (r.children?.length ?? 0) > 0;
        const expanded = parent && !collapsed.has(r.id);
        out.push({ key: r.id, resource: r, level, parent, expanded, posinset: i + 1, setsize: list.length });
        if (expanded) walk(r.children as SchedulerResource[], level + 1);
    });
    walk(resources, 1);
    return out;
}

export interface TimelineColumnOptions {
    timeZone: string;
    /** The visible hours of a day's slots, and a slot's length, in minutes. */
    startMinutes: number;
    endMinutes: number;
    slotMinutes: number;
}

/**
 * The columns of the scale over the period's `days` (hidden days already out): a day's slots, a
 * column per day, or a column per month of the year.
 */
export function timelineColumns(scale: TimelineScale, days: readonly string[], o: TimelineColumnOptions): TimelineColumn[] {
    const at = (date: string, minutes: number) => zonedInstant(date, minutes, o.timeZone);
    if (scale === 'day') {
        const date = days[0];
        if (date === undefined) return [];
        const out: TimelineColumn[] = [];
        for (let m = o.startMinutes; m < o.endMinutes; m += o.slotMinutes) {
            out.push({ key: `${date}T${m}`, start: at(date, m), end: at(date, Math.min(m + o.slotMinutes, o.endMinutes)), date, minutes: m });
        }
        return out;
    }
    if (scale === 'year') {
        const months = [...new Set(days.map((d) => d.slice(0, 8) + '01'))];
        return months.map((m) => ({ key: m, start: at(m, 0), end: at(addMonths(m, 1), 0), date: m, minutes: null }));
    }
    return days.map((d) => ({ key: d, start: at(d, 0), end: at(d, 1440), date: d, minutes: null }));
}

/**
 * Instant `t` as a position along the columns: `i + f` inside column `i`, `i` in the gap before it
 * (an hour outside the visible ones, a hidden day), 0 before the first and the count after the last.
 */
export function axisPosition(columns: readonly TimelineColumn[], t: number): number {
    let lo = 0;
    let hi = columns.length;
    // The first column that ends after `t`.
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (columns[mid].end <= t) lo = mid + 1; else hi = mid;
    }
    if (lo === columns.length) return lo;
    const c = columns[lo];
    return t <= c.start ? lo : lo + (t - c.start) / (c.end - c.start);
}

/** Whether an event belongs in a row: every event in the row without resources, else the ones naming it. */
function belongs(event: SchedulerEvent, row: Omit<TimelineRow, 'items' | 'lanes'>): boolean {
    if (row.resource === null) return true;
    const r = event.resource;
    return r === undefined ? false : Array.isArray(r) ? r.includes(row.key) : r === row.key;
}

/** The rows with their events laid out along the columns. An event wholly outside them is left out. */
export function placeTimeline(
    events: readonly SchedulerEvent[],
    rows: readonly Omit<TimelineRow, 'items' | 'lanes'>[],
    columns: readonly TimelineColumn[],
    timeZone: string,
): TimelineRow[] {
    const first = columns[0]?.start ?? 0;
    const last = columns[columns.length - 1]?.end ?? 0;
    const spans = events.map((event) => {
        const s = eventInstant(event.start, timeZone);
        const e = eventInstant(event.end, timeZone);
        return { event, s, e, start: axisPosition(columns, s), end: axisPosition(columns, e) };
    }).filter((x) => x.end > x.start || (x.s === x.e && x.s >= first && x.s < last));
    return rows.map((row) => {
        const mine = spans.filter((x) => belongs(x.event, row));
        const byId = new Map(mine.map((x) => [x.event.id, x]));
        const { placed } = layoutRow(mine.map((x) => ({ id: x.event.id, start: x.start, end: x.end })), columns.length);
        const items = placed.map((l): TimelineItem => {
            const x = byId.get(l.id) as (typeof mine)[number];
            return { id: x.event.id, event: x.event, start: x.start, end: x.end, lane: l.lane, before: x.s < first, after: x.e > last };
        });
        return { ...row, items, lanes: items.reduce((n, it) => Math.max(n, it.lane + 1), 1) };
    });
}

/** The items of a row a column draws: those that start in it, and in the window's first column, those that started before it. */
export function itemsInColumn(row: TimelineRow, column: number, windowStart: number): TimelineItem[] {
    return row.items.filter((it) => {
        const at = Math.floor(it.start);
        if (at === column) return true;
        return column === windowStart && at < windowStart && it.end > windowStart;
    });
}
