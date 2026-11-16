// pdx-scheduler's series in the views (#1020, part 8b). A series is an event with an `rrule`; it is
// drawn as its occurrences in the period, and each occurrence is an event shaped like an override —
// `seriesId` and `recurrenceId`, the series' id and the occurrence's original start — under an id of
// its own. An override is an event of `events` with those two fields (the owner's choice, iCalendar's
// UID and RECURRENCE-ID): it takes its occurrence's place, wherever it was moved to.
//
// A change made to the whole series moves it by what one occurrence moved, in wall time: a day and
// half an hour later on the occurrence is a day and half an hour later on the series' first start, so
// summer time between the two does not move it an hour.

import { addDays } from '@pdxui/core';
import { eventInstant, zonedInstant, zonedParts } from './time';
import { formatLike, type Placement } from './drag-model';
import { expandSeries } from './recurrence';
import type { SchedulerEvent } from './grid-model';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const dayNumber = (date: string) => { const [y, m, d] = date.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86_400_000; };

/** The id the occurrence of series `id` that starts at `start` is drawn under. */
export function occurrenceId(id: string, start: string): string {
    return `${id}::${start}`;
}

/**
 * The events as the views draw them in `range` (instants, `to` exclusive): a series as its occurrences,
 * minus those an override in `events` replaces; every other event, overrides included, as it is.
 */
export function expandEvents(events: readonly SchedulerEvent[], range: { from: number; to: number }, timeZone: string): SchedulerEvent[] {
    const replaced = new Map<string, Set<number>>();
    for (const e of events) {
        if (e.seriesId === undefined || e.recurrenceId === undefined) continue;
        const set = replaced.get(e.seriesId) ?? new Set<number>();
        set.add(eventInstant(e.recurrenceId, timeZone));
        replaced.set(e.seriesId, set);
    }
    const out: SchedulerEvent[] = [];
    for (const e of events) {
        if (!e.rrule) { out.push(e); continue; }
        const { rrule, exdate, ...rest } = e;
        const taken = replaced.get(e.id);
        for (const o of expandSeries({ start: e.start, end: e.end, rrule, exdate }, range, timeZone)) {
            if (taken?.has(eventInstant(o.start, timeZone))) continue;
            out.push({ ...rest, id: occurrenceId(e.id, o.start), start: o.start, end: o.end, seriesId: e.id, recurrenceId: o.start });
        }
    }
    return out;
}

/** `value` moved by what `from` moved to become `to`: days and minutes of wall time in `timeZone`. */
function shifted(value: string, from: string, to: string, timeZone: string): string {
    if (DATE_ONLY.test(value)) return addDays(value, dayNumber(to.slice(0, 10)) - dayNumber(from.slice(0, 10)));
    const a = zonedParts(eventInstant(from, timeZone), timeZone);
    const b = zonedParts(eventInstant(to, timeZone), timeZone);
    const v = zonedParts(eventInstant(value, timeZone), timeZone);
    const minutes = v.minutes + (b.minutes - a.minutes);
    const days = dayNumber(b.date) - dayNumber(a.date) + Math.floor(minutes / 1440);
    return formatLike(value, zonedInstant(addDays(v.date, days), ((minutes % 1440) + 1440) % 1440, timeZone), timeZone);
}

/**
 * Series `series` changed as its occurrence `occurrence` was to `to`: its start and end moved by what
 * the occurrence's moved, and the occurrence's resources. Its rule is kept: the days a BYDAY names stay
 * those days.
 */
export function shiftSeries(series: SchedulerEvent, occurrence: SchedulerEvent, to: Placement, timeZone: string): SchedulerEvent {
    const next: SchedulerEvent = {
        ...series,
        start: shifted(series.start, occurrence.start, to.start, timeZone),
        end: shifted(series.end, occurrence.end, to.end, timeZone),
    };
    if (to.resource === undefined) delete next.resource; else next.resource = to.resource;
    return next;
}
