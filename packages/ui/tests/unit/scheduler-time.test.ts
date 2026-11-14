// The time model of pdx-scheduler (#1020, part 1). Core's calendar engine works in ISO dates; a
// scheduler also places events at minutes of a day, in a time zone, and pages through periods.
//
// - viewRange: the dates a view shows for a reference date. `end` is exclusive.
// - stepPeriod: the reference date of the previous or next period.
// - parseClock / snap: 'HH:mm' as minutes since midnight, and minutes on a slot boundary.
// - zonedParts / zonedInstant / eventInstant: between an instant and a wall time in an IANA zone,
//   through Intl. A wall time a DST change skips moves forward by the gap, and one it repeats is the
//   earlier of the two, as Temporal's 'compatible' disambiguation does.
import { describe, it, expect } from 'vitest';
import { viewRange, stepPeriod, parseClock, snap, zonedParts, zonedInstant, eventInstant } from '../../src/scheduler/time';

const MON = 1;
const SUN = 0;

describe('viewRange', () => {
    it('day: the reference date alone', () => {
        expect(viewRange('day', '2026-11-18', { firstDay: MON })).toEqual({ start: '2026-11-18', end: '2026-11-19', days: ['2026-11-18'] });
    });

    it('week: seven days from the first day of the week the date is in', () => {
        const r = viewRange('week', '2026-11-18', { firstDay: MON });
        expect([r.start, r.end]).toEqual(['2026-11-16', '2026-11-23']);
        expect(r.days).toHaveLength(7);
        expect(viewRange('week', '2026-11-18', { firstDay: SUN }).start).toBe('2026-11-15');
    });

    it('hidden days: the range is the whole week, the days shown skip them', () => {
        // hiddenDays rather than "weekends": which days a working week leaves out differs by country.
        const r = viewRange('week', '2026-11-18', { firstDay: MON, hiddenDays: [0, 6] });
        expect([r.start, r.end]).toEqual(['2026-11-16', '2026-11-23']);
        expect(r.days).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
    });

    it('days: N days from the reference date, across a month end', () => {
        expect(viewRange('days', '2026-11-29', { firstDay: MON, days: 3 }).days).toEqual(['2026-11-29', '2026-11-30', '2026-12-01']);
    });

    it('month: the whole weeks that hold the month', () => {
        // November 2026 starts on a Sunday and ends on a Monday.
        const r = viewRange('month', '2026-11-18', { firstDay: MON });
        expect([r.start, r.end]).toEqual(['2026-10-26', '2026-12-07']);
        expect(r.days).toHaveLength(42);
        expect(viewRange('month', '2026-11-18', { firstDay: SUN }).start).toBe('2026-11-01');
    });

    it('year: January 1 to the next January 1', () => {
        const r = viewRange('year', '2026-11-18', { firstDay: MON });
        expect([r.start, r.end]).toEqual(['2026-01-01', '2027-01-01']);
        expect(r.days).toHaveLength(365);
    });

    it('agenda: agendaDays from the reference date, seven by default', () => {
        expect(viewRange('agenda', '2026-11-18', { firstDay: MON }).end).toBe('2026-11-25');
        expect(viewRange('agenda', '2026-11-18', { firstDay: MON, agendaDays: 30 }).end).toBe('2026-12-18');
    });

    it('timeline: the period its scale names', () => {
        expect(viewRange('timeline', '2026-11-18', { firstDay: MON, timelineScale: 'day' }).days).toEqual(['2026-11-18']);
        expect(viewRange('timeline', '2026-11-18', { firstDay: MON, timelineScale: 'week' }).start).toBe('2026-11-16');
        expect(viewRange('timeline', '2026-11-18', { firstDay: MON, timelineScale: 'month' })).toMatchObject({ start: '2026-11-01', end: '2026-12-01' });
        expect(viewRange('timeline', '2026-11-18', { firstDay: MON, timelineScale: 'year' }).days).toHaveLength(365);
    });
});

