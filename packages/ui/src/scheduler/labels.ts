// What pdx-scheduler says (#1020): the period on screen, a day's header, the hours of the time column
// and an event's time, through Intl in the scheduler's locale. Words that are not dates or times are
// the component's strings (`uiString('scheduler', …)`), not these.
//
// A date alone is formatted at noon UTC with `timeZone: 'UTC'`: the calendar date it names, whatever
// the zone of the machine. A time of day is formatted the same way, on a fixed date.

import { parseISO } from '@pdxui/core';
import type { SchedulerView } from './time';

/** One formatter per locale and shape: building one costs far more than using it (#894). */
const cache = new Map<string, Intl.DateTimeFormat>();

function fmt(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const key = locale + JSON.stringify(options);
    let f = cache.get(key);
    if (!f) {
        f = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
        cache.set(key, f);
    }
    return f;
}

function noon(date: string): Date {
    const d = parseISO(date);
    return new Date(Date.UTC(d.year, d.month - 1, d.day, 12));
}

function clock(minutes: number): Date {
    return new Date(Date.UTC(2000, 0, 1, 0, minutes % 1440));
}

const FULL: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
const RANGE: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
/** The locale's own short time: `hour: 'numeric'` writes 9:00 where en-GB writes 09:00. */
const TIME: Intl.DateTimeFormatOptions = { timeStyle: 'short' };

/** The period a view shows: a day's full date, or the first and last of its days as one range. */
export function periodLabel(view: SchedulerView, days: readonly string[], locale: string): string {
    if (days.length === 0) return '';
    if (view === 'day' || days.length === 1) return fmt(locale, FULL).format(noon(days[0]));
    return fmt(locale, RANGE).formatRange(noon(days[0]), noon(days[days.length - 1]));
}

/** A day's column header: short weekday and day of the month; the full date names it. */
export function dayHeader(date: string, locale: string): { weekday: string; day: string; full: string } {
    const d = noon(date);
    return {
        weekday: fmt(locale, { weekday: 'short' }).format(d),
        day: fmt(locale, { day: 'numeric' }).format(d),
        full: fmt(locale, FULL).format(d),
    };
}

/** Minutes since midnight as the locale writes a time. 1440, the end of the day, is midnight. */
export function clockLabel(minutes: number, locale: string): string {
    return fmt(locale, TIME).format(clock(minutes));
}

/** A span within a day, as a range of times. */
export function spanLabel(start: number, end: number, locale: string): string {
    return fmt(locale, TIME).formatRange(clock(start), clock(end === 1440 ? 1439 : end));
}
