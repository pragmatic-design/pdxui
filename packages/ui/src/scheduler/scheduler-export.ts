// pdx-scheduler's CSV and Excel export (#1020, part 10b): the occurrences of the period on screen, one
// row each, as the reader sees them — the owner's decision (2026-11-16), as data-grid exports the rows
// its filter leaves. iCalendar carries `events` as data instead (ics.ts).
//
// A time is written in the scheduler's zone, `YYYY-MM-DD HH:mm`, which a spreadsheet and a person both
// read; an all-day event is its days, `YYYY-MM-DD` (which Excel takes as a date), ending on its last
// day, as the editor shows it. A resource column is there when the scheduler has resources.

import { addDays, type CsvColumn } from '@pdxui/core';
import { isAllDay, type SchedulerEvent, type SchedulerResource } from './grid-model';
import { resourceLabels } from './event-style';
import { eventInstant, zonedParts } from './time';

/** The formats the bar's «Export» menu can offer. */
export type ExportFormat = 'csv' | 'xlsx' | 'ics';

const pad = (n: number) => String(n).padStart(2, '0');

/** An event's start or end as the file shows it: a date, or a date and a time in `zone`. */
function when(value: string, zone: string): string {
    const p = zonedParts(eventInstant(value, zone), zone);
    return `${p.date} ${pad(Math.floor(p.minutes / 60))}:${pad(p.minutes % 60)}`;
}

/**
 * The events that overlap `range` (instants, `to` exclusive) as rows and the columns that read them,
 * under the headers `headers` names: sorted by start, an all-day event as its first and last day.
 * `events` are a period's as the views draw them, a series already as its occurrences.
 */
export function exportTable(
    events: readonly SchedulerEvent[], range: { from: number; to: number }, resources: readonly SchedulerResource[], zone: string,
    headers: { title: string; start: string; end: string; resource: string; notes: string },
): { rows: Record<string, string>[]; columns: CsvColumn[] } {
    const sorted = events
        .filter((e) => eventInstant(e.end, zone) > range.from && eventInstant(e.start, zone) < range.to)
        .sort((a, b) => eventInstant(a.start, zone) - eventInstant(b.start, zone));
    const rows = sorted.map((e) => {
        const whole = isAllDay(e);
        const firstDay = zonedParts(eventInstant(e.start, zone), zone).date;
        const lastDay = addDays(zonedParts(eventInstant(e.end, zone), zone).date, -1);
        return {
            title: e.title,
            start: whole ? firstDay : when(e.start, zone),
            end: whole ? (lastDay < firstDay ? firstDay : lastDay) : when(e.end, zone),
            resource: resourceLabels(e, resources),
            notes: typeof e.notes === 'string' ? e.notes : '',
        };
    });
    const columns: CsvColumn[] = [
        { field: 'title', header: headers.title },
        { field: 'start', header: headers.start },
        { field: 'end', header: headers.end },
        ...(resources.length ? [{ field: 'resource', header: headers.resource }] : []),
        { field: 'notes', header: headers.notes },
    ];
    return { rows, columns };
}

/** The file name of an export of the period from `start` to the day before `end`: `scheduler-<first>_<last>.<ext>`. */
export function exportName(range: { start: string; end: string }, ext: string): string {
    return `scheduler-${range.start}_${addDays(range.end, -1)}.${ext}`;
}
