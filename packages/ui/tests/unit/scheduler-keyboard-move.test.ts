// The keyboard way to move and resize an event (#1020, part 7): which gesture an arrow makes, the cell
// an event's edge is in, and where one step takes it, in each view's own axis.
import { describe, it, expect } from 'vitest';
import { keyGesture, keyStep, type KeyStep } from '../../src/scheduler/keyboard-move';
import { cellOfPoint, pointOfCell, type PointModel } from '../../src/scheduler/drop-point';
import { buildColumns, buildSlots, type SchedulerEvent } from '../../src/scheduler/grid-model';
import { buildMonthWeeks } from '../../src/scheduler/calendar-model';
import { placeTimeline, timelineColumns, timelineRows } from '../../src/scheduler/timeline-model';

const ROME = 'Europe/Rome';
const HALF = 30 * 60_000;
const ev = (id: string, start: string, end: string, extra: Partial<SchedulerEvent> = {}): SchedulerEvent => ({ id, title: id, start, end, ...extra });
const days = (from: number, n: number) => Array.from({ length: n }, (_, i) => `2026-09-${String(from + i).padStart(2, '0')}`);
const key = (k: string, mods: Partial<{ shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) =>
    ({ key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...mods });
const opts = (gesture: KeyStep['gesture'], k: KeyStep['key'], resource: string | null = null): KeyStep =>
    ({ gesture, key: k, resource, cell: { row: 0, col: 0 }, step: HALF, timeZone: ROME });

// A week from Monday 21 September, 08:00–18:00 in half hours: row 1 is 08:00, row 3 09:00.
const week: PointModel = { view: 'time', columns: buildColumns(days(21, 7), [], 'resource'), slots: buildSlots(480, 1080, 30), timeZone: ROME };
const weekSize = { rows: 21, cols: 7 };

describe('keyGesture', () => {
    it('an arrow moves, Shift+arrow moves the end, Alt+Shift+arrow the start; Ctrl, Alt alone and other keys do nothing', () => {
        expect(keyGesture(key('ArrowDown'))).toEqual({ gesture: 'move', key: 'ArrowDown' });
        expect(keyGesture(key('ArrowDown', { shiftKey: true }))).toEqual({ gesture: 'end', key: 'ArrowDown' });
        expect(keyGesture(key('ArrowUp', { shiftKey: true, altKey: true }))).toEqual({ gesture: 'start', key: 'ArrowUp' });
        expect(keyGesture(key('ArrowDown', { ctrlKey: true }))).toBeNull();
        expect(keyGesture(key('ArrowDown', { altKey: true }))).toBeNull();
        expect(keyGesture(key('Home'))).toBeNull();
    });
});

describe('cellOfPoint, the inverse of pointOfCell', () => {
    it('in the time grid, a slot and the all-day row; null before the first visible hour', () => {
        expect(cellOfPoint(week, pointOfCell(week, 3, 2)!)).toEqual({ row: 3, col: 2 });
        expect(cellOfPoint(week, pointOfCell(week, 0, 4)!)).toEqual({ row: 0, col: 4 });
        expect(cellOfPoint(week, { ...pointOfCell(week, 1, 0)!, at: pointOfCell(week, 1, 0)!.at - HALF })).toBeNull();
    });
});

describe('keyStep in the time grid', () => {
    const standup = ev('standup', '2026-09-21T09:00', '2026-09-21T09:30');

    it('Down moves a slot later, Right a day later, keeping the duration', () => {
        expect(keyStep(week, weekSize, standup, opts('move', 'ArrowDown'))).toEqual({ placement: { start: '2026-09-21T09:30', end: '2026-09-21T10:00', resource: undefined }, cell: { row: 4, col: 0 } });
        expect(keyStep(week, weekSize, standup, opts('move', 'ArrowRight'))?.placement).toEqual({ start: '2026-09-22T09:00', end: '2026-09-22T09:30', resource: undefined });
    });

    it('a timed event does not go up into the all-day row, nor past the grid\'s edges', () => {
        const early = ev('early', '2026-09-21T08:00', '2026-09-21T08:30');
        expect(keyStep(week, weekSize, early, opts('move', 'ArrowUp'))).toBeNull();
        expect(keyStep(week, weekSize, early, opts('move', 'ArrowLeft'))).toBeNull();
    });

    it('Shift+Down moves the end a slot later, Alt+Shift+Up the start a slot earlier; a resize does not go sideways', () => {
        const review = ev('review', '2026-09-22T10:00', '2026-09-22T12:00');
        expect(keyStep(week, weekSize, review, opts('end', 'ArrowDown'))?.placement).toEqual({ start: '2026-09-22T10:00', end: '2026-09-22T12:30', resource: undefined });
        expect(keyStep(week, weekSize, review, opts('end', 'ArrowUp'))?.placement.end).toBe('2026-09-22T11:30');
        expect(keyStep(week, weekSize, review, opts('start', 'ArrowUp'))?.placement).toEqual({ start: '2026-09-22T09:30', end: '2026-09-22T12:00', resource: undefined });
        expect(keyStep(week, weekSize, review, opts('end', 'ArrowRight'))).toBeNull();
    });

    it('the end never comes before one slot after the start', () => {
        expect(keyStep(week, weekSize, standup, opts('end', 'ArrowUp'))?.placement.end ?? '2026-09-21T09:30').toBe('2026-09-21T09:30');
    });

    it('an all-day event moves along the all-day row, and resizes by a day', () => {
        const trip = ev('trip', '2026-09-23', '2026-09-24');
        expect(keyStep(week, weekSize, trip, opts('move', 'ArrowRight'))).toEqual({ placement: { start: '2026-09-24', end: '2026-09-25', resource: undefined }, cell: { row: 0, col: 3 } });
        expect(keyStep(week, weekSize, trip, opts('move', 'ArrowDown'))).toBeNull();
        expect(keyStep(week, weekSize, trip, opts('end', 'ArrowRight'))?.placement).toEqual({ start: '2026-09-23', end: '2026-09-25', resource: undefined });
    });

    it('with resources side by side, Right takes an event to the next resource\'s column', () => {
        const rooms = [{ id: 'a', label: 'Room A' }, { id: 'b', label: 'Room B' }];
        const byDate: PointModel = { view: 'time', columns: buildColumns(days(21, 2), rooms, 'date'), slots: buildSlots(480, 1080, 30), timeZone: ROME };
        const call = ev('call', '2026-09-21T10:00', '2026-09-21T11:00', { resource: 'a' });
        expect(keyStep(byDate, { rows: 21, cols: 4 }, call, opts('move', 'ArrowRight', 'a'))?.placement).toEqual({ start: '2026-09-21T10:00', end: '2026-09-21T11:00', resource: 'b' });
    });
});

describe('keyStep in the month', () => {
    // September 2026 from Monday 31 August: Tuesday 22 is row 3, column 1.
    const month: PointModel = { view: 'month', weeks: buildMonthWeeks([...['2026-08-31'], ...days(1, 30), ...['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']], 7, [], ROME, 3), timeZone: ROME };
    const size = { rows: 5, cols: 7 };
    const call = ev('call', '2026-09-22T10:30', '2026-09-22T11:00');

    it('Right moves a day, across the end of the week; Down a week; the hour is kept', () => {
        expect(keyStep(month, size, call, opts('move', 'ArrowRight'))?.placement).toEqual({ start: '2026-09-23T10:30', end: '2026-09-23T11:00', resource: undefined });
        const sunday = ev('sun', '2026-09-27T10:30', '2026-09-27T11:00');
        expect(keyStep(month, size, sunday, opts('move', 'ArrowRight'))).toEqual({ placement: { start: '2026-09-28T10:30', end: '2026-09-28T11:00', resource: undefined }, cell: { row: 4, col: 0 } });
        expect(keyStep(month, size, call, opts('move', 'ArrowDown'))?.placement.start).toBe('2026-09-29T10:30');
    });

    it('a bar over days resizes by a day from its end', () => {
        const trip = ev('trip', '2026-09-23', '2026-09-25');
        expect(keyStep(month, size, trip, opts('end', 'ArrowRight'))?.placement).toEqual({ start: '2026-09-23', end: '2026-09-26', resource: undefined });
    });
});

describe('keyStep in the timeline', () => {
    const rooms = [{ id: 'a', label: 'Room A' }, { id: 'b', label: 'Room B' }];
    const cols = timelineColumns('week', days(21, 7), { timeZone: ROME, startMinutes: 0, endMinutes: 1440, slotMinutes: 30 });
    const line: PointModel = { view: 'timeline', columns: cols, rows: placeTimeline([], timelineRows(rooms, new Set()), cols, ROME) };
    const size = { rows: 2, cols: cols.length + 1 };
    const audit = ev('audit', '2026-09-22T12:00', '2026-09-23T12:00', { resource: 'a' });

    it('Down takes an event to the next resource\'s row; Right a day later', () => {
        expect(keyStep(line, size, audit, opts('move', 'ArrowDown', 'a'))).toEqual({ placement: { start: '2026-09-22T12:00', end: '2026-09-23T12:00', resource: 'b' }, cell: { row: 1, col: 2 } });
        expect(keyStep(line, size, audit, opts('move', 'ArrowRight', 'a'))?.placement).toEqual({ start: '2026-09-23T12:00', end: '2026-09-24T12:00', resource: 'a' });
    });

    it('a resize goes along the time only, never into the resource column', () => {
        expect(keyStep(line, size, audit, opts('end', 'ArrowDown', 'a'))).toBeNull();
        const monday = ev('mon', '2026-09-21', '2026-09-22', { resource: 'a' });
        expect(keyStep(line, size, monday, opts('move', 'ArrowLeft', 'a'))).toBeNull();
    });
});
