// The VTIMEZONE of pdx-scheduler's iCalendar (#1020, part 10a), both ways.
//
// Writing: RFC 5545 §3.2.19 asks that every TZID an event names be defined by a VTIMEZONE in the same
// file. The zone's rules are not in the browser as data, only as offsets (Intl), so they are measured:
// the instants a year's offset changes, and, when the next year changes on the same weekday of the
// same month, the yearly rule (FREQ=YEARLY;BYMONTH=…;BYDAY=…) a reader applies to every year after.
//
// Reading: a file may name a zone that is not an IANA one (Outlook writes "W. Europe Standard Time"),
// which Intl does not know. Its own VTIMEZONE says what it means: the observance whose onset last
// came before a wall time gives its offset.

import { offsetAt } from './time';
import { parseRRule } from './recurrence';

const MIN = 60_000;
const DAY = 86_400_000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** An offset in ms as `±HHMM`. */
function formatOffset(ms: number): string {
    const m = Math.round(ms / MIN);
    return `${m < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(m) / 60))}${pad(Math.abs(m) % 60)}`;
}

/** `±HHMM` or `±HHMMSS` in ms, or null. */
function parseOffset(text: string): number | null {
    // Match: +0100, -0530, +013045. Groups: [1]=sign [2]=h [3]=min [4]=s
    const m = /^([+-])(\d{2})(\d{2})(\d{2})?$/.exec(text.trim());
    if (!m) return null;
    const v = (Number(m[2]) * 60 + Number(m[3])) * MIN + Number(m[4] ?? 0) * 1000;
    return m[1] === '-' ? -v : v;
}

/** Wall time `ms` (a UTC-based number of the wall's fields) as `YYYYMMDDTHHMMSS`. */
function basicWall(ms: number): string {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

/** The day of month of the `n`th (`-1` the last) weekday `w` of month `m` of year `y`. */
function nthWeekday(y: number, m: number, w: number, n: number): number {
    if (n < 0) {
        const last = daysIn(y, m);
        return last - ((new Date(Date.UTC(y, m - 1, last)).getUTCDay() - w + 7) % 7) + (n + 1) * 7;
    }
    return 1 + ((w - new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 7) % 7) + (n - 1) * 7;
}

interface Transition { at: number; from: number; to: number }

/** The instants of year `y` at which the zone's offset changes, found by the day and then to the minute. */
function transitions(zone: string, y: number): Transition[] {
    const out: Transition[] = [];
    const end = Date.UTC(y + 1, 0, 1);
    let prev = offsetAt(Date.UTC(y, 0, 1), zone);
    for (let t = Date.UTC(y, 0, 1); t < end; t += DAY) {
        const next = offsetAt(t + DAY, zone);
        if (next === prev) continue;
        let lo = t;
        let hi = t + DAY;
        while (hi - lo > MIN) {
            const mid = lo + Math.floor((hi - lo) / MIN / 2) * MIN;
            if (offsetAt(mid, zone) === prev) lo = mid; else hi = mid;
        }
        out.push({ at: hi, from: prev, to: next });
        prev = next;
    }
    return out;
}

/** A transition's yearly rule, as the weekday of its month it falls on, in the wall time before it. */
function ruleOf(t: Transition): { month: number; weekday: number; nth: number; clock: number } {
    const wall = new Date(t.at + t.from);
    const y = wall.getUTCFullYear();
    const month = wall.getUTCMonth() + 1;
    const day = wall.getUTCDate();
    return { month, weekday: wall.getUTCDay(), nth: day + 7 > daysIn(y, month) ? -1 : Math.ceil(day / 7), clock: t.at + t.from - Date.UTC(y, month - 1, day) };
}

/** Whether year `y` changes as `t`'s rule says: on that day, at that wall time, between the same offsets. */
function holdsIn(zone: string, t: Transition, y: number): boolean {
    const r = ruleOf(t);
    const onset = Date.UTC(y, r.month - 1, nthWeekday(y, r.month, r.weekday, r.nth)) + r.clock;
    return transitions(zone, y).some((x) => x.at + x.from === onset && x.from === t.from && x.to === t.to);
}

function observance(t: Transition, rule: string | null): string[] {
    return [`BEGIN:${t.to > t.from ? 'DAYLIGHT' : 'STANDARD'}`, `DTSTART:${basicWall(t.at + t.from)}`,
        `TZOFFSETFROM:${formatOffset(t.from)}`, `TZOFFSETTO:${formatOffset(t.to)}`,
        ...(rule ? [rule] : []), `END:${t.to > t.from ? 'DAYLIGHT' : 'STANDARD'}`];
}

/**
 * The VTIMEZONE of IANA zone `zone` for wall times from year `from` to year `to`: its yearly rules from
 * `from` when the year after keeps them, else each change of those years; one STANDARD for a zone
 * that does not change.
 */
export function vtimezone(zone: string, from: number, to: number): string[] {
    const first = transitions(zone, from);
    const body: string[] = [];
    if (first.length === 0) {
        const o = offsetAt(Date.UTC(from, 0, 1), zone);
        body.push('BEGIN:STANDARD', 'DTSTART:19700101T000000', `TZOFFSETFROM:${formatOffset(o)}`, `TZOFFSETTO:${formatOffset(o)}`, 'END:STANDARD');
    } else if (first.length === 2 && first.every((t) => holdsIn(zone, t, from + 1))) {
        for (const t of first) {
            const r = ruleOf(t);
            body.push(...observance(t, `RRULE:FREQ=YEARLY;BYMONTH=${r.month};BYDAY=${r.nth}${WEEKDAYS[r.weekday]}`));
        }
    } else {
        for (let y = from; y <= to; y++) for (const t of transitions(zone, y)) body.push(...observance(t, null));
    }
    return ['BEGIN:VTIMEZONE', `TZID:${zone}`, ...body, 'END:VTIMEZONE'];
}

/** One STANDARD or DAYLIGHT of a file's VTIMEZONE, its onsets as wall times (UTC-based numbers). */
interface Observance { start: number; from: number; to: number; rule: { month: number; weekday: number; nth: number } | null; rdates: number[] }
/** A file's zone: its observances. */
export type FileZone = Observance[];

/** A basic `YYYYMMDDTHHMMSS` as a UTC-based number of its fields, or null. */
export function wallOf(value: string): number | null {
    // Match: 20260921T090000. Groups: [1]=y [2]=m [3]=d [4]=h [5]=min [6]=s
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(value);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])) : null;
}

