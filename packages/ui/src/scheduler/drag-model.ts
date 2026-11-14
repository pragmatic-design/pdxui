// What a pointer gesture does to an event (#1020, part 6), computed without the DOM.
//
// A view turns the pointer into a drop point: an instant on the grid (the start of the slot under it,
// or a day), the resource of that column or row, and whether the point is a whole day. This module
// turns the gesture into the event's new range: a move keeps the duration and the offset from the start
// at which the event was grabbed; a resize moves one edge, never past the other; a create spans from
// the slot it began on to the one under the pointer. It also says who may do what, and which events a
// new range would overlap. The component draws the result and asks the app before writing it.

import { addDays } from '@pdxui/core';
import { eventInstant, zonedInstant, zonedParts } from './time';
import { isAllDay, eventDates, type SchedulerEvent, type SchedulerResource } from './grid-model';

/** Where the pointer is, as the grid under it reads it. */
export type DropPoint = {
    /** The instant at the pointer, snapped to the start of its slot (or its day's midnight). */
    at: number;
    /** The calendar date of that point in the scheduler's zone. */
    date: string;
    /** The resource of that column or row; null without resources. */
    resource: string | null;
    /** A whole-day point: the all-day row, a day of the month, a day or month of the timeline. */
    allDay: boolean;
};

