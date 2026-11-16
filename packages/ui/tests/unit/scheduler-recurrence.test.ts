// pdx-scheduler's recurrences (#1020, part 8): our own expander of a subset of RFC 5545, measured
// against the examples of RFC 5545 §3.8.5.3, which are written in America/New_York from
// 1997-09-02 09:00. The occurrences come out in the form the event's start is written in.
import { describe, it, expect } from 'vitest';
import { expandSeries, parseRRule } from '../../src/scheduler/recurrence';
import { zonedInstant } from '../../src/scheduler/time';

const NY = 'America/New_York';
const ROME = 'Europe/Rome';
/** From the first day to the end of the last one, as instants in `tz`. */
const range = (from: string, to: string, tz = NY) => ({ from: zonedInstant(from, 0, tz), to: zonedInstant(to, 1440, tz) });
const at9 = (date: string) => ({ start: `${date}T09:00`, end: `${date}T10:00` });
const days = (list: { start: string }[]) => list.map((o) => o.start.slice(0, 10));

describe('parseRRule', () => {
    it('reads the subset, with or without the RRULE: prefix', () => {
        const { rule, unsupported } = parseRRule('RRULE:FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=MO,-1FR;UNTIL=19971224T000000Z');
        expect(unsupported).toEqual([]);
        expect(rule).toEqual(expect.objectContaining({ freq: 'WEEKLY', interval: 2, wkst: 0, until: '19971224T000000Z', byDay: [{ day: 1, n: null }, { day: 5, n: -1 }] }));
    });

    it('names the parts it does not support, and an unknown FREQ', () => {
        expect(parseRRule('FREQ=MONTHLY;BYDAY=MO,TU;BYSETPOS=-1').unsupported).toEqual(['BYSETPOS']);
        expect(parseRRule('FREQ=HOURLY').unsupported).toEqual(['FREQ=HOURLY']);
        expect(parseRRule('BYDAY=MO').rule).toBeNull();
    });
});

describe('expandSeries: RFC 5545 §3.8.5.3', () => {
    const whole = range('1997-09-01', '2001-12-31');

    it('daily for 10 occurrences', () => {
        expect(days(expandSeries({ ...at9('1997-09-02'), rrule: 'FREQ=DAILY;COUNT=10' }, whole, NY)))
            .toEqual(['02', '03', '04', '05', '06', '07', '08', '09', '10', '11'].map((d) => `1997-09-${d}`));
    });

    it('daily until December 24, 1997: UNTIL is inclusive, and in UTC', () => {
        const got = days(expandSeries({ ...at9('1997-09-02'), rrule: 'FREQ=DAILY;UNTIL=19971224T000000Z' }, whole, NY));
        expect(got).toHaveLength(113);
        expect(got.at(-1)).toBe('1997-12-23');
    });

    it('every 10 days, 5 occurrences', () => {
        expect(days(expandSeries({ ...at9('1997-09-02'), rrule: 'FREQ=DAILY;INTERVAL=10;COUNT=5' }, whole, NY)))
            .toEqual(['1997-09-02', '1997-09-12', '1997-09-22', '1997-10-02', '1997-10-12']);
    });

    it('every other week on Monday, Wednesday and Friday until December 24, 1997, weeks from Sunday; DTSTART is the first', () => {
        expect(days(expandSeries({ ...at9('1997-09-02'), rrule: 'FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=MO,WE,FR;UNTIL=19971224T000000Z' }, whole, NY))).toEqual([
            '1997-09-02', '1997-09-03', '1997-09-05', '1997-09-15', '1997-09-17', '1997-09-19', '1997-09-29',
            '1997-10-01', '1997-10-03', '1997-10-13', '1997-10-15', '1997-10-17', '1997-10-27', '1997-10-29', '1997-10-31',
            '1997-11-10', '1997-11-12', '1997-11-14', '1997-11-24', '1997-11-26', '1997-11-28',
            '1997-12-08', '1997-12-10', '1997-12-12', '1997-12-22',
        ]);
    });

    it('weekly on Tuesday and Thursday for five weeks', () => {
        expect(days(expandSeries({ ...at9('1997-09-02'), rrule: 'FREQ=WEEKLY;UNTIL=19971007T000000Z;WKST=SU;BYDAY=TU,TH' }, whole, NY))).toEqual([
            '1997-09-02', '1997-09-04', '1997-09-09', '1997-09-11', '1997-09-16', '1997-09-18', '1997-09-23', '1997-09-25', '1997-09-30', '1997-10-02',
        ]);
    });

    it('monthly on the first Friday for 10 occurrences', () => {
        expect(days(expandSeries({ ...at9('1997-09-05'), rrule: 'FREQ=MONTHLY;COUNT=10;BYDAY=1FR' }, whole, NY))).toEqual([
            '1997-09-05', '1997-10-03', '1997-11-07', '1997-12-05', '1998-01-02', '1998-02-06', '1998-03-06', '1998-04-03', '1998-05-01', '1998-06-05',
        ]);
    });

    it('every other month on the first and last Sunday, for 10 occurrences', () => {
        expect(days(expandSeries({ ...at9('1997-09-07'), rrule: 'FREQ=MONTHLY;INTERVAL=2;COUNT=10;BYDAY=1SU,-1SU' }, whole, NY))).toEqual([
            '1997-09-07', '1997-09-28', '1997-11-02', '1997-11-30', '1998-01-04', '1998-01-25', '1998-03-01', '1998-03-29', '1998-05-03', '1998-05-31',
        ]);
    });

    it('monthly on the third-to-last day of the month', () => {
        expect(days(expandSeries({ ...at9('1997-09-28'), rrule: 'FREQ=MONTHLY;BYMONTHDAY=-3' }, range('1997-09-01', '1998-02-28'), NY)))
            .toEqual(['1997-09-28', '1997-10-29', '1997-11-28', '1997-12-29', '1998-01-29', '1998-02-26']);
    });

    it('yearly in June and July for 10 occurrences', () => {
        expect(days(expandSeries({ ...at9('1997-06-10'), rrule: 'FREQ=YEARLY;COUNT=10;BYMONTH=6,7' }, range('1997-06-01', '2002-12-31'), NY))).toEqual([
            '1997-06-10', '1997-07-10', '1998-06-10', '1998-07-10', '1999-06-10', '1999-07-10', '2000-06-10', '2000-07-10', '2001-06-10', '2001-07-10',
        ]);
    });

    it('the 20th Monday of the year: an ordinal without BYMONTH counts in the year', () => {
        expect(days(expandSeries({ ...at9('1997-05-19'), rrule: 'FREQ=YEARLY;BYDAY=20MO' }, range('1997-01-01', '1999-12-31'), NY)))
            .toEqual(['1997-05-19', '1998-05-18', '1999-05-17']);
    });

    it('every Friday the 13th, without the DTSTART that EXDATE takes out', () => {
        expect(days(expandSeries({ ...at9('1997-09-02'), rrule: 'FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13', exdate: ['1997-09-02T09:00'] }, range('1997-09-01', '2000-12-31'), NY)))
            .toEqual(['1998-02-13', '1998-03-13', '1998-11-13', '1999-08-13', '2000-10-13']);
    });
});

