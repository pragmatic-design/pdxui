// pdx-scheduler's recurrences (#1020, part 8), with no dependency: an expander of a subset of RFC 5545.
// FREQ (DAILY, WEEKLY, MONTHLY, YEARLY), INTERVAL, COUNT, UNTIL, BYDAY (with ordinals, `1MO`, `-1FR`),
// BYMONTHDAY, BYMONTH and WKST, and the event's EXDATE. Out of it: BYSETPOS, BYWEEKNO, BYYEARDAY,
// BYHOUR and smaller, RDATE; a rule that uses one is not expanded, and parseRRule names it.
//
// A series is expanded in its own wall time: the dates come from the rule, and each occurrence starts
// at the time of day the first one starts, in the zone. So summer time does not move a weekly 9:00;
// its instant moves an hour. Only the occurrences that meet the period asked for are returned, and
// they are written in the form the event's start and end are written in.

import { addDays } from '@pdxui/core';
import { eventInstant, zonedInstant, zonedParts } from './time';
import { formatLike } from './drag-model';

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

/** A rule as read: weekdays are 0 = Sunday … 6 = Saturday; an ordinal is null for every such day. */
export interface RRule {
    freq: Freq;
    interval: number;
    count: number | null;
    /** As written: `YYYYMMDD`, or with `THHMMSS`, local, or UTC with `Z`. */
    until: string | null;
    byDay: { day: number; n: number | null }[];
    byMonthDay: number[];
    byMonth: number[];
    wkst: number;
}

/** A recurring event, as far as its expansion goes. */
export interface Series { start: string; end: string; rrule: string; exdate?: readonly string[] }

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const FREQS: readonly string[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
/** The parts of RFC 5545 this expander does not do: a rule with one is not expanded. */
const UNSUPPORTED = new Set(['BYSETPOS', 'BYWEEKNO', 'BYYEARDAY', 'BYHOUR', 'BYMINUTE', 'BYSECOND']);
// Match: a weekday with an optional signed ordinal: `MO`, `1FR`, `-1SU`. Groups: [1]=ordinal [2]=weekday
const BYDAY = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/;
// Match: UNTIL as a date or a date-time, local or in UTC. Groups: [1]=y [2]=m [3]=d [4]=h [5]=min [6]=s [7]=Z
const UNTIL = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** Periods walked at most, whatever the rule: one no date can meet (February 30) ends here. */
const MAX_PERIODS = 100_000;

const pad = (n: number) => String(n).padStart(2, '0');
const key = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parts = (date: string) => date.split('-').map(Number) as [number, number, number];
const weekday = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dayNumber = (date: string) => { const [y, m, d] = parts(date); return Date.UTC(y, m - 1, d) / 86_400_000; };

/**
 * A rule's text, with or without `RRULE:`: the rule, or null when it is not one this expander can
 * read (no FREQ, a value it cannot parse); and the parts it does not support, by name.
 */
export function parseRRule(text: string): { rule: RRule | null; unsupported: string[] } {
    const unsupported: string[] = [];
    const rule: RRule = { freq: 'DAILY', interval: 1, count: null, until: null, byDay: [], byMonthDay: [], byMonth: [], wkst: 1 };
    let freq: string | null = null;
    let valid = true;
    const ints = (value: string, min: number, max: number) => value.split(',').map((v) => {
        const n = Number(v);
        if (!Number.isInteger(n) || n === 0 || Math.abs(n) > max || n < min) valid = false;
        return n;
    });
    for (const part of text.trim().replace(/^RRULE:/i, '').split(';').filter(Boolean)) {
        const [name, value = ''] = part.split('=');
        const k = name.toUpperCase();
        const v = value.toUpperCase();
        if (k === 'FREQ') {
            freq = v;
            if (!FREQS.includes(v)) unsupported.push(`FREQ=${v}`);
        } else if (k === 'INTERVAL') rule.interval = ints(v, 1, Number.MAX_SAFE_INTEGER)[0];
        else if (k === 'COUNT') rule.count = ints(v, 1, Number.MAX_SAFE_INTEGER)[0];
        else if (k === 'UNTIL') { if (UNTIL.test(v)) rule.until = v; else valid = false; }
        else if (k === 'BYDAY') {
            for (const d of v.split(',')) {
                const m = BYDAY.exec(d);
                const n = m?.[1] ? Number(m[1]) : null;
                if (!m || n === 0 || (n !== null && Math.abs(n) > 53)) { valid = false; continue; }
                rule.byDay.push({ day: WEEKDAYS.indexOf(m[2]), n });
            }
        } else if (k === 'BYMONTHDAY') rule.byMonthDay = ints(v, -31, 31);
        else if (k === 'BYMONTH') rule.byMonth = ints(v, 1, 12);
        else if (k === 'WKST') { const i = WEEKDAYS.indexOf(v); if (i >= 0) rule.wkst = i; else valid = false; }
        else if (UNSUPPORTED.has(k)) unsupported.push(k);
        else valid = false;
    }
    if (freq === null || !valid || !FREQS.includes(freq)) return { rule: null, unsupported };
    rule.freq = freq as Freq;
    return { rule, unsupported };
}

/** UNTIL as the last instant it lets an occurrence start at; a date alone lets its whole day. */
function untilInstant(until: string, timeZone: string): number {
    const m = UNTIL.exec(until)!;
    const date = `${m[1]}-${m[2]}-${m[3]}`;
    if (m[4] === undefined) return zonedInstant(date, 1440, timeZone) - 1;
    const [h, min, s] = [Number(m[4]), Number(m[5]), Number(m[6])];
    if (m[7]) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, min, s);
    return zonedInstant(date, h * 60 + min, timeZone) + s * 1000;
}