/** An event's range as the component writes it back: in the form its `start` was written. */
export type Placement = { start: string; end: string; resource: string | string[] | undefined };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT = /(?:Z|[+-]\d{2}:\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Instant `ms` written as `like` was: a date alone stays a date, an instant (`Z` or an offset) is
 * written in UTC, a wall time stays a wall time in `timeZone`.
 */
export function formatLike(like: string, ms: number, timeZone: string): string {
    if (DATE_ONLY.test(like)) return zonedParts(ms, timeZone).date;
    if (INSTANT.test(like)) return new Date(ms).toISOString().replace('.000Z', 'Z');
    const p = zonedParts(ms, timeZone);
    return `${p.date}T${pad(Math.floor(p.minutes / 60))}:${pad(p.minutes % 60)}`;
}

/** The event's resources after a move from `from` to `to`: the one it was dragged from is replaced. */
function movedResource(event: SchedulerEvent, from: string | null, to: string | null): string | string[] | undefined {
    if (from === null || to === null || from === to) return event.resource;
    const r = event.resource;
    if (Array.isArray(r)) return r.includes(to) ? r.filter((x) => x !== from) : r.map((x) => (x === from ? to : x));
    return to;
}

export interface MoveGrab {
    /** The point the event was grabbed at. */
    point: DropPoint;
}

/**
 * The event moved so that the point it was grabbed at lands on `to`. A whole-day move (an all-day
 * event, or any event in the month or a day-wide timeline column) moves by whole days and keeps the
 * wall times; a timed move keeps the duration.
 */
export function moveEvent(event: SchedulerEvent, grab: MoveGrab, to: DropPoint, timeZone: string): Placement {
    const resource = movedResource(event, grab.point.resource, to.resource);
    if (isAllDay(event) || grab.point.allDay || to.allDay) {
        const days = dayDelta(grab.point.date, to.date);
        return { start: shiftDays(event.start, days, timeZone), end: shiftDays(event.end, days, timeZone), resource };
    }
    const start = eventInstant(event.start, timeZone);
    const end = eventInstant(event.end, timeZone);
    const delta = to.at - grab.point.at;
    return { start: formatLike(event.start, start + delta, timeZone), end: formatLike(event.end, end + delta, timeZone), resource };
}

/** Whole days from `a` to `b`, both ISO dates. */
function dayDelta(a: string, b: string): number {
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
}

/** A start or end moved by whole days at the same wall time, in the form it was written. */
function shiftDays(value: string, days: number, timeZone: string): string {
    if (DATE_ONLY.test(value)) return addDays(value, days);
    const p = zonedParts(eventInstant(value, timeZone), timeZone);
    return formatLike(value, zonedInstant(addDays(p.date, days), p.minutes, timeZone), timeZone);
}

/**
 * One edge of the event moved to the point, kept at least one `step` from the other: the end to the
 * end of the slot or day under the pointer, the start to its start. `step` is a slot's length in ms
 * for a timed event; a whole-day edge moves by days.
 */
export function resizeEvent(event: SchedulerEvent, edge: 'start' | 'end', to: DropPoint, step: number, timeZone: string): Placement {
    if (isAllDay(event) || to.allDay) {
        const { from, to: until } = eventDates(event, timeZone);
        if (edge === 'end') {
            const last = to.date < from ? from : to.date;
            return { start: event.start, end: endOfDays(event, addDays(last, 1), timeZone), resource: event.resource };
        }
        const first = to.date >= until ? addDays(until, -1) : to.date;
        return { start: startOfDays(event, first, timeZone), end: event.end, resource: event.resource };
    }
    const start = eventInstant(event.start, timeZone);
    const end = eventInstant(event.end, timeZone);
    if (edge === 'end') return { start: event.start, end: formatLike(event.end, Math.max(to.at + step, start + step), timeZone), resource: event.resource };
    return { start: formatLike(event.start, Math.min(to.at, end - step), timeZone), end: event.end, resource: event.resource };
}

/** A whole-day end `date` (exclusive) in the form the event's end was written. */
function endOfDays(event: SchedulerEvent, date: string, timeZone: string): string {
    return DATE_ONLY.test(event.end) ? date : formatLike(event.end, zonedInstant(date, 0, timeZone), timeZone);
}

function startOfDays(event: SchedulerEvent, date: string, timeZone: string): string {
    return DATE_ONLY.test(event.start) ? date : formatLike(event.start, zonedInstant(date, 0, timeZone), timeZone);
}

/**
 * The range a drag on empty slots selects, from the slot it began on to the one under the pointer,
 * both included: `step` is a slot's length in ms; whole days for whole-day points. Instants in UTC,
 * as `slot-open` gives them.
 */
export function createRange(anchor: DropPoint, to: DropPoint, step: number, timeZone: string): { start: string; end: string; resource: string | null; allDay: boolean } {
    if (anchor.allDay) {
        const [a, b] = anchor.date <= to.date ? [anchor.date, to.date] : [to.date, anchor.date];
        return { start: iso(zonedInstant(a, 0, timeZone)), end: iso(zonedInstant(addDays(b, 1), 0, timeZone)), resource: anchor.resource, allDay: true };
    }
    const [a, b] = anchor.at <= to.at ? [anchor.at, to.at] : [to.at, anchor.at];
    return { start: iso(a), end: iso(b + step), resource: anchor.resource, allDay: false };
}

const iso = (ms: number) => new Date(ms).toISOString();

/** The resources an event or placement names. */
function namesOf(r: string | string[] | undefined): string[] {
    return r === undefined ? [] : Array.isArray(r) ? r : [r];
}

/**
 * The events a placement of `id` would overlap: those that share a resource with it (or, without
 * resources, any), whose range crosses it. Background events are not counted.
 */
export function conflicts(events: readonly SchedulerEvent[], id: string | null, placed: { start: string; end: string; resource: string | string[] | undefined | null }, timeZone: string): SchedulerEvent[] {
    const s = eventInstant(placed.start, timeZone);
    const e = eventInstant(placed.end, timeZone);
    const mine = namesOf(placed.resource ?? undefined);
    return events.filter((o) => {
        if (o.id === id || o.background === true) return false;
        const theirs = namesOf(o.resource);
        if (mine.length && theirs.length && !theirs.some((r) => mine.includes(r))) return false;
        return eventInstant(o.start, timeZone) < e && s < eventInstant(o.end, timeZone);
    });
}

export type Permission = 'move' | 'resize';

/** A resource and its ancestors, nearest first. */
function lineage(resources: readonly SchedulerResource[], id: string): SchedulerResource[] {
    for (const r of resources) {
        if (r.id === id) return [r];
        const below = lineage(r.children ?? [], id);
        if (below.length) return [...below, r];
    }
    return [];
}

/**
 * Whether an event may be moved or resized. The event's own `readonly`, `draggable` or `resizable`
 * decides first; then its resources' (the nearest ancestor that says); then the scheduler's.
 */
export function allowed(event: SchedulerEvent, what: Permission, resources: readonly SchedulerResource[], scheduler: { readonly: boolean }): boolean {
    if (event.readonly === true || event.background === true) return false;
    const key = what === 'move' ? 'draggable' : 'resizable';
    const own = event[key];
    if (typeof own === 'boolean') return own;
    for (const id of namesOf(event.resource)) {
        for (const r of lineage(resources, id)) {
            if (r.readonly === true) return false;
            const said = r[key];
            if (typeof said === 'boolean') return said;
        }
    }
    return !scheduler.readonly;
}
