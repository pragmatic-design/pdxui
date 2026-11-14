// The time model of pdx-scheduler (#1020): the dates a view shows, paging through periods, minutes
// of a day, and wall times in an IANA time zone.
//
// Core's calendar engine (`@pdxui/core`) works in ISO dates (`YYYY-MM-DD`) with no time and no zone,
// and this builds on it. A scheduler also places events at minutes of a day and shows them in a zone;
// that part goes through `Intl.DateTimeFormat`, which knows every zone's rules, so there is no
// dependency and no table of offsets to keep current.

import { addDays, addMonths, addYears, dayOfWeek, getWeekRange, parseISO, toISO } from '@pdxui/core';

export type SchedulerView = 'day' | 'week' | 'days' | 'month' | 'year' | 'agenda' | 'timeline';
export type TimelineScale = 'day' | 'week' | 'month' | 'year';

export interface ViewRangeOptions {
    /** The first day of the week, 0 = Sunday … 6 = Saturday. */
    firstDay: number;
    /** How many days `days` shows. Default 3. */
    days?: number;
    /** How many days `agenda` lists. Default 7. */
    agendaDays?: number;
    /** The period `timeline` shows. Default 'week'. */
    timelineScale?: TimelineScale;
    /** Days of the week the day columns leave out, 0 = Sunday … 6 = Saturday. The range keeps them. */
    hiddenDays?: readonly number[];
}

/** The dates a view shows: `[start, end)` and the days drawn, in order. */
export interface ViewRange {
    start: string;
    /** Exclusive: the day after the last one. */
    end: string;
    days: string[];
}

/** Every date in `[start, end)`. */
function datesBetween(start: string, end: string): string[] {
    const out: string[] = [];
    for (let d = start; d < end; d = addDays(d, 1)) out.push(d);
    return out;
}

function firstOfMonth(iso: string): string {
    return iso.slice(0, 8) + '01';
}

function firstOfYear(iso: string): string {
    return iso.slice(0, 5) + '01-01';
}

/** `[start, end)` before hidden days are taken out. */
function span(view: SchedulerView, date: string, o: ViewRangeOptions): { start: string; end: string } {
    switch (view) {
        case 'day':
            return { start: date, end: addDays(date, 1) };
        case 'week': {
            const start = getWeekRange(date, o.firstDay).start;
            return { start, end: addDays(start, 7) };
        }
        case 'days':
            return { start: date, end: addDays(date, o.days ?? 3) };
        case 'agenda':
            return { start: date, end: addDays(date, o.agendaDays ?? 7) };
        case 'month': {
            // The whole weeks that hold the month, so the grid is rectangular.
            const first = firstOfMonth(date);
            const start = getWeekRange(first, o.firstDay).start;
            const next = addMonths(first, 1);
            const lastWeek = getWeekRange(addDays(next, -1), o.firstDay).start;
            return { start, end: addDays(lastWeek, 7) };
        }
        case 'year': {
            const start = firstOfYear(date);
            return { start, end: addYears(start, 1) };
        }
        case 'timeline': {
            const scale = o.timelineScale ?? 'week';
            if (scale === 'month') {
                const start = firstOfMonth(date);
                return { start, end: addMonths(start, 1) };
            }
            return span(scale, date, o);
        }
    }
}

/** The dates `view` shows for the reference `date`. */
export function viewRange(view: SchedulerView, date: string, options: ViewRangeOptions): ViewRange {
    const { start, end } = span(view, date, options);
    const hidden = options.hiddenDays ?? [];
    const days = datesBetween(start, end).filter((d) => {
        if (hidden.length === 0) return true;
        const p = parseISO(d);
        return !hidden.includes(dayOfWeek(p.year, p.month, p.day));
    });
    return { start, end, days };
}

/** The reference date of the period before (`-1`) or after (`1`) the one `date` is in. */
export function stepPeriod(view: SchedulerView, date: string, direction: 1 | -1, options: ViewRangeOptions): string {
    switch (view) {
        case 'day': return addDays(date, direction);
        case 'week': return addDays(date, 7 * direction);
        case 'days': return addDays(date, (options.days ?? 3) * direction);
        case 'agenda': return addDays(date, (options.agendaDays ?? 7) * direction);
        case 'month': return addMonths(date, direction);
        case 'year': return addYears(date, direction);
        case 'timeline': {
            const scale = options.timelineScale ?? 'week';
            return scale === 'month' ? addMonths(date, direction) : stepPeriod(scale, date, direction, options);
        }
    }
}

