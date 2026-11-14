// The timeline's model (#1020, part 5): a row per resource with the hierarchy collapsible, the scale's
// columns along the period, and each event as an interval along them, stacked in its row's lanes.
import { describe, it, expect } from 'vitest';
import { timelineRows, timelineColumns, axisPosition, placeTimeline, itemsInColumn } from '../../src/scheduler/timeline-model';
import { viewRange, zonedInstant } from '../../src/scheduler/time';
import type { SchedulerEvent, SchedulerResource } from '../../src/scheduler/grid-model';

const ROME = 'Europe/Rome';
const ev = (id: string, start: string, end: string, extra: Partial<SchedulerEvent> = {}): SchedulerEvent => ({ id, title: id, start, end, ...extra });
const HOURS = { timeZone: ROME, startMinutes: 8 * 60, endMinutes: 12 * 60, slotMinutes: 60 };
const week = viewRange('timeline', '2026-09-22', { firstDay: 1, timelineScale: 'week' }).days;
const resources: SchedulerResource[] = [
    { id: 'north', label: 'North', children: [{ id: 'a', label: 'Room A' }, { id: 'b', label: 'Room B' }] },
    { id: 'van', label: 'Van' },
];

describe('timelineRows', () => {
    it('every resource in order, children under their parent, with their level and place among siblings', () => {
        const rows = timelineRows(resources, new Set());
        expect(rows.map((r) => [r.key, r.level, r.parent, r.expanded, r.posinset, r.setsize])).toEqual([
            ['north', 1, true, true, 1, 2],
            ['a', 2, false, false, 1, 2],
            ['b', 2, false, false, 2, 2],
            ['van', 1, false, false, 2, 2],
        ]);
    });

    it('a collapsed parent hides its children', () => {
        const rows = timelineRows(resources, new Set(['north']));
        expect(rows.map((r) => [r.key, r.expanded])).toEqual([['north', false], ['van', false]]);
    });

    it('no resources: one row for every event', () => {
        expect(timelineRows([], new Set())).toEqual([expect.objectContaining({ key: '', resource: null, level: 1 })]);
    });
});

describe('timelineColumns', () => {
    it('a day: the slots of the visible hours', () => {
        const cols = timelineColumns('day', ['2026-09-22'], HOURS);
        expect(cols.map((c) => c.minutes)).toEqual([480, 540, 600, 660]);
        expect(cols[0].start).toBe(Date.parse('2026-09-22T08:00:00+02:00'));
        expect(cols[3].end).toBe(Date.parse('2026-09-22T12:00:00+02:00'));
    });

    it('a week: a column per day shown, midnight to midnight in the zone', () => {
        const cols = timelineColumns('week', week, HOURS);
        expect(cols.map((c) => c.date)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']);
        expect(cols[0].end - cols[0].start).toBe(864e5);
    });

    it('a day that changes the clock is as long as it is: 25 hours on 25 October in Rome', () => {
        const [col] = timelineColumns('week', ['2026-10-25'], HOURS);
        expect(col.end - col.start).toBe(25 * 36e5);
    });

    it('a year: a column per month', () => {
        const year = viewRange('timeline', '2026-09-22', { firstDay: 1, timelineScale: 'year' }).days;
        const cols = timelineColumns('year', year, HOURS);
        expect(cols.map((c) => c.date)).toHaveLength(12);
        expect(cols[1]).toEqual(expect.objectContaining({ date: '2026-02-01', start: zonedInstant('2026-02-01', 0, ROME), end: zonedInstant('2026-03-01', 0, ROME) }));
    });
});

describe('axisPosition', () => {
    const cols = timelineColumns('day', ['2026-09-22'], HOURS);
    it('inside a column: its index and the fraction through it', () => {
        expect(axisPosition(cols, Date.parse('2026-09-22T09:30:00+02:00'))).toBe(1.5);
    });
    it('before the first column, 0; after the last, the count', () => {
        expect(axisPosition(cols, Date.parse('2026-09-22T06:00:00+02:00'))).toBe(0);
        expect(axisPosition(cols, Date.parse('2026-09-22T20:00:00+02:00'))).toBe(4);
    });
    it('in a gap between columns, the next column\'s start', () => {
        const workWeek = timelineColumns('week', ['2026-09-25', '2026-09-28'], HOURS);
        expect(axisPosition(workWeek, Date.parse('2026-09-26T12:00:00+02:00'))).toBe(1);
    });
});

describe('placeTimeline', () => {
    const cols = timelineColumns('week', week, HOURS);
    const rows = timelineRows(resources, new Set());

    it('an event in the rows of the resources it names, along the days it covers', () => {
        const placed = placeTimeline([ev('audit', '2026-09-22T12:00', '2026-09-23T12:00', { resource: ['a', 'van'] })], rows, cols, ROME);
        const at = (key: string) => placed.find((r) => r.key === key)?.items ?? [];
        expect(at('a')).toEqual([expect.objectContaining({ id: 'audit', start: 1.5, end: 2.5, lane: 0, before: false, after: false })]);
        expect(at('van')).toHaveLength(1);
        expect(at('b')).toEqual([]);
        expect(at('north')).toEqual([]);
    });

    it('overlapping events stack in lanes, and the row is as tall as its lanes', () => {
        const placed = placeTimeline([
            ev('one', '2026-09-21', '2026-09-24', { resource: 'van' }),
            ev('two', '2026-09-22', '2026-09-23', { resource: 'van' }),
            ev('three', '2026-09-25', '2026-09-26', { resource: 'van' }),
        ], rows, cols, ROME);
        const van = placed.find((r) => r.key === 'van');
        expect(van?.items.map((i) => [i.id, i.lane])).toEqual([['one', 0], ['two', 1], ['three', 0]]);
        expect(van?.lanes).toBe(2);
        expect(placed.find((r) => r.key === 'a')?.lanes).toBe(1);
    });

    it('an event that runs past the period is cut to it and marked', () => {
        const [row] = placeTimeline([ev('trip', '2026-09-18', '2026-09-23')], timelineRows([], new Set()), cols, ROME);
        expect(row.items).toEqual([expect.objectContaining({ start: 0, end: 2, before: true, after: false })]);
    });

    it('an event wholly outside the columns is left out', () => {
        const day = timelineColumns('day', ['2026-09-22'], HOURS);
        const [row] = placeTimeline([ev('late', '2026-09-22T18:00', '2026-09-22T19:00')], timelineRows([], new Set()), day, ROME);
        expect(row.items).toEqual([]);
    });
});

describe('itemsInColumn', () => {
    const cols = timelineColumns('week', week, HOURS);
    const [row] = placeTimeline([ev('long', '2026-09-21', '2026-09-26'), ev('short', '2026-09-23', '2026-09-24')], timelineRows([], new Set()), cols, ROME);
    it('a column draws the events that start in it', () => {
        expect(itemsInColumn(row, 2, 0).map((i) => i.id)).toEqual(['short']);
        expect(itemsInColumn(row, 0, 0).map((i) => i.id)).toEqual(['long']);
    });
    it('the window\'s first column also draws those that started before it and go on into it', () => {
        expect(itemsInColumn(row, 3, 3).map((i) => i.id)).toEqual(['long']);
        expect(itemsInColumn(row, 3, 0).map((i) => i.id)).toEqual([]);
    });
});
