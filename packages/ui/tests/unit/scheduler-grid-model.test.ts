// The time grid's model (#1020, part 3): what pdx-scheduler draws in the day, week and N-days views,
// computed without the DOM. Columns are days, or days × resources; rows are slots of the visible hours.
// A timed event is placed in the cell of the slot it starts in, with its offset and length in slots,
// once per day and resource it covers, and side by side with the events it overlaps there. An all-day
// event is a bar in the all-day row, over the adjacent columns it covers, in a lane.
import { describe, it, expect } from 'vitest';
import { buildColumns, buildSlots, placeTimed, placeAllDay, isAllDay, isBusinessTime, buildHeaderRows, eventResources } from '../../src/scheduler/grid-model';

const ROME = 'Europe/Rome';
const days = ['2026-11-16', '2026-11-17', '2026-11-18'];
const rooms = [{ id: 'a', label: 'Room A' }, { id: 'b', label: 'Room B' }];

describe('buildColumns', () => {
    it('without resources: one column per day', () => {
        expect(buildColumns(days, [], 'resource').map((c) => c.key)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18']);
    });

    it('grouped by resource: each resource\'s days together; by date: each day\'s resources together', () => {
        expect(buildColumns(days.slice(0, 2), rooms, 'resource').map((c) => c.key)).toEqual(['a|2026-11-16', 'a|2026-11-17', 'b|2026-11-16', 'b|2026-11-17']);
        expect(buildColumns(days.slice(0, 2), rooms, 'date').map((c) => c.key)).toEqual(['a|2026-11-16', 'b|2026-11-16', 'a|2026-11-17', 'b|2026-11-17']);
    });

    it('a resource with children is drawn as its leaves', () => {
        const tree = [{ id: 'floor', label: 'Floor 1', children: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }] }];
        expect(buildColumns(['2026-11-16'], tree, 'resource').map((c) => c.resource?.id)).toEqual(['x', 'y']);
    });
});

describe('buildSlots', () => {
    it('the start minute of each slot between the visible hours', () => {
        expect(buildSlots(8 * 60, 10 * 60, 30)).toEqual([480, 510, 540, 570]);
    });

    it('a last slot cut by the end of the visible hours is kept, shorter', () => {
        expect(buildSlots(0, 50, 30)).toEqual([0, 30]);
    });
});

describe('isAllDay', () => {
    it('allDay set, or a start that is a date alone', () => {
        expect(isAllDay({ id: '1', title: '', start: '2026-11-16T09:00', end: '2026-11-16T10:00', allDay: true })).toBe(true);
        expect(isAllDay({ id: '1', title: '', start: '2026-11-16', end: '2026-11-17' })).toBe(true);
        expect(isAllDay({ id: '1', title: '', start: '2026-11-16T09:00', end: '2026-11-16T10:00' })).toBe(false);
    });
});

describe('placeTimed', () => {
    const opts = { timeZone: ROME, startMinutes: 8 * 60, endMinutes: 18 * 60, slotMinutes: 30 };
    const cols = buildColumns(days, [], 'resource');

    it('in the slot it starts in, with its offset and its length in slots', () => {
        const placed = placeTimed([{ id: 'm', title: 'Meet', start: '2026-11-17T09:15', end: '2026-11-17T10:30' }], cols, opts);
        expect(placed.get('2026-11-17')).toEqual([
            expect.objectContaining({ id: 'm', slot: 2, offset: 0.5, length: 2.5, column: 0, columns: 1, span: 1, before: false, after: false }),
        ]);
        expect(placed.get('2026-11-16')).toEqual([]);
    });

    it('an instant with an offset is placed by its wall time in the zone', () => {
        const placed = placeTimed([{ id: 'z', title: '', start: '2026-11-17T08:00:00Z', end: '2026-11-17T09:00:00Z' }], cols, opts);
        // 08:00Z is 09:00 in Rome: slot 2 from 08:00.
        expect(placed.get('2026-11-17')?.[0]).toMatchObject({ slot: 2, offset: 0, length: 2 });
    });

    it('across midnight: a piece on each day, marked as continuing', () => {
        const night = { ...opts, startMinutes: 0, endMinutes: 1440 };
        const placed = placeTimed([{ id: 'n', title: '', start: '2026-11-16T22:00', end: '2026-11-17T02:00' }], cols, night);
        expect(placed.get('2026-11-16')?.[0]).toMatchObject({ slot: 44, length: 4, before: false, after: true });
        expect(placed.get('2026-11-17')?.[0]).toMatchObject({ slot: 0, length: 4, before: true, after: false });
    });

    it('clipped to the visible hours, and gone when it is entirely outside them', () => {
        const placed = placeTimed([
            { id: 'early', title: '', start: '2026-11-17T07:00', end: '2026-11-17T09:00' },
            { id: 'night', title: '', start: '2026-11-17T20:00', end: '2026-11-17T21:00' },
        ], cols, opts);
        expect(placed.get('2026-11-17')?.map((p) => p.id)).toEqual(['early']);
        expect(placed.get('2026-11-17')?.[0]).toMatchObject({ slot: 0, offset: 0, length: 2, before: true });
    });

    it('overlapping events share the column', () => {
        const placed = placeTimed([
            { id: 'a', title: '', start: '2026-11-17T09:00', end: '2026-11-17T11:00' },
            { id: 'b', title: '', start: '2026-11-17T10:00', end: '2026-11-17T12:00' },
        ], cols, opts);
        expect(placed.get('2026-11-17')?.map((p) => [p.id, p.column, p.columns])).toEqual([['a', 0, 2], ['b', 1, 2]]);
    });

    it('in each column of the resources it names; nowhere when the grid has resources and it names none', () => {
        const byRoom = buildColumns(['2026-11-17'], rooms, 'resource');
        const placed = placeTimed([
            { id: 'both', title: '', start: '2026-11-17T09:00', end: '2026-11-17T10:00', resource: ['a', 'b'] },
            { id: 'b-only', title: '', start: '2026-11-17T09:00', end: '2026-11-17T10:00', resource: 'b' },
            { id: 'nobody', title: '', start: '2026-11-17T09:00', end: '2026-11-17T10:00' },
        ], byRoom, opts);
        expect(placed.get('a|2026-11-17')?.map((p) => p.id)).toEqual(['both']);
        // Same start and length: placed in id order.
        expect(placed.get('b|2026-11-17')?.map((p) => p.id)).toEqual(['b-only', 'both']);
    });

    it('all-day events are not placed in the time grid', () => {
        const placed = placeTimed([{ id: 'd', title: '', start: '2026-11-17', end: '2026-11-18' }], cols, opts);
        expect(placed.get('2026-11-17')).toEqual([]);
    });
});

