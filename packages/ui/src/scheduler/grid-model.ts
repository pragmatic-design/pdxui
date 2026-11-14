// The time grid's model (#1020): what pdx-scheduler draws in the day, week and N-days views, computed
// without the DOM. Columns are days, or days × resources; rows are slots of the visible hours.
//
// A timed event is placed in the cell of the slot it starts in, with its offset into that slot and its
// length in slots, once per day and resource it covers, and side by side with the events it overlaps
// there (`layoutColumns`). An all-day event is a bar in the all-day row, over the adjacent columns it
// covers, in a lane (`layoutRow`). The view draws what this returns and measures nothing.

import { addDays, dayOfWeek, parseISO } from '@pdxui/core';
import { eventInstant, parseClock, zonedInstant, zonedParts } from './time';
import { layoutColumns, layoutRow, type Interval } from './layout';

export interface SchedulerEvent {
    id: string;
    title: string;
    /** ISO 8601: an instant (`Z` or an offset), a wall time in the scheduler's zone, or a date alone. */
    start: string;
    /** Exclusive, in the same forms as `start`. */
    end: string;
    allDay?: boolean;
    /** The resource, or resources, the event belongs to. */
    resource?: string | string[];
    color?: string;
    /** Neither moved nor resized. */
    readonly?: boolean;
    /** Whether it may be moved; wins over its resource's and the scheduler's. */
    draggable?: boolean;
    /** Whether it may be resized; wins over its resource's and the scheduler's. */
    resizable?: boolean;
    /** A blocked slot, drawn behind: never moved, and not counted as an overlap. */
    background?: boolean;
    [field: string]: unknown;
}

export interface SchedulerResource {
    id: string;
    label: string;
    color?: string;
    children?: SchedulerResource[];
    /** Its events are neither moved nor resized, unless an event says otherwise. */
    readonly?: boolean;
    /** Whether its events may be moved; an event's own wins, a nearer resource's wins over its parent's. */
    draggable?: boolean;
    /** Whether its events may be resized, in the same order. */
    resizable?: boolean;
    businessHours?: BusinessHours;
}

/** Per weekday, 0 = Sunday … 6 = Saturday: the working hours, or `null` for a day off. */
export type BusinessHours = Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, { start: string; end: string } | null>>;

// The records below are what the view draws, not what an app passes: they are `type` aliases, not
// interfaces, so the manifest does not list them among the component's shapes (an exported interface
// the component names is one, `manifest-shared.mjs` `scanExportedShapes`).

export type Column = {
    /** `date`, or `resource|date`. */
    key: string;
    date: string;
    resource?: SchedulerResource;
};

export type PlacedEvent = {
    id: string;
    event: SchedulerEvent;
    /** The slot it starts in, from 0. */
    slot: number;
    /** How far into that slot it starts, 0 to 1. */
    offset: number;
    /** Its length in slots. */
    length: number;
    /** Its side-by-side column among the events it overlaps, their count, and how many it takes. */
    column: number;
    columns: number;
    span: number;
    /** It started before this piece: an earlier day, or before the visible hours. */
    before: boolean;
    /** It goes on after this piece. */
    after: boolean;
};

export type AllDayBar = {
    id: string;
    event: SchedulerEvent;
    /** The first column it covers, and how many adjacent columns. */
    first: number;
    span: number;
    lane: number;
    before: boolean;
    after: boolean;
};

/** The resources the columns are drawn for: the leaves, in order. */
export function leafResources(resources: readonly SchedulerResource[]): SchedulerResource[] {
    return resources.flatMap((r) => (r.children?.length ? leafResources(r.children) : [r]));
}

/** The columns: each day, or each resource's days (`resource`), or each day's resources (`date`). */
export function buildColumns(days: readonly string[], resources: readonly SchedulerResource[], groupBy: 'resource' | 'date'): Column[] {
    const leaves = leafResources(resources);
    if (leaves.length === 0) return days.map((date) => ({ key: date, date }));
    const column = (resource: SchedulerResource, date: string): Column => ({ key: `${resource.id}|${date}`, date, resource });
    return groupBy === 'resource'
        ? leaves.flatMap((r) => days.map((d) => column(r, d)))
        : days.flatMap((d) => leaves.map((r) => column(r, d)));
}