/**
 * A file's zone from the properties of its STANDARD and DAYLIGHT components; null when one cannot be
 * read (no onset, no offsets).
 */
export function fileZone(parts: { props: Map<string, string[]> }[]): FileZone | null {
    const out: FileZone = [];
    for (const p of parts) {
        const start = wallOf(p.props.get('DTSTART')?.[0] ?? '');
        const from = parseOffset(p.props.get('TZOFFSETFROM')?.[0] ?? '');
        const to = parseOffset(p.props.get('TZOFFSETTO')?.[0] ?? '');
        if (start === null || from === null || to === null) return null;
        const parsed = parseRRule(p.props.get('RRULE')?.[0] ?? '').rule;
        const by = parsed?.freq === 'YEARLY' && parsed.byMonth.length === 1 && parsed.byDay.length === 1 ? parsed : null;
        const rule = by ? { month: by.byMonth[0], weekday: by.byDay[0].day, nth: by.byDay[0].n ?? 1 } : null;
        const rdates = (p.props.get('RDATE') ?? []).flatMap((v) => v.split(',')).map(wallOf).filter((v): v is number => v !== null);
        out.push({ start, from, to, rule, rdates });
    }
    return out.length ? out : null;
}

/** The instant of wall time `wall` (a UTC-based number of its fields) in a file's zone. */
export function fileZoneInstant(zone: FileZone, wall: number): number {
    const y = new Date(wall).getUTCFullYear();
    let best: { onset: number; to: number } | null = null;
    for (const o of zone) {
        const clock = o.start - Date.UTC(new Date(o.start).getUTCFullYear(), new Date(o.start).getUTCMonth(), new Date(o.start).getUTCDate());
        const onsets = o.rule
            ? [y - 1, y].filter((yy) => yy >= new Date(o.start).getUTCFullYear())
                .map((yy) => Date.UTC(yy, o.rule!.month - 1, nthWeekday(yy, o.rule!.month, o.rule!.weekday, o.rule!.nth)) + clock)
            : [o.start, ...o.rdates];
        for (const onset of onsets) if (onset <= wall && (!best || onset > best.onset)) best = { onset, to: o.to };
    }
    const earliest = zone.reduce((a, b) => (b.start < a.start ? b : a));
    return wall - (best ? best.to : earliest.from);
}