/** The days of month `m` of year `y` the rule names; the start's own day when it names none. */
function monthDays(y: number, m: number, rule: RRule, startDay: number): number[] {
    const last = daysIn(y, m);
    let days: number[] | null = null;
    if (rule.byMonthDay.length) days = rule.byMonthDay.map((n) => (n > 0 ? n : last + 1 + n)).filter((d) => d >= 1 && d <= last);
    if (rule.byDay.length) {
        const named: number[] = [];
        for (const { day, n } of rule.byDay) {
            const all: number[] = [];
            for (let d = 1; d <= last; d++) if (weekday(y, m, d) === day) all.push(d);
            if (n === null) named.push(...all);
            else { const d = n > 0 ? all[n - 1] : all[all.length + n]; if (d !== undefined) named.push(d); }
        }
        days = days ? days.filter((d) => named.includes(d)) : named;
    }
    if (!days) days = startDay <= last ? [startDay] : [];
    return [...new Set(days)].sort((a, b) => a - b);
}

/** The days of year `y` a BYDAY with no BYMONTH names, its ordinals counted in the year. */
function yearDays(y: number, rule: RRule): string[] {
    const out: string[] = [];
    for (const { day, n } of rule.byDay) {
        const all: string[] = [];
        for (let m = 1; m <= 12; m++) for (let d = 1; d <= daysIn(y, m); d++) if (weekday(y, m, d) === day) all.push(key(y, m, d));
        if (n === null) out.push(...all);
        else { const d = n > 0 ? all[n - 1] : all[all.length + n]; if (d !== undefined) out.push(d); }
    }
    return [...new Set(out)].sort();
}

/** Whether a date passes the parts that only filter at this frequency (BYMONTH, and for DAILY the day parts). */
function passes(date: string, rule: RRule): boolean {
    const [y, m, d] = parts(date);
    if (rule.byMonth.length && !rule.byMonth.includes(m)) return false;
    if (rule.freq !== 'DAILY') return true;
    const last = daysIn(y, m);
    if (rule.byMonthDay.length && !rule.byMonthDay.some((n) => (n > 0 ? n : last + 1 + n) === d)) return false;
    if (rule.byDay.length && !rule.byDay.some((b) => b.day === weekday(y, m, d))) return false;
    return true;
}

