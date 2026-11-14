// What pdx-scheduler says (#1020, part 3): the period on screen, a day's header, the hours of the time
// column and an event's time, through Intl in the scheduler's locale. A date alone is formatted as
// that calendar date, whatever the zone of the machine running it.
import { describe, it, expect } from 'vitest';
import { periodLabel, dayHeader, clockLabel, spanLabel, timelineHeader } from '../../src/scheduler/labels';

describe('periodLabel', () => {
    it('a day: its full date', () => {
        expect(periodLabel('day', ['2026-11-17'], 'en-US')).toBe('Tuesday, November 17, 2026');
    });

    it('several days: their first and last, as one range', () => {
        // ICU writes the range dash between thin spaces (U+2009).
        expect(periodLabel('week', ['2026-11-16', '2026-11-17', '2026-11-22'], 'en-US')).toBe('Nov 16 – 22, 2026');
        expect(periodLabel('days', ['2026-11-30', '2026-12-01'], 'en-US')).toBe('Nov 30 – Dec 1, 2026');
    });

    it('in the locale given', () => {
        expect(periodLabel('day', ['2026-11-17'], 'it-IT')).toBe('martedì 17 novembre 2026');
    });

    it('a month or a year: the reference date\'s, not the grid\'s first day in the month before', () => {
        expect(periodLabel('month', ['2026-10-26', '2026-12-06'], 'en-US', '2026-11-17')).toBe('November 2026');
        expect(periodLabel('year', ['2026-01-01', '2026-12-31'], 'en-US', '2026-11-17')).toBe('2026');
    });
});

describe('dayHeader', () => {
    it('the short weekday and the day of the month; the full date for its accessible name', () => {
        expect(dayHeader('2026-11-17', 'en-US')).toEqual({ weekday: 'Tue', day: '17', full: 'Tuesday, November 17, 2026' });
    });
});

describe('timelineHeader', () => {
    it('a slot: its time, named with its day', () => {
        expect(timelineHeader({ date: '2026-09-22', minutes: 9 * 60 }, 'day', 'en-GB')).toEqual({ text: '09:00', full: '09:00, Tuesday, 22 September 2026' });
    });
    it('a day: its weekday and number, named in full', () => {
        expect(timelineHeader({ date: '2026-09-22', minutes: null }, 'week', 'en-US')).toEqual({ text: 'Tue 22', full: 'Tuesday, September 22, 2026' });
    });
    it('a month of the year: its short name, named with the year', () => {
        expect(timelineHeader({ date: '2026-09-01', minutes: null }, 'year', 'en-US')).toEqual({ text: 'Sep', full: 'September 2026' });
    });
});

describe('clockLabel and spanLabel', () => {
    it('minutes since midnight as the locale writes a time', () => {
        expect(clockLabel(9 * 60, 'en-GB')).toBe('09:00');
        expect(clockLabel(13 * 60 + 30, 'en-US')).toBe('1:30 PM');
    });

    it('a span of a day as a range of times', () => {
        expect(spanLabel(9 * 60 + 15, 10 * 60 + 30, 'en-GB')).toBe('09:15–10:30');
    });

    it('the end of the day, 24:00, written as midnight', () => {
        expect(clockLabel(1440, 'en-GB')).toBe('00:00');
    });
});