describe('stepPeriod', () => {
    it('moves by the length of the view', () => {
        expect(stepPeriod('day', '2026-11-18', 1, { firstDay: MON })).toBe('2026-11-19');
        expect(stepPeriod('week', '2026-11-18', -1, { firstDay: MON })).toBe('2026-11-11');
        expect(stepPeriod('days', '2026-11-18', 1, { firstDay: MON, days: 3 })).toBe('2026-11-21');
        expect(stepPeriod('agenda', '2026-11-18', 1, { firstDay: MON, agendaDays: 10 })).toBe('2026-11-28');
        expect(stepPeriod('year', '2026-11-18', 1, { firstDay: MON })).toBe('2027-11-18');
        expect(stepPeriod('timeline', '2026-11-18', 1, { firstDay: MON, timelineScale: 'week' })).toBe('2026-11-25');
    });

    it('a month from the 31st lands on the last day of a shorter month, not past it', () => {
        expect(stepPeriod('month', '2026-01-31', 1, { firstDay: MON })).toBe('2026-02-28');
    });
});

describe('parseClock', () => {
    it('reads HH:mm as minutes since midnight, 24:00 included', () => {
        expect(parseClock('00:00')).toBe(0);
        expect(parseClock('08:30')).toBe(510);
        expect(parseClock('24:00')).toBe(1440);
    });

    it('refuses what is not a time of day', () => {
        for (const bad of ['8:30', '24:01', '12:60', '', 'noon']) expect(() => parseClock(bad), bad).toThrow(/HH:mm/);
    });
});

describe('snap', () => {
    it('puts minutes on a slot boundary: floor by default, or round, or ceil', () => {
        expect(snap(37, 15)).toBe(30);
        expect(snap(37, 15, 'round')).toBe(30);
        expect(snap(38, 15, 'round')).toBe(45);
        expect(snap(31, 15, 'ceil')).toBe(45);
        expect(snap(45, 15, 'ceil')).toBe(45);
    });
});

describe('time zones', () => {
    const ROME = 'Europe/Rome';
    const NY = 'America/New_York';

    it('an instant as a wall time in a zone', () => {
        expect(zonedParts(Date.parse('2026-11-18T09:30:00Z'), ROME)).toEqual({ date: '2026-11-18', minutes: 10 * 60 + 30 });
        expect(zonedParts(Date.parse('2026-07-01T09:30:00Z'), ROME)).toEqual({ date: '2026-07-01', minutes: 11 * 60 + 30 });
        expect(zonedParts(Date.parse('2026-11-18T03:00:00Z'), NY)).toEqual({ date: '2026-11-17', minutes: 22 * 60 });
    });

    it('a wall time in a zone as an instant, in winter and in summer', () => {
        expect(zonedInstant('2026-11-18', 10 * 60 + 30, ROME)).toBe(Date.parse('2026-11-18T09:30:00Z'));
        expect(zonedInstant('2026-07-01', 11 * 60 + 30, ROME)).toBe(Date.parse('2026-07-01T09:30:00Z'));
    });

    it('a wall time the spring change skips moves forward by the gap', () => {
        // Rome, 2026-03-29: 02:00 becomes 03:00; 02:30 does not exist and is read as 03:30 (+02:00).
        expect(zonedInstant('2026-03-29', 2 * 60 + 30, ROME)).toBe(Date.parse('2026-03-29T01:30:00Z'));
    });

    it('a wall time the autumn change repeats is the earlier of the two', () => {
        // Rome, 2026-10-25: 03:00 becomes 02:00; 02:30 happens at +02:00, then at +01:00.
        expect(zonedInstant('2026-10-25', 2 * 60 + 30, ROME)).toBe(Date.parse('2026-10-25T00:30:00Z'));
    });

    it('midnight of the day after: 1440 minutes is the next date at 00:00', () => {
        expect(zonedInstant('2026-11-18', 1440, ROME)).toBe(zonedInstant('2026-11-19', 0, ROME));
    });

    it("an event's start: with an offset an instant, without one a wall time in the zone, a date alone its midnight", () => {
        expect(eventInstant('2026-11-18T09:30:00Z', ROME)).toBe(Date.parse('2026-11-18T09:30:00Z'));
        expect(eventInstant('2026-11-18T10:30:00+01:00', NY)).toBe(Date.parse('2026-11-18T09:30:00Z'));
        expect(eventInstant('2026-11-18T10:30', ROME)).toBe(Date.parse('2026-11-18T09:30:00Z'));
        expect(eventInstant('2026-11-18', ROME)).toBe(Date.parse('2026-11-17T23:00:00Z'));
    });

    it('refuses an unknown zone and a malformed date', () => {
        expect(() => zonedParts(0, 'Mars/Olympus')).toThrow(RangeError);
        expect(() => eventInstant('18/11/2026', ROME)).toThrow(/ISO 8601/);
    });
});