/** Period `k` of the rule from the start date: its first day, and the dates it holds, in order. */
function period(k: number, rule: RRule, start: string): { first: string; dates: string[] } {
    const [y0, m0, d0] = parts(start);
    const step = k * rule.interval;
    if (rule.freq === 'DAILY') {
        const date = addDays(start, step);
        return { first: date, dates: passes(date, rule) ? [date] : [] };
    }
    if (rule.freq === 'WEEKLY') {
        const week = addDays(start, -((weekday(y0, m0, d0) - rule.wkst + 7) % 7) + 7 * step);
        const named = rule.byDay.length ? rule.byDay.map((b) => b.day) : [weekday(y0, m0, d0)];
        const dates = [...new Set(named)].map((day) => addDays(week, (day - rule.wkst + 7) % 7)).sort().filter((d) => passes(d, rule));
        return { first: week, dates };
    }
    if (rule.freq === 'MONTHLY') {
        const months = (y0 * 12 + m0 - 1) + step;
        const y = Math.floor(months / 12);
        const m = (months % 12) + 1;
        const first = key(y, m, 1);
        if (rule.byMonth.length && !rule.byMonth.includes(m)) return { first, dates: [] };
        return { first, dates: monthDays(y, m, rule, d0).map((d) => key(y, m, d)) };
    }
    const y = y0 + step;
    const first = key(y, 1, 1);
    if (!rule.byMonth.length && !rule.byMonthDay.length && rule.byDay.length) return { first, dates: yearDays(y, rule) };
    const months = rule.byMonth.length ? [...rule.byMonth].sort((a, b) => a - b)
        : rule.byMonthDay.length ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [m0];
    return { first, dates: months.flatMap((m) => monthDays(y, m, rule, d0).map((d) => key(y, m, d))) };
}

/** The first period worth walking for a rule with no COUNT: the one just before `from`. */
function firstPeriod(rule: RRule, start: string, from: string): number {
    if (rule.count !== null || from <= start) return 0;
    const [y0, m0] = parts(start);
    const [y1, m1] = parts(from);
    const units = rule.freq === 'DAILY' ? dayNumber(from) - dayNumber(start)
        : rule.freq === 'WEEKLY' ? Math.floor((dayNumber(from) - dayNumber(start)) / 7)
        : rule.freq === 'MONTHLY' ? (y1 * 12 + m1) - (y0 * 12 + m0)
        : y1 - y0;
    return Math.max(0, Math.floor(units / rule.interval) - 1);
}

/**
 * The occurrences of series `s` that meet `range` (instants, `to` exclusive), in its wall time in
 * `timeZone`, written as its start and end are. The first is the event itself; EXDATE takes out the
 * occurrences it names; COUNT counts the ones taken out too, as RFC 5545 has it. A rule that is not
 * one, or uses a part this expander does not do, gives the event alone.
 */
export function expandSeries(s: Series, range: { from: number; to: number }, timeZone: string): { start: string; end: string }[] {
    const startMs = eventInstant(s.start, timeZone);
    const allDay = DATE_ONLY.test(s.start);
    const first = zonedParts(startMs, timeZone);
    const span = allDay ? dayNumber(s.end.slice(0, 10)) - dayNumber(s.start) : 0;
    const duration = eventInstant(s.end, timeZone) - startMs;
    const occurrence = (date: string) => {
        if (allDay) {
            const end = addDays(date, span);
            return { start: date, end, ms: zonedInstant(date, 0, timeZone), endMs: zonedInstant(end, 0, timeZone) };
        }
        const ms = zonedInstant(date, first.minutes, timeZone);
        return { start: formatLike(s.start, ms, timeZone), end: formatLike(s.end, ms + duration, timeZone), ms, endMs: ms + duration };
    };
    const out: { start: string; end: string }[] = [];
    const keep = (o: ReturnType<typeof occurrence>) => { if (o.ms < range.to && o.endMs > range.from) out.push({ start: o.start, end: o.end }); };
    const { rule, unsupported } = parseRRule(s.rrule);
    if (!rule || unsupported.length) { keep(occurrence(first.date)); return out; }

    const excluded = new Set((s.exdate ?? []).map((x) => eventInstant(x, timeZone)));
    const until = rule.until ? untilInstant(rule.until, timeZone) : Infinity;
    const last = Math.min(until, range.to - 1);
    let counted = 0;
    /** Take the occurrence on `date`; false once the series is over. */
    const take = (date: string): boolean => {
        const o = occurrence(date);
        if (o.ms > last) return false;
        counted++;
        if (rule.count !== null && counted > rule.count) return false;
        if (!excluded.has(o.ms)) keep(o);
        return true;
    };
    if (!take(first.date)) return out;
    const from = zonedParts(range.from, timeZone).date;
    for (let k = firstPeriod(rule, first.date, from), walked = 0; walked < MAX_PERIODS; k++, walked++) {
        const p = period(k, rule, first.date);
        if (zonedInstant(p.first, 0, timeZone) > last) break;
        for (const date of p.dates) {
            if (date <= first.date) continue;
            if (!take(date)) return out;
        }
    }
    return out;
}
