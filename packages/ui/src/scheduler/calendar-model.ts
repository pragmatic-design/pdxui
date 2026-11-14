// The calendar views' model (#1020): what pdx-scheduler draws in the month, year and agenda views,
// computed without the DOM, as grid-model.ts does for the time grid.
//
// Month: a row per week, a column per day shown. Every event is an item over the days it is on, stacked
// in lanes (`layoutRow`), at most `maxLanes` of them; what does not fit is a day's «+N». An all-day or
// multi-day event is a bar; a timed event within one day is a line of its own at its hour.
// Year: twelve months of whole weeks, each day with the number of events on it.
// Agenda: the days of the period that have events, each with its events in order, cut to that day.

import { addDays, addMonths, getWeekRange } from '@pdxui/core';
import { eventInstant, zonedInstant, zonedParts } from './time';
import { layoutRow } from './layout';
import { eventDates, isAllDay, type SchedulerEvent } from './grid-model';

// What the views draw, not what an app passes: `type` aliases, not interfaces (see grid-model.ts).

export type MonthItem = {
    id: string;
    event: SchedulerEvent;
    /** The first day of the week it covers, from 0, and how many adjacent days. */
    first: number;
    span: number;
    lane: number;
    /** It is drawn as a bar: all day, or on more than one day. Else a line at its hour. */
    bar: boolean;
    /** Its start in minutes of its day, for a timed event; null for an all-day one. */
    minutes: number | null;
    /** It started before this week, or goes on after it. */
    before: boolean;
    after: boolean;
};

export type MonthWeek = {
    /** The week's first date. */
    key: string;
    days: string[];
    items: MonthItem[];
    /** For each day, the events on it that did not fit in the lanes. */
    more: number[];
};

/** The month view: `days` (the range's, hidden days already out) cut into weeks of `perWeek`. */
export function buildMonthWeeks(days: readonly string[], perWeek: number, events: readonly SchedulerEvent[], timeZone: string, maxLanes: number): MonthWeek[] {
    const spans = events.map((event) => ({ event, ...eventDates(event, timeZone) }));
    const weeks: MonthWeek[] = [];
    for (let w = 0; w * perWeek < days.length; w++) {
        const week = days.slice(w * perWeek, (w + 1) * perWeek);
        const runs: Omit<MonthItem, 'lane'>[] = [];
        const interval = new Map<string, { start: number; end: number }>();
        for (const s of spans) {
            let run: Omit<MonthItem, 'lane'> | null = null;
            week.forEach((d, i) => {
                if (d < s.from || d >= s.to) { run = null; return; }
                if (run && run.first + run.span === i) { run.span++; run.after = addDays(d, 1) < s.to; return; }
                run = { id: `${s.event.id}#${week[0]}#${i}`, event: s.event, first: i, span: 1, bar: false, minutes: null, before: d > s.from, after: addDays(d, 1) < s.to };
                runs.push(run);
            });
        }
        for (const r of runs) {
            const allDay = isAllDay(r.event);
            r.bar = allDay || r.span > 1 || r.before || r.after;
            r.minutes = allDay ? null : zonedParts(eventInstant(r.event.start, timeZone), timeZone).minutes;
            // A bar from the start of its first day; a line inside its day, after the bars that start
            // there, in the order of its hour (a fraction of the day that never reaches the next one).
            interval.set(r.id, r.bar
                ? { start: r.first, end: r.first + r.span }
                : { start: r.first + ((r.minutes as number) + 1) / 1442, end: r.first + 1 });
        }
        const byId = new Map(runs.map((r) => [r.id, r]));
        const { placed, more } = layoutRow(runs.map((r) => ({ id: r.id, ...(interval.get(r.id) as { start: number; end: number }) })), week.length, maxLanes);
        weeks.push({
            key: week[0], days: week, more,
            items: placed.map((p) => ({ ...(byId.get(p.id) as Omit<MonthItem, 'lane'>), lane: p.lane })),
        });
    }
    return weeks;
}

export type YearDay = { date: string; count: number; inMonth: boolean };
export type YearMonth = { key: string; weeks: YearDay[][] };

/** The year view: each month of `year` (its 1 January) as whole weeks from `firstDay`, each day with its events. */
export function buildYearMonths(year: string, firstDay: number, events: readonly SchedulerEvent[], timeZone: string): YearMonth[] {
    const end = addMonths(year, 12);
    const counts = new Map<string, number>();
    for (const event of events) {
        const { from, to } = eventDates(event, timeZone);
        for (let d = from < year ? year : from; d < to && d < end; d = addDays(d, 1)) counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    const months: YearMonth[] = [];
    for (let m = 0; m < 12; m++) {
        const first = addMonths(year, m);
        const next = addMonths(first, 1);
        const weeks: YearDay[][] = [];
        for (let d = getWeekRange(first, firstDay).start; d < next; ) {
            const week: YearDay[] = [];
            for (let i = 0; i < 7; i++, d = addDays(d, 1)) week.push({ date: d, count: counts.get(d) ?? 0, inMonth: d >= first && d < next });
            weeks.push(week);
        }
        months.push({ key: first, weeks });
    }
    return months;
}

export type AgendaItem = {
    event: SchedulerEvent;
    allDay: boolean;
    /** Its minutes on this day, cut to it; 0 to 1440 for an all-day one. */
    start: number;
    end: number;
    /** It started on an earlier day, or goes on to a later one. */
    before: boolean;
    after: boolean;
};

export type AgendaDay = { date: string; items: AgendaItem[] };

/** The agenda: the `days` that have events, each with its events, all-day first, then by start. */
export function buildAgendaDays(days: readonly string[], events: readonly SchedulerEvent[], timeZone: string): AgendaDay[] {
    const out: AgendaDay[] = [];
    for (const date of days) {
        const dayStart = zonedInstant(date, 0, timeZone);
        const dayEnd = zonedInstant(addDays(date, 1), 0, timeZone);
        const items: AgendaItem[] = [];
        for (const event of events) {
            if (isAllDay(event)) {
                const { from, to } = eventDates(event, timeZone);
                if (date >= from && date < to) items.push({ event, allDay: true, start: 0, end: 1440, before: date > from, after: addDays(date, 1) < to });
                continue;
            }
            const s = eventInstant(event.start, timeZone);
            const e = eventInstant(event.end, timeZone);
            const on = s === e ? s >= dayStart && s < dayEnd : s < dayEnd && e > dayStart;
            if (!on) continue;
            items.push({
                event, allDay: false,
                start: s <= dayStart ? 0 : zonedParts(s, timeZone).minutes,
                end: e >= dayEnd ? 1440 : zonedParts(e, timeZone).minutes,
                before: s < dayStart, after: e > dayEnd,
            });
        }
        if (items.length === 0) continue;
        items.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start || b.end - a.end || (a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0));
        out.push({ date, items });
    }
    return out;
}
