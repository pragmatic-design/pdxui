// pdx-scheduler's iCalendar, RFC 5545 (#1020, part 10a): `events` written as a file another calendar
// reads, and a file read back into `events`.
//
// The file carries the events as data, not the occurrences on screen: a series keeps its RRULE and
// EXDATE, an override is the series' UID with a RECURRENCE-ID, so a file the scheduler wrote comes back
// as it was (owner's decision, 2026-11-16). A start is written as it was: a date as VALUE=DATE, a wall
// time in the scheduler's zone with that zone's VTIMEZONE (ics-timezone.ts), an instant in UTC. What
// RFC 5545 has no property for — the resource, the colour, an override's own id — is an X-PDXUI-
// property, which other calendars keep and ignore.
//
// Reading is for what the scheduler draws: what it cannot (a rule outside its subset, no start, a zone
// nobody defines) is skipped, with the reason, never dropped in silence.

import { addDays } from '@pdxui/core';
import type { SchedulerEvent } from './grid-model';
import { eventInstant, zonedInstant } from './time';
import { parseRRule } from './recurrence';
import { vtimezone, fileZone, fileZoneInstant, wallOf, type FileZone } from './ics-timezone';

/** An event the file had that the scheduler cannot draw, and why. */
export interface IcsSkipped { uid: string; title: string; reason: string }

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Match: a wall time. Groups: [1]=y [2]=m [3]=d [4]=h [5]=min [6]=s
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const UTC_ZONES = new Set(['UTC', 'Etc/UTC', 'GMT', 'Etc/GMT']);

const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const basicInstant = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
const isoInstant = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * A line folded as RFC 5545 §3.1 asks: at most 75 octets, each fold a CRLF and a space, never inside a
 * character's bytes.
 */
function fold(line: string): string {
    const out: string[] = [];
    let current = '';
    let bytes = 0;
    for (const ch of line) {
        const size = new TextEncoder().encode(ch).length;
        if (bytes + size > (out.length ? 74 : 75)) { out.push(current); current = ''; bytes = 0; }
        current += ch;
        bytes += size;
    }
    out.push(current);
    return out.join('\r\n ');
}

/** A start, end or date of the list `name` as a property: its parameters and its value. */
function dateProp(value: string, zone: string): { params: string; value: string } {
    if (DATE.test(value)) return { params: ';VALUE=DATE', value: value.replace(/-/g, '') };
    const local = LOCAL.exec(value);
    if (local && !UTC_ZONES.has(zone)) {
        return { params: `;TZID=${zone}`, value: `${local[1]}${local[2]}${local[3]}T${local[4]}${local[5]}${local[6] ?? '00'}` };
    }
    return { params: '', value: basicInstant(eventInstant(value, zone)) };
}

/**
 * `events` as an iCalendar file, written in zone `timeZone` (the scheduler's): each event as written,
 * a series with its rule and exceptions, an override as its series' UID and the start it replaces.
 * `now` is the files's DTSTAMP.
 */
export function toIcs(events: readonly SchedulerEvent[], options: { timeZone: string; now?: Date }): string {
    const zone = options.timeZone;
    const stamp = basicInstant((options.now ?? new Date()).getTime());
    const walls = events.flatMap((e) => [e.start, e.end, ...(Array.isArray(e.exdate) ? e.exdate : []), ...(typeof e.recurrenceId === 'string' ? [e.recurrenceId] : [])])
        .filter((v) => LOCAL.test(v)).map((v) => Number(v.slice(0, 4)));
    const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//pdxui//pdx-scheduler//EN', 'CALSCALE:GREGORIAN'];
    if (walls.length && !UTC_ZONES.has(zone)) out.push(...vtimezone(zone, Math.min(...walls) - 1, Math.max(...walls)));
    for (const e of events) {
        const override = typeof e.seriesId === 'string' && typeof e.recurrenceId === 'string';
        const date = (name: string, v: string) => { const p = dateProp(v, zone); return `${name}${p.params}:${p.value}`; };
        out.push('BEGIN:VEVENT', `UID:${escapeText(override ? String(e.seriesId) : e.id)}`, `DTSTAMP:${stamp}`);
        if (override) out.push(date('RECURRENCE-ID', String(e.recurrenceId)), `X-PDXUI-ID:${escapeText(e.id)}`);
        out.push(date('DTSTART', e.start), date('DTEND', e.end), `SUMMARY:${escapeText(e.title)}`);
        if (typeof e.notes === 'string' && e.notes) out.push(`DESCRIPTION:${escapeText(e.notes)}`);
        if (typeof e.rrule === 'string' && e.rrule) out.push(`RRULE:${e.rrule.replace(/^RRULE:/i, '')}`);
        // One EXDATE per form of date (a reader joins them): a date, a wall time, an instant.
        const exdates = new Map<string, string[]>();
        for (const v of Array.isArray(e.exdate) ? e.exdate : []) {
            const p = dateProp(String(v), zone);
            exdates.set(p.params, [...(exdates.get(p.params) ?? []), p.value]);
        }
        for (const [params, values] of exdates) out.push(`EXDATE${params}:${values.join(',')}`);
        if (e.resource !== undefined) out.push(`X-PDXUI-RESOURCE:${(Array.isArray(e.resource) ? e.resource : [e.resource]).map((r) => escapeText(String(r))).join(',')}`);
        if (typeof e.color === 'string') out.push(`X-PDXUI-COLOR:${escapeText(e.color)}`);
        out.push('END:VEVENT');
    }
    out.push('END:VCALENDAR');
    return out.map(fold).join('\r\n') + '\r\n';
}