describe('placeAllDay', () => {
    const cols = buildColumns(days, [], 'resource');

    it('a bar over the days it covers, end exclusive, in a lane', () => {
        const { bars, lanes } = placeAllDay([
            { id: 'trip', title: '', start: '2026-11-16', end: '2026-11-18' },
            { id: 'mid', title: '', start: '2026-11-17', end: '2026-11-18', allDay: true },
        ], cols, ROME);
        expect(bars).toEqual([
            expect.objectContaining({ id: 'trip', first: 0, span: 2, lane: 0, before: false, after: false }),
            expect.objectContaining({ id: 'mid', first: 1, span: 1, lane: 1 }),
        ]);
        expect(lanes).toBe(2);
    });

    it('cut at the edges of the range, and marked as continuing', () => {
        const { bars } = placeAllDay([{ id: 'long', title: '', start: '2026-11-10', end: '2026-11-30' }], cols, ROME);
        expect(bars).toEqual([expect.objectContaining({ first: 0, span: 3, before: true, after: true })]);
    });

    it('grouped by date, a resource\'s days are not adjacent: one bar per day', () => {
        const byDate = buildColumns(days.slice(0, 2), rooms, 'date');
        const { bars } = placeAllDay([{ id: 'x', title: '', start: '2026-11-16', end: '2026-11-18', resource: 'a' }], byDate, ROME);
        expect(bars.map((b) => [b.first, b.span])).toEqual([[0, 1], [2, 1]]);
    });
});

describe('isBusinessTime', () => {
    const hours = { 1: { start: '09:00', end: '18:00' }, 6: null };

    it('inside the hours of its weekday', () => {
        expect(isBusinessTime('2026-11-16', 9 * 60, hours)).toBe(true); // a Monday
        expect(isBusinessTime('2026-11-16', 18 * 60, hours)).toBe(false);
        expect(isBusinessTime('2026-11-16', 8 * 60 + 30, hours)).toBe(false);
    });

    it('a day set to null, or absent, has no business hours', () => {
        expect(isBusinessTime('2026-11-21', 10 * 60, hours)).toBe(false); // a Saturday
        expect(isBusinessTime('2026-11-17', 10 * 60, hours)).toBe(false); // a Tuesday, absent
    });
});

describe('buildHeaderRows', () => {
    const o = { today: '2026-11-17', dayLabel: (d: string) => ({ text: d.slice(8), full: d }), corners: { time: 'Time', resource: 'Resource' } };
    const two = days.slice(0, 2);

    it('without resources: one row of days, today marked', () => {
        const rows = buildHeaderRows(buildColumns(two, [], 'resource'), two, [], 'resource', o);
        expect(rows.map((r) => [r.corner, r.cells.map((c) => [c.text, c.span, c.today])])).toEqual([['Time', [['16', 1, false], ['17', 1, true]]]]);
    });

    it('by resource: each resource over its days; by date: each day over its resources', () => {
        const byResource = buildHeaderRows(buildColumns(two, rooms, 'resource'), two, rooms, 'resource', o);
        expect(byResource.map((r) => r.cells.map((c) => [c.text, c.span]))).toEqual([[['Room A', 2], ['Room B', 2]], [['16', 1], ['17', 1], ['16', 1], ['17', 1]]]);
        const byDate = buildHeaderRows(buildColumns(two, rooms, 'date'), two, rooms, 'date', o);
        expect(byDate.map((r) => [r.corner, r.cells.map((c) => [c.text, c.span])])).toEqual([
            ['Time', [['16', 2], ['17', 2]]],
            ['Resource', [['Room A', 1], ['Room B', 1], ['Room A', 1], ['Room B', 1]]],
        ]);
    });
});

describe('eventResources', () => {
    it('the leaves an event names, in the order of the resources', () => {
        expect(eventResources({ id: 'e', title: '', start: '2026-11-17', end: '2026-11-18', resource: ['b', 'a'] }, rooms).map((r) => r.id)).toEqual(['a', 'b']);
        expect(eventResources({ id: 'e', title: '', start: '2026-11-17', end: '2026-11-18' }, rooms)).toEqual([]);
    });
});
