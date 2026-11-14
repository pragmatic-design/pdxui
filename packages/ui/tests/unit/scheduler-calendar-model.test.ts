// The calendar views' model (#1020, part 4): the month's weeks with their lanes and «+N», the year's
// months with the events on each day, and the agenda's days, all computed without the DOM.
import { describe, it, expect } from 'vitest';
import { buildMonthWeeks, buildYearMonths, buildAgendaDays } from '../../src/scheduler/calendar-model';
import { viewRange } from '../../src/scheduler/time';
import type { SchedulerEvent } from '../../src/scheduler/grid-model';

const ROME = 'Europe/Rome';
const ev = (id: string, start: string, end: string, extra: Partial<SchedulerEvent> = {}): SchedulerEvent => ({ id, title: id, start, end, ...extra });
// November 2026 from Monday: 26 October to 6 December, six weeks.
const november = viewRange('month', '2026-11-17', { firstDay: 1 }).days;

describe('buildMonthWeeks', () => {
    it('a week per row, from the first day of the week', () => {
        const weeks = buildMonthWeeks(november, 7, [], ROME, 3);
        expect(weeks.map((w) => w.key)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
        expect(weeks[0].days).toHaveLength(7);
    });

    it('a timed event of one day is a line at its hour; an all-day one, a bar', () => {
        const [week] = buildMonthWeeks(november, 7, [ev('call', '2026-11-17T10:30', '2026-11-17T11:00'), ev('off', '2026-11-17', '2026-11-18')], ROME, 3).filter((w) => w.key === '2026-11-16');
        expect(week.items).toEqual([
            expect.objectContaining({ id: 'off#2026-11-16#1', first: 1, span: 1, lane: 0, bar: true, minutes: null }),
            expect.objectContaining({ id: 'call#2026-11-16#1', first: 1, span: 1, lane: 1, bar: false, minutes: 630 }),
        ]);
    });

    it('lines of a day in the order of their hour, whatever the order of the events', () => {
        // The ids sort the other way round, so it is the hour that orders them, not the tie-break.
        const [week] = buildMonthWeeks(november, 7, [ev('dinner', '2026-11-18T16:00', '2026-11-18T17:00'), ev('standup', '2026-11-18T08:00', '2026-11-18T08:30')], ROME, 3).filter((w) => w.key === '2026-11-16');
        expect(week.items.map((i) => [i.event.id, i.lane])).toEqual([['standup', 0], ['dinner', 1]]);
    });

    it('an event over two weeks is a bar in each, cut at the week and marked', () => {
        const weeks = buildMonthWeeks(november, 7, [ev('trip', '2026-11-20', '2026-11-25')], ROME, 3);
        const pieces = weeks.flatMap((w) => w.items.map((i) => ({ week: w.key, first: i.first, span: i.span, before: i.before, after: i.after })));
        expect(pieces).toEqual([
            { week: '2026-11-16', first: 4, span: 3, before: false, after: true },
            { week: '2026-11-23', first: 0, span: 2, before: true, after: false },
        ]);
    });

    it('a timed event past midnight is a bar over both days', () => {
        const [week] = buildMonthWeeks(november, 7, [ev('night', '2026-11-17T22:00', '2026-11-18T02:00')], ROME, 3).filter((w) => w.key === '2026-11-16');
        expect(week.items).toEqual([expect.objectContaining({ first: 1, span: 2, bar: true, minutes: 1320 })]);
    });

    it('past the lanes, a day counts what it could not show: the «+N»', () => {
        const busy = ['a', 'b', 'c', 'd'].map((id, i) => ev(id, `2026-11-19T0${i + 1}:00`, `2026-11-19T0${i + 2}:00`));
        const [week] = buildMonthWeeks(november, 7, busy, ROME, 2).filter((w) => w.key === '2026-11-16');
        expect(week.items.map((i) => i.event.id)).toEqual(['a', 'b']);
        expect(week.more).toEqual([0, 0, 0, 2, 0, 0, 0]);
    });

    it('with weekends hidden, a week is five days and an event over a weekend is cut', () => {
        const workdays = viewRange('month', '2026-11-17', { firstDay: 1, hiddenDays: [0, 6] }).days;
        const weeks = buildMonthWeeks(workdays, 5, [ev('trip', '2026-11-20', '2026-11-24')], ROME, 3);
        expect(weeks[3].days).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
        expect(weeks.flatMap((w) => w.items.map((i) => [w.key, i.first, i.span]))).toEqual([['2026-11-16', 4, 1], ['2026-11-23', 0, 1]]);
    });
});

describe('buildYearMonths', () => {
    it('twelve months of whole weeks; days outside the month are marked', () => {
        const months = buildYearMonths('2026-01-01', 1, [], ROME);
        expect(months.map((m) => m.key)).toEqual(Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}-01`));
        // January 2026 starts on a Thursday: the week from Monday 29 December.
        expect(months[0].weeks[0].map((d) => [d.date, d.inMonth])[0]).toEqual(['2025-12-29', false]);
        expect(months[0].weeks[0][3]).toEqual({ date: '2026-01-01', count: 0, inMonth: true });
        expect(months.every((m) => m.weeks.every((w) => w.length === 7))).toBe(true);
    });

    it('each day counts the events on it, and only the year\'s days count', () => {
        const months = buildYearMonths('2026-01-01', 1, [ev('a', '2026-11-17T09:00', '2026-11-17T10:00'), ev('b', '2026-11-17', '2026-11-19'), ev('nye', '2025-12-31', '2026-01-02')], ROME);
        const day = (iso: string) => months.flatMap((m) => m.weeks.flat()).find((d) => d.date === iso && d.inMonth);
        expect(day('2026-11-17')?.count).toBe(2);
        expect(day('2026-11-18')?.count).toBe(1);
        expect(day('2026-01-01')?.count).toBe(1);
    });
});

describe('buildAgendaDays', () => {
    const week = viewRange('agenda', '2026-11-16', { firstDay: 1 }).days;

    it('only the days with events, all-day first, then by start', () => {
        const days = buildAgendaDays(week, [ev('late', '2026-11-17T15:00', '2026-11-17T16:00'), ev('early', '2026-11-17T09:00', '2026-11-17T10:00'), ev('off', '2026-11-17', '2026-11-18')], ROME);
        expect(days.map((d) => d.date)).toEqual(['2026-11-17']);
        expect(days[0].items.map((i) => [i.event.id, i.allDay, i.start, i.end])).toEqual([['off', true, 0, 1440], ['early', false, 540, 600], ['late', false, 900, 960]]);
    });

    it('an event over several days is on each, cut to it and marked', () => {
        const days = buildAgendaDays(week, [ev('night', '2026-11-17T22:00', '2026-11-18T02:00')], ROME);
        expect(days.map((d) => [d.date, d.items[0].start, d.items[0].end, d.items[0].before, d.items[0].after])).toEqual([
            ['2026-11-17', 1320, 1440, false, true],
            ['2026-11-18', 0, 120, true, false],
        ]);
    });

    it('an event that ends at midnight is not on the next day', () => {
        const days = buildAgendaDays(week, [ev('eve', '2026-11-17T20:00', '2026-11-18T00:00')], ROME);
        expect(days.map((d) => d.date)).toEqual(['2026-11-17']);
    });
});
