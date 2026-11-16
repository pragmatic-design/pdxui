// pdx-scheduler's series in the views (#1020, part 8b): a series is drawn as its occurrences in the
// period, each shaped like an override (`seriesId`, `recurrenceId`) under an id of its own; an
// override in `events` takes its occurrence's place; and a change to the whole series moves it by
// what one occurrence moved, in wall time.
import { describe, it, expect } from 'vitest';
import { expandEvents, occurrenceId, shiftSeries } from '../../src/scheduler/series';
import { zonedInstant } from '../../src/scheduler/time';
import type { SchedulerEvent } from '../../src/scheduler/grid-model';

const ROME = 'Europe/Rome';
const week = { from: zonedInstant('2026-09-21', 0, ROME), to: zonedInstant('2026-09-28', 0, ROME) };
const daily: SchedulerEvent = { id: 'daily', title: 'Daily', start: '2026-09-14T09:00', end: '2026-09-14T09:30', rrule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR', resource: 'a' };
const review: SchedulerEvent = { id: 'review', title: 'Review', start: '2026-09-22T10:00', end: '2026-09-22T12:00' };

describe('expandEvents', () => {
    it('draws a series as its occurrences in the period, each like an override, and other events as they are', () => {
        const got = expandEvents([daily, review], week, ROME);
        const occ = got.filter((e) => e.seriesId === 'daily');
        expect(occ.map((e) => e.start)).toEqual(['2026-09-21T09:00', '2026-09-22T09:00', '2026-09-23T09:00', '2026-09-24T09:00', '2026-09-25T09:00']);
        expect(occ[0]).toEqual({ id: occurrenceId('daily', '2026-09-21T09:00'), title: 'Daily', start: '2026-09-21T09:00', end: '2026-09-21T09:30', resource: 'a', seriesId: 'daily', recurrenceId: '2026-09-21T09:00' });
        expect(occ.every((e) => e.rrule === undefined && e.exdate === undefined)).toBe(true);
        expect(got).toContain(review);
    });

    it('leaves out the occurrences EXDATE names', () => {
        const got = expandEvents([{ ...daily, exdate: ['2026-09-23T09:00'] }], week, ROME);
        expect(got.map((e) => e.start)).not.toContain('2026-09-23T09:00');
        expect(got).toHaveLength(4);
    });

    it('an override takes its occurrence\'s place, wherever it was moved to', () => {
        const override: SchedulerEvent = { id: 'o1', title: 'Daily', start: '2026-09-30T11:00', end: '2026-09-30T11:30', seriesId: 'daily', recurrenceId: '2026-09-24T09:00' };
        const got = expandEvents([daily, override], week, ROME);
        expect(got.map((e) => e.start)).not.toContain('2026-09-24T09:00');
        // Moved out of the period, it is still in the list: the views place only what is in theirs.
        expect(got).toContain(override);
        expect(got.filter((e) => e.seriesId === 'daily')).toHaveLength(5);
    });

    it('an override of another series, or of no occurrence in the period, takes nothing', () => {
        const other: SchedulerEvent = { id: 'o2', title: 'X', start: '2026-09-24T11:00', end: '2026-09-24T11:30', seriesId: 'weekly', recurrenceId: '2026-09-24T09:00' };
        expect(expandEvents([daily, other], week, ROME).filter((e) => e.seriesId === 'daily')).toHaveLength(5);
    });
});

describe('shiftSeries', () => {
    it('moves the series by what its occurrence moved: half an hour later, a day later, another resource', () => {
        const occ = expandEvents([daily], week, ROME)[2];
        expect(shiftSeries(daily, occ, { start: '2026-09-24T09:30', end: '2026-09-24T10:00', resource: 'b' }, ROME))
            .toEqual({ ...daily, start: '2026-09-15T09:30', end: '2026-09-15T10:00', resource: 'b' });
    });

    it('a resize moves the end only, and keeps the wall time across summer time', () => {
        const spring: SchedulerEvent = { id: 's', title: 'S', start: '2026-03-02T09:00', end: '2026-03-02T09:30', rrule: 'FREQ=WEEKLY' };
        const occ = expandEvents([spring], { from: zonedInstant('2026-04-06', 0, ROME), to: zonedInstant('2026-04-07', 0, ROME) }, ROME)[0];
        expect(occ.start).toBe('2026-04-06T09:00');
        expect(shiftSeries(spring, occ, { start: '2026-04-06T09:00', end: '2026-04-06T10:30', resource: undefined }, ROME))
            .toEqual({ ...spring, end: '2026-03-02T10:30' });
    });

    it('an all-day series moves by days', () => {
        const trip: SchedulerEvent = { id: 't', title: 'T', start: '2026-09-07', end: '2026-09-08', rrule: 'FREQ=WEEKLY' };
        const occ = expandEvents([trip], week, ROME)[0];
        expect(shiftSeries(trip, occ, { start: '2026-09-23', end: '2026-09-24', resource: undefined }, ROME))
            .toEqual({ ...trip, start: '2026-09-09', end: '2026-09-10' });
    });
});