// ─── Minutes of a day ─────────────────────────────────────────

const CLOCK = /^([01]\d|2[0-4]):([0-5]\d)$/;

/** 'HH:mm' as minutes since midnight. '24:00' is 1440, the end of the day. */
export function parseClock(value: string): number {
    const m = CLOCK.exec(value);
    const minutes = m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
    if (!(minutes <= 1440)) throw new RangeError(`"${value}" is not a time of day in HH:mm, 00:00 to 24:00`);
    return minutes;
}

/** `minutes` on a multiple of `slot`: the boundary before it, the nearest one, or the one after. */
export function snap(minutes: number, slot: number, mode: 'floor' | 'round' | 'ceil' = 'floor'): number {
    return Math[mode](minutes / slot) * slot;
}

// ─── Time zones ───────────────────────────────────────────────

/** A formatter per zone: building one costs far more than using it (#894). */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
    let f = formatters.get(timeZone);
    if (!f) {
        // Throws a RangeError for a zone Intl does not know, which is the error to give.
        f = new Intl.DateTimeFormat('en-US', {
            timeZone, hourCycle: 'h23',
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
        formatters.set(timeZone, f);
    }
    return f;
}

/** The wall clock of `timeZone` at instant `ms`, read as if it were UTC. */
function wallAsUtc(ms: number, timeZone: string): number {
    const p: Record<string, number> = {};
    for (const part of formatter(timeZone).formatToParts(ms)) {
        if (part.type !== 'literal') p[part.type] = Number(part.value);
    }
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** The zone's offset from UTC at instant `ms`, in ms. Seconds below a minute are dropped. */
function offsetAt(ms: number, timeZone: string): number {
    const whole = ms - (ms % 1000 + 1000) % 1000;
    return wallAsUtc(whole, timeZone) - whole;
}

/** Instant `ms` as a date and minutes since midnight in `timeZone`. */
export function zonedParts(ms: number, timeZone: string): { date: string; minutes: number } {
    const wall = new Date(wallAsUtc(ms, timeZone));
    return {
        date: toISO({ year: wall.getUTCFullYear(), month: wall.getUTCMonth() + 1, day: wall.getUTCDate() }),
        minutes: wall.getUTCHours() * 60 + wall.getUTCMinutes(),
    };
}

/**
 * The instant of `minutes` past midnight of `date` in `timeZone`.
 *
 * Where a DST change skips the wall time, it moves forward by the gap (02:30 on a spring-forward
 * night is 03:30); where it repeats it, it is the earlier of the two. That is Temporal's
 * 'compatible' disambiguation, the one calendars use.
 */
export function zonedInstant(date: string, minutes: number, timeZone: string): number {
    const d = parseISO(date);
    const wall = Date.UTC(d.year, d.month - 1, d.day, 0, minutes);
    // The two offsets in force around that wall time: equal except near a change.
    const before = offsetAt(wall - 864e5, timeZone);
    const after = offsetAt(wall + 864e5, timeZone);
    const candidates = [wall - before, wall - after].filter((t) => wallAsUtc(t, timeZone) === wall);
    // Repeated: both read back as the wall time; take the earlier. Skipped: neither does; the wall
    // time is in the gap, and the offset from before the change carries it forward by the gap.
    if (candidates.length > 0) return Math.min(...candidates);
    return wall - before;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_LOCAL = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * An event's `start` or `end` as an instant. With an offset or `Z` it is that instant; without one it
 * is a wall time in `timeZone`; a date alone is its midnight there.
 */
export function eventInstant(value: string, timeZone: string): number {
    if (ISO_INSTANT.test(value)) return Date.parse(value);
    const local = ISO_LOCAL.exec(value);
    if (local) return zonedInstant(local[1], Number(local[2]) * 60 + Number(local[3]), timeZone) + Number(local[4] ?? 0) * 1000;
    if (ISO_DATE.test(value)) return zonedInstant(value, 0, timeZone);
    throw new RangeError(`"${value}" is not an ISO 8601 date or date-time`);
}
