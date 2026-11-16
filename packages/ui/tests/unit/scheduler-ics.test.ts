// pdx-scheduler's iCalendar (#1020, part 10a): `toIcs` writes `events` as data — a series with its
// RRULE and EXDATE, an override with the series' UID and a RECURRENCE-ID — and `parseIcs` reads them
// back, so a file the scheduler wrote comes back as it was. A wall time is written in its zone, with
// the VTIMEZONE RFC 5545 asks for; a file's own VTIMEZONE reads a zone that is not an IANA one. What
// the scheduler cannot draw is skipped, with the reason.

import { describe, it, expect } from 'vitest';
import { toIcs, parseIcs } from '../../src/scheduler/ics';
import type { SchedulerEvent } from '../../src/scheduler/grid-model';

const ROME = 'Europe/Rome';
const NOW = new Date('2026-11-16T12:00:00Z');
const lines = (ics: string) => ics.split('\r\n');
/** The content lines with their folds joined back, as a reader sees them. */
const unfolded = (ics: string) => lines(ics.replace(/\r\n[ \t]/g, ''));
const vevents = (ics: string) => ics.split('BEGIN:VEVENT').slice(1).map((b) => unfolded(b.split('END:VEVENT')[0]).filter(Boolean));

describe('toIcs', () => {
    it('is a VCALENDAR of version 2.0, with CRLF line ends and a stamp on each event', () => {
        const ics = toIcs([{ id: 'a', title: 'Call', start: '2026-09-21T09:00', end: '2026-09-21T09:30' }], { timeZone: ROME, now: NOW });
        expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:')).toBe(true);
        expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
        expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
        expect(vevents(ics)[0]).toEqual(expect.arrayContaining(['UID:a', 'DTSTAMP:20261116T120000Z', 'SUMMARY:Call']));
    });

    it('writes a wall time in its zone, and the VTIMEZONE of that zone with its yearly rules', () => {
        const ics = toIcs([{ id: 'a', title: 'Call', start: '2026-09-21T09:00', end: '2026-09-21T09:30' }], { timeZone: ROME, now: NOW });
        expect(vevents(ics)[0]).toEqual(expect.arrayContaining([
            'DTSTART;TZID=Europe/Rome:20260921T090000', 'DTEND;TZID=Europe/Rome:20260921T093000']));
        const tz = unfolded(ics.split('BEGIN:VTIMEZONE')[1].split('END:VTIMEZONE')[0]);
        expect(tz).toContain('TZID:Europe/Rome');
        const daylight = tz.join('\n').split('BEGIN:DAYLIGHT')[1].split('END:DAYLIGHT')[0];
        const standard = tz.join('\n').split('BEGIN:STANDARD')[1].split('END:STANDARD')[0];
        expect(daylight).toContain('TZOFFSETFROM:+0100');
        expect(daylight).toContain('TZOFFSETTO:+0200');
        expect(daylight).toContain('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU');
        // The rules start the year before the first wall time, so that January is after an onset.
        expect(daylight).toContain('DTSTART:20250330T020000');
        expect(standard).toContain('TZOFFSETTO:+0100');
        expect(standard).toContain('RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU');
        expect(standard).toContain('DTSTART:20251026T030000');
    });

    it('a zone with no daylight time has one STANDARD and no rule', () => {
        const ics = toIcs([{ id: 'a', title: 'Call', start: '2026-09-21T09:00', end: '2026-09-21T09:30' }], { timeZone: 'Asia/Tokyo', now: NOW });
        const tz = ics.split('BEGIN:VTIMEZONE')[1].split('END:VTIMEZONE')[0];
        expect(tz).not.toContain('DAYLIGHT');
        expect(tz).toContain('TZOFFSETFROM:+0900');
        expect(tz).toContain('TZOFFSETTO:+0900');
        expect(tz).not.toContain('RRULE');
    });

    it('a date is VALUE=DATE, an instant is UTC, and neither needs a VTIMEZONE', () => {
        const ics = toIcs([
            { id: 'off', title: 'Offsite', start: '2026-09-23', end: '2026-09-25', allDay: true },
            { id: 'web', title: 'Webinar', start: '2026-09-21T09:00:00+02:00', end: '2026-09-21T10:00:00+02:00' },
        ], { timeZone: ROME, now: NOW });
        const [off, web] = vevents(ics);
        expect(off).toEqual(expect.arrayContaining(['DTSTART;VALUE=DATE:20260923', 'DTEND;VALUE=DATE:20260925']));
        expect(web).toEqual(expect.arrayContaining(['DTSTART:20260921T070000Z', 'DTEND:20260921T080000Z']));
        expect(ics).not.toContain('VTIMEZONE');
    });

    it('a series carries its RRULE and EXDATE; an override, the series\' UID, its RECURRENCE-ID and its own id', () => {
        const ics = toIcs([
            { id: 'daily', title: 'Daily', start: '2026-09-14T09:00', end: '2026-09-14T09:15', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', exdate: ['2026-09-23T09:00', '2026-09-24T09:00'] },
            { id: 'moved', title: 'Daily, later', start: '2026-09-22T10:00', end: '2026-09-22T10:15', seriesId: 'daily', recurrenceId: '2026-09-22T09:00' },
        ], { timeZone: ROME, now: NOW });
        const [series, override] = vevents(ics);
        expect(series).toEqual(expect.arrayContaining([
            'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'EXDATE;TZID=Europe/Rome:20260923T090000,20260924T090000']));
        expect(override).toEqual(expect.arrayContaining([
            'UID:daily', 'RECURRENCE-ID;TZID=Europe/Rome:20260922T090000', 'X-PDXUI-ID:moved']));
    });

    it('escapes text and folds a long line at 75 octets, never inside a character', () => {
        const title = `Review, Q3; plan ${'è'.repeat(60)}`;
        const ics = toIcs([{ id: 'a', title, start: '2026-09-21', end: '2026-09-22', notes: 'first\nsecond \\ third' }], { timeZone: ROME, now: NOW });
        for (const line of lines(ics)) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
        const event = vevents(ics)[0];
        expect(event).toContain(`SUMMARY:Review\\, Q3\\; plan ${'è'.repeat(60)}`);
        expect(event).toContain('DESCRIPTION:first\\nsecond \\\\ third');
    });

    it('a resource and a colour are kept as X- properties', () => {
        const ics = toIcs([{ id: 'a', title: 'Call', start: '2026-09-21', end: '2026-09-22', resource: ['ana', 'room,1'], color: '#c00' }], { timeZone: ROME, now: NOW });
        expect(vevents(ics)[0]).toEqual(expect.arrayContaining(['X-PDXUI-RESOURCE:ana,room\\,1', 'X-PDXUI-COLOR:#c00']));
    });
});

describe('parseIcs', () => {
    it('reads back what toIcs wrote, as it was', () => {
        const events: SchedulerEvent[] = [
            { id: 'call', title: 'Call, Q3', start: '2026-09-21T09:00', end: '2026-09-21T09:30', resource: 'ana', notes: 'line one\nline two' },
            { id: 'off', title: 'Offsite', start: '2026-09-23', end: '2026-09-25', allDay: true, color: '#c00' },
            { id: 'web', title: 'Webinar', start: '2026-09-21T07:00:00Z', end: '2026-09-21T08:00:00Z', resource: ['ana', 'room,1'] },
            { id: 'daily', title: 'Daily', start: '2026-09-14T09:00', end: '2026-09-14T09:15', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', exdate: ['2026-09-23T09:00'] },
            { id: 'moved', title: 'Daily, later', start: '2026-09-22T10:00', end: '2026-09-22T10:15', seriesId: 'daily', recurrenceId: '2026-09-22T09:00' },
        ];
        const back = parseIcs(toIcs(events, { timeZone: ROME, now: NOW }), { timeZone: ROME });
        expect(back.skipped).toEqual([]);
        expect(back.events).toEqual(events);
    });

    const calendar = (...body: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...body, 'END:VCALENDAR', ''].join('\r\n');

    it('a time in another IANA zone is the instant; a floating time is a wall time here; UTC is the instant', () => {
        const { events } = parseIcs(calendar(
            'BEGIN:VEVENT', 'UID:ny', 'SUMMARY:NY', 'DTSTART;TZID=America/New_York:20260921T090000', 'DTEND;TZID=America/New_York:20260921T100000', 'END:VEVENT',
            'BEGIN:VEVENT', 'UID:fl', 'SUMMARY:Floating', 'DTSTART:20260921T090000', 'DTEND:20260921T100000', 'END:VEVENT',
            'BEGIN:VEVENT', 'UID:utc', 'SUMMARY:UTC', 'DTSTART:20260921T090000Z', 'DTEND:20260921T100000Z', 'END:VEVENT',
        ), { timeZone: ROME });
        expect(events.map((e) => [e.id, e.start, e.end])).toEqual([
            ['ny', '2026-09-21T13:00:00Z', '2026-09-21T14:00:00Z'],
            ['fl', '2026-09-21T09:00', '2026-09-21T10:00'],
            ['utc', '2026-09-21T09:00:00Z', '2026-09-21T10:00:00Z'],
        ]);
    });

    it('a DURATION gives the end; a date with no end lasts its day; a time with no end, none', () => {
        const { events } = parseIcs(calendar(
            'BEGIN:VEVENT', 'UID:d', 'SUMMARY:D', 'DTSTART:20260921T090000', 'DURATION:PT1H30M', 'END:VEVENT',
            'BEGIN:VEVENT', 'UID:w', 'SUMMARY:W', 'DTSTART;VALUE=DATE:20260921', 'DURATION:P1W', 'END:VEVENT',
            'BEGIN:VEVENT', 'UID:a', 'SUMMARY:A', 'DTSTART;VALUE=DATE:20260921', 'END:VEVENT',
            'BEGIN:VEVENT', 'UID:t', 'SUMMARY:T', 'DTSTART:20260921T090000', 'END:VEVENT',
        ), { timeZone: ROME });
        expect(events.map((e) => [e.id, e.start, e.end])).toEqual([
            ['d', '2026-09-21T09:00', '2026-09-21T10:30'],
            ['w', '2026-09-21', '2026-09-28'],
            ['a', '2026-09-21', '2026-09-22'],
            ['t', '2026-09-21T09:00', '2026-09-21T09:00'],
        ]);
    });

    it('unfolds lines, unescapes text, and reads only the event\'s own properties (not an alarm\'s)', () => {
        const { events } = parseIcs(calendar(
            'BEGIN:VEVENT', 'UID:x', 'SUMMARY:Long title that the writer', ' folded\\, twice', 'DESCRIPTION:a\\nb\\;c\\\\d',
            'DTSTART;VALUE=DATE:20260921',
            'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'TRIGGER:-PT15M', 'END:VALARM',
            'END:VEVENT',
        ).replace(/\r\n/g, '\n'), { timeZone: ROME });
        expect(events[0]).toEqual(expect.objectContaining({ title: 'Long title that the writerfolded, twice', notes: 'a\nb;c\\d' }));
    });

    it('what the scheduler cannot draw is skipped, with the reason', () => {
        const { events, skipped } = parseIcs(calendar(
            'BEGIN:VEVENT', 'UID:pos', 'SUMMARY:Last workday', 'DTSTART:20260930T090000', 'RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1', 'END:VEVENT',
            'BEGIN:VEVENT', 'UID:nostart', 'SUMMARY:No start', 'END:VEVENT',
            'BEGIN:VEVENT', 'UID:zone', 'SUMMARY:Unknown zone', 'DTSTART;TZID=Mars/Olympus:20260921T090000', 'END:VEVENT',
            'BEGIN:VEVENT', 'UID:ok', 'SUMMARY:Fine', 'DTSTART;VALUE=DATE:20260921', 'END:VEVENT',
        ), { timeZone: ROME });
        expect(events.map((e) => e.id)).toEqual(['ok']);
        expect(skipped).toEqual([
            { uid: 'pos', title: 'Last workday', reason: 'RRULE: BYSETPOS is not supported' },
            { uid: 'nostart', title: 'No start', reason: 'no DTSTART' },
            { uid: 'zone', title: 'Unknown zone', reason: 'unknown time zone "Mars/Olympus"' },
        ]);
    });

    it('a zone that is not an IANA one is read from the file\'s own VTIMEZONE, in summer and in winter', () => {
        const tz = 'W. Europe Standard Time';
        const { events, skipped } = parseIcs(calendar(
            'BEGIN:VTIMEZONE', `TZID:${tz}`,
            'BEGIN:STANDARD', 'DTSTART:16010101T030000', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10', 'END:STANDARD',
            'BEGIN:DAYLIGHT', 'DTSTART:16010101T020000', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3', 'END:DAYLIGHT',
            'END:VTIMEZONE',
            'BEGIN:VEVENT', 'UID:summer', 'SUMMARY:S', `DTSTART;TZID="${tz}":20260921T090000`, `DTEND;TZID="${tz}":20260921T100000`, 'END:VEVENT',
            'BEGIN:VEVENT', 'UID:winter', 'SUMMARY:W', `DTSTART;TZID="${tz}":20260112T090000`, `DTEND;TZID="${tz}":20260112T100000`, 'END:VEVENT',
        ), { timeZone: ROME });
        expect(skipped).toEqual([]);
        expect(events.map((e) => [e.id, e.start])).toEqual([['summer', '2026-09-21T07:00:00Z'], ['winter', '2026-01-12T08:00:00Z']]);
    });
});