/** A TEXT value's parts: split on its unescaped commas when `list`, each unescaped. */
function textParts(value: string, list: boolean): string[] {
    const parts: string[] = [];
    let current = '';
    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (ch === '\\' && i + 1 < value.length) {
            const next = value[++i];
            current += next === 'n' || next === 'N' ? '\n' : next;
        } else if (ch === ',' && list) { parts.push(current); current = ''; }
        else current += ch;
    }
    parts.push(current);
    return parts;
}

/** A content line as its name, its parameters and its value; quotes keep `;` and `:` in a parameter. */
function contentLine(line: string): { name: string; params: Map<string, string>; value: string } | null {
    let quoted = false;
    const cuts: number[] = [];
    let colon = -1;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') quoted = !quoted;
        else if (!quoted && ch === ';') cuts.push(i);
        else if (!quoted && ch === ':') { colon = i; break; }
    }
    if (colon < 0) return null;
    const head = [0, ...cuts.map((c) => c + 1)].map((s, i) => line.slice(s, i < cuts.length ? cuts[i] : colon));
    const params = new Map<string, string>();
    for (const p of head.slice(1)) {
        const eq = p.indexOf('=');
        if (eq > 0) params.set(p.slice(0, eq).toUpperCase(), p.slice(eq + 1).replace(/^"(.*)"$/, '$1'));
    }
    return { name: head[0].toUpperCase(), params, value: line.slice(colon + 1) };
}

interface Component { name: string; props: Map<string, string[]>; params: Map<string, Map<string, string>[]>; children: Component[] }

/** A reason an event is skipped, carried out of the reading of one of its values. */
class Skip extends Error {}

/** The parts of an ISO 8601 duration as the days and the ms it adds, or null. */
function duration(text: string): { days: number; ms: number; sign: number } | null {
    // Match: P1W, P2D, PT1H30M, -P1DT2H. Groups: [1]=sign [2]=W [3]=D [4]=H [5]=M [6]=S
    const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(text.trim());
    if (!m) return null;
    return { sign: m[1] === '-' ? -1 : 1, days: Number(m[2] ?? 0) * 7 + Number(m[3] ?? 0), ms: ((Number(m[4] ?? 0) * 60 + Number(m[5] ?? 0)) * 60 + Number(m[6] ?? 0)) * 1000 };
}

/**
 * The iCalendar file `text` as scheduler events, read in zone `timeZone` (the scheduler's): a time in
 * that zone, or floating, is a wall time; a time in another zone, or UTC, is an instant. What the
 * scheduler cannot draw is in `skipped`.
 */