describe('expandSeries: in the event\'s zone, in the period on screen', () => {
    it('9:00 stays 9:00 across the end of summer time: the instant moves an hour', () => {
        const got = expandSeries({ start: '1997-09-02T13:00:00Z', end: '1997-09-02T14:00:00Z', rrule: 'FREQ=WEEKLY;COUNT=10' }, range('1997-09-01', '1997-12-31'), NY);
        expect(got[0]).toEqual({ start: '1997-09-02T13:00:00Z', end: '1997-09-02T14:00:00Z' });
        expect(got.at(-1)).toEqual({ start: '1997-11-04T14:00:00Z', end: '1997-11-04T15:00:00Z' });
    });

    it('only the occurrences that meet the period, years after the start', () => {
        const got = expandSeries({ start: '2020-01-06T09:00', end: '2020-01-06T09:30', rrule: 'FREQ=DAILY' }, range('2026-09-21', '2026-09-27', ROME), ROME);
        expect(got).toHaveLength(7);
        expect(got[0]).toEqual({ start: '2026-09-21T09:00', end: '2026-09-21T09:30' });
    });

    it('an all-day series stays in dates, its length in days kept', () => {
        expect(expandSeries({ start: '2026-09-01', end: '2026-09-03', rrule: 'FREQ=WEEKLY;COUNT=3' }, range('2026-09-01', '2026-09-30', ROME), ROME))
            .toEqual([{ start: '2026-09-01', end: '2026-09-03' }, { start: '2026-09-08', end: '2026-09-10' }, { start: '2026-09-15', end: '2026-09-17' }]);
    });

    it('an occurrence that began before the period and runs into it is in it', () => {
        // The second starts on the 26th, after the period.
        const got = expandSeries({ start: '2026-09-19T22:00', end: '2026-09-21T02:00', rrule: 'FREQ=WEEKLY;COUNT=2' }, range('2026-09-21', '2026-09-25', ROME), ROME);
        expect(got.map((o) => o.start)).toEqual(['2026-09-19T22:00']);
    });

    it('a rule it does not support is not expanded: the event alone, as written', () => {
        expect(expandSeries({ ...at9('1997-09-01'), rrule: 'FREQ=MONTHLY;BYDAY=MO,TU;BYSETPOS=-1' }, range('1997-09-01', '1998-12-31'), NY))
            .toEqual([at9('1997-09-01')]);
    });

    it('a rule no date can meet ends, it does not loop', () => {
        expect(expandSeries({ ...at9('1997-02-28'), rrule: 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30' }, range('1997-01-01', '2100-12-31'), NY))
            .toEqual([at9('1997-02-28')]);
    });
});