/** The start minute of each slot from `startMinutes` to `endMinutes`; the last may be cut short. */
export function buildSlots(startMinutes: number, endMinutes: number, slotMinutes: number): number[] {
    const slots: number[] = [];
    for (let m = startMinutes; m < endMinutes; m += slotMinutes) slots.push(m);
    return slots;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** An event the all-day row draws: `allDay`, or a start that is a date alone. */
export function isAllDay(event: SchedulerEvent): boolean {
    return event.allDay === true || DATE_ONLY.test(event.start);
}

/** The resources an event names. */
function resourcesOf(event: SchedulerEvent): string[] {
    const r = event.resource;
    return r === undefined ? [] : Array.isArray(r) ? r : [r];
}

/** The leaf resources an event names, in the order of `resources`. */
export function eventResources(event: SchedulerEvent, resources: readonly SchedulerResource[]): SchedulerResource[] {
    const ids = resourcesOf(event);
    return leafResources(resources).filter((r) => ids.includes(r.id));
}

/** The timed events by cell, `column|slot`, so a cell reads its own in one lookup. */
export function cellIndex(placed: Map<string, PlacedEvent[]>, columns: readonly Column[]): Map<string, PlacedEvent[]> {
    const out = new Map<string, PlacedEvent[]>();
    columns.forEach((c, ci) => {
        for (const p of placed.get(c.key) ?? []) {
            const key = `${ci}|${p.slot}`;
            const list = out.get(key);
            if (list) list.push(p); else out.set(key, [p]);
        }
    });
    return out;
}

export type HeaderCell = { key: string; text: string; full: string | null; span: number; today: boolean };
export type HeaderRow = { key: string; corner: string; cells: HeaderCell[] };

/**
 * The time grid's header rows: one of days, or two with resources, the group above and the columns
 * below. `dayLabel` writes a day's header, `corners` name the corner cell of a row of days or of
 * resources.
 */
export function buildHeaderRows(
    columns: readonly Column[],
    days: readonly string[],
    resources: readonly SchedulerResource[],
    groupBy: 'resource' | 'date',
    o: { today: string; dayLabel: (date: string) => { text: string; full: string }; corners: { time: string; resource: string } },
): HeaderRow[] {
    const dayCell = (key: string, date: string, span: number): HeaderCell => ({ key, ...o.dayLabel(date), span, today: date === o.today });
    const resourceCell = (key: string, r: SchedulerResource, span: number): HeaderCell => ({ key, text: r.label, full: null, span, today: false });
    const leaves = leafResources(resources);
    const dayRow = (key: string, cells: HeaderCell[]): HeaderRow => ({ key, corner: o.corners.time, cells });
    const resourceRow = (key: string, cells: HeaderCell[]): HeaderRow => ({ key, corner: o.corners.resource, cells });
    const columnDays = columns.map((c) => dayCell(c.key, c.date, 1));
    if (leaves.length === 0) return [dayRow('days', columnDays)];
    if (groupBy === 'resource') return [resourceRow('groups', leaves.map((r) => resourceCell(`r|${r.id}`, r, days.length))), dayRow('days', columnDays)];
    return [
        dayRow('groups', days.map((d) => dayCell(`d|${d}`, d, leaves.length))),
        resourceRow('resources', columns.map((c) => resourceCell(c.key, c.resource as SchedulerResource, 1))),
    ];
}

/** Whether an event belongs in a column: any event without resources, else one that names its resource. */
function belongs(event: SchedulerEvent, column: Column): boolean {
    return column.resource === undefined || resourcesOf(event).includes(column.resource.id);
}

export interface TimedOptions {
    timeZone: string;
    startMinutes: number;
    endMinutes: number;
    slotMinutes: number;
}

/** The timed events of each column, laid out; every column has an entry, empty when nothing is there. */
export function placeTimed(events: readonly SchedulerEvent[], columns: readonly Column[], o: TimedOptions): Map<string, PlacedEvent[]> {
    const timed = events.filter((e) => !isAllDay(e)).map((event) => ({
        event,
        start: eventInstant(event.start, o.timeZone),
        end: eventInstant(event.end, o.timeZone),
    }));
    const out = new Map<string, PlacedEvent[]>();
    for (const column of columns) {
        const from = zonedInstant(column.date, o.startMinutes, o.timeZone);
        const to = zonedInstant(column.date, o.endMinutes, o.timeZone);
        const pieces: { event: SchedulerEvent; start: number; end: number; before: boolean; after: boolean }[] = [];
        for (const t of timed) {
            if (!belongs(t.event, column)) continue;
            const s = Math.max(t.start, from);
            const e = Math.min(t.end, to);
            if (s >= e && !(t.start === t.end && t.start >= from && t.start < to)) continue;
            // Wall minutes of the day: the clipped edges are the visible hours themselves.
            const start = s === from ? o.startMinutes : zonedParts(s, o.timeZone).minutes;
            const end = e === to ? o.endMinutes : zonedParts(e, o.timeZone).minutes;
            pieces.push({ event: t.event, start, end: Math.max(end, start), before: t.start < from, after: t.end > to });
        }
        const byId = new Map(pieces.map((p) => [p.event.id, p]));
        const layout = layoutColumns(pieces.map((p): Interval => ({ id: p.event.id, start: p.start, end: p.end })));
        out.set(column.key, layout.map((l) => {
            const p = byId.get(l.id) as (typeof pieces)[number];
            const fromSlot = (p.start - o.startMinutes) / o.slotMinutes;
            const slot = Math.floor(fromSlot);
            return {
                id: p.event.id, event: p.event, slot, offset: fromSlot - slot, length: (p.end - p.start) / o.slotMinutes,
                column: l.column, columns: l.columns, span: l.span, before: p.before, after: p.after,
            };
        }));
    }
    return out;
}

/**
 * The dates an event is on in `timeZone`, `[first, last + 1)`: an end at midnight is the day before's
 * end, and an event of no length is on the day it starts.
 */
export function eventDates(event: SchedulerEvent, timeZone: string): { from: string; to: string } {
    const from = DATE_ONLY.test(event.start) ? event.start : zonedParts(eventInstant(event.start, timeZone), timeZone).date;
    let to: string;
    if (DATE_ONLY.test(event.end)) to = event.end;
    else {
        const end = zonedParts(eventInstant(event.end, timeZone), timeZone);
        to = end.minutes > 0 ? addDays(end.date, 1) : end.date;
    }
    return { from, to: to > from ? to : addDays(from, 1) };
}

/** The all-day row: a bar per run of adjacent columns an event covers, and the number of lanes. */
export function placeAllDay(events: readonly SchedulerEvent[], columns: readonly Column[], timeZone: string): { bars: AllDayBar[]; lanes: number } {
    const runs: { key: string; event: SchedulerEvent; first: number; span: number; before: boolean; after: boolean }[] = [];
    for (const event of events.filter(isAllDay)) {
        const { from, to } = eventDates(event, timeZone);
        let run: (typeof runs)[number] | null = null;
        columns.forEach((c, i) => {
            const covered = c.date >= from && c.date < to && belongs(event, c);
            if (!covered) { run = null; return; }
            if (run && run.first + run.span === i) { run.span++; run.after = addDays(c.date, 1) < to; return; }
            run = { key: `${event.id}#${i}`, event, first: i, span: 1, before: c.date > from, after: addDays(c.date, 1) < to };
            runs.push(run);
        });
    }
    const byKey = new Map(runs.map((r) => [r.key, r]));
    const { placed } = layoutRow(runs.map((r) => ({ id: r.key, start: r.first, end: r.first + r.span })), columns.length);
    const bars = placed.map((l) => {
        const r = byKey.get(l.id) as (typeof runs)[number];
        return { id: r.event.id, event: r.event, first: r.first, span: r.span, lane: l.lane, before: r.before, after: r.after };
    });
    return { bars, lanes: bars.reduce((n, b) => Math.max(n, b.lane + 1), 0) };
}

/** Whether `date`'s weekday has business hours at all. */
export function isWorkingDay(date: string, hours: BusinessHours): boolean {
    const d = parseISO(date);
    return !!hours[dayOfWeek(d.year, d.month, d.day) as 0 | 1 | 2 | 3 | 4 | 5 | 6];
}

/** Whether `minutes` past midnight of `date` falls in that weekday's business hours. */
export function isBusinessTime(date: string, minutes: number, hours: BusinessHours): boolean {
    const d = parseISO(date);
    const day = hours[dayOfWeek(d.year, d.month, d.day) as 0 | 1 | 2 | 3 | 4 | 5 | 6];
    if (!day) return false;
    return minutes >= parseClock(day.start) && minutes < parseClock(day.end);
}