export function parseIcs(text: string, options: { timeZone: string }): { events: SchedulerEvent[]; skipped: IcsSkipped[] } {
    const zone = options.timeZone;
    // Unfold: a line break followed by a space or a tab continues the line (RFC 5545 §3.1).
    const lines = text.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    const root: Component = { name: '', props: new Map(), params: new Map(), children: [] };
    const stack = [root];
    for (const raw of lines) {
        const line = contentLine(raw);
        if (!line) continue;
        const top = stack[stack.length - 1];
        if (line.name === 'BEGIN') {
            const c: Component = { name: line.value.toUpperCase(), props: new Map(), params: new Map(), children: [] };
            top.children.push(c);
            stack.push(c);
        } else if (line.name === 'END') { if (stack.length > 1) stack.pop(); }
        else {
            top.props.set(line.name, [...(top.props.get(line.name) ?? []), line.value]);
            top.params.set(line.name, [...(top.params.get(line.name) ?? []), line.params]);
        }
    }
    const all = (c: Component): Component[] => [c, ...c.children.flatMap(all)];
    const components = all(root);
    const fileZones = new Map<string, FileZone>();
    for (const tz of components.filter((c) => c.name === 'VTIMEZONE')) {
        const read = fileZone(tz.children.filter((c) => c.name === 'STANDARD' || c.name === 'DAYLIGHT'));
        const id = tz.props.get('TZID')?.[0];
        if (id && read) fileZones.set(id, read);
    }

    /** One date value with its parameters, as the scheduler writes it. */
    const readDate = (value: string, params: Map<string, string> | undefined): string => {
        // Match: YYYYMMDD, or with THHMMSS, and Z. Groups: [1]=y [2]=m [3]=d [4]=h [5]=min [6]=s [7]=Z
        const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
        if (!m) throw new Skip(`cannot read the date "${value}"`);
        const date = `${m[1]}-${m[2]}-${m[3]}`;
        if (m[4] === undefined || params?.get('VALUE') === 'DATE') return date;
        const seconds = Number(m[6]);
        if (m[7]) return isoInstant(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), seconds));
        const tzid = params?.get('TZID');
        if (!tzid || tzid === zone) return `${date}T${m[4]}:${m[5]}${seconds ? `:${m[6]}` : ''}`;
        const own = fileZones.get(tzid);
        if (own) return isoInstant(fileZoneInstant(own, wallOf(`${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6]}`)!));
        if (!isIanaZone(tzid)) throw new Skip(`unknown time zone "${tzid}"`);
        return isoInstant(zonedInstant(date, Number(m[4]) * 60 + Number(m[5]), tzid) + seconds * 1000);
    };

    const events: SchedulerEvent[] = [];
    const skipped: IcsSkipped[] = [];
    components.filter((c) => c.name === 'VEVENT').forEach((c, index) => {
        const get = (name: string) => c.props.get(name)?.[0];
        const params = (name: string, i = 0) => c.params.get(name)?.[i];
        const uid = get('UID') ? textParts(get('UID')!, false)[0] : `ics-${index + 1}`;
        const title = textParts(get('SUMMARY') ?? '', false)[0];
        try {
            const dtstart = get('DTSTART');
            if (dtstart === undefined) throw new Skip('no DTSTART');
            const start = readDate(dtstart, params('DTSTART'));
            let end: string;
            const dtend = get('DTEND');
            const dur = get('DURATION');
            if (dtend !== undefined) end = readDate(dtend, params('DTEND'));
            else if (dur !== undefined) end = after(start, dur, zone);
            else end = DATE.test(start) ? addDays(start, 1) : start;
            const rrule = get('RRULE');
            if (rrule !== undefined) {
                const parsed = parseRRule(rrule);
                if (parsed.unsupported.length) throw new Skip(`RRULE: ${parsed.unsupported.join(', ')} ${parsed.unsupported.length > 1 ? 'are' : 'is'} not supported`);
                if (!parsed.rule) throw new Skip('RRULE: cannot be read');
            }
            const e: SchedulerEvent = { id: uid, title, start, end };
            const recurrence = get('RECURRENCE-ID');
            if (recurrence !== undefined) {
                e.seriesId = uid;
                e.recurrenceId = readDate(recurrence, params('RECURRENCE-ID'));
                e.id = get('X-PDXUI-ID') ? textParts(get('X-PDXUI-ID')!, false)[0] : `${uid}@${e.recurrenceId}`;
            }
            if (DATE.test(start)) e.allDay = true;
            if (rrule !== undefined) e.rrule = rrule.replace(/^RRULE:/i, '');
            const exdates = (c.props.get('EXDATE') ?? []).flatMap((v, i) => v.split(',').map((x) => readDate(x, params('EXDATE', i))));
            if (exdates.length) e.exdate = exdates;
            const notes = get('DESCRIPTION');
            if (notes) e.notes = textParts(notes, false)[0];
            const resource = get('X-PDXUI-RESOURCE');
            if (resource !== undefined) { const r = textParts(resource, true); e.resource = r.length === 1 ? r[0] : r; }
            const color = get('X-PDXUI-COLOR');
            if (color !== undefined) e.color = textParts(color, false)[0];
            events.push(e);
        } catch (err) {
            if (!(err instanceof Skip)) throw err;
            skipped.push({ uid, title, reason: err.message });
        }
    });
    return { events, skipped };
}

/** Whether Intl knows zone `id`. */
function isIanaZone(id: string): boolean {
    try {
        new Intl.DateTimeFormat('en', { timeZone: id });
        return true;
    } catch (err) {
        if (err instanceof RangeError) return false;
        throw err;
    }
}

/** `start` moved by the ISO 8601 duration `text`: a date by days, a wall time or an instant also by time. */
function after(start: string, text: string, zone: string): string {
    const d = duration(text);
    if (!d) throw new Skip(`cannot read the duration "${text}"`);
    if (DATE.test(start)) return addDays(start, d.sign * d.days);
    const local = LOCAL.exec(start);
    if (local) {
        const t = Date.UTC(Number(local[1]), Number(local[2]) - 1, Number(local[3]), Number(local[4]), Number(local[5]), Number(local[6] ?? 0))
            + d.sign * (d.days * 86_400_000 + d.ms);
        const w = new Date(t).toISOString();
        return `${w.slice(0, 10)}T${w.slice(11, 16)}${w.slice(17, 19) !== '00' ? `:${w.slice(17, 19)}` : ''}`;
    }
    return isoInstant(eventInstant(start, zone) + d.sign * (d.days * 86_400_000 + d.ms));
}
