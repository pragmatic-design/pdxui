// What a pointer gesture does to an event (#1020, part 6): the range a move, a resize or a create
// gives, written in the event's own form, the overlaps a placement would make, and who may move what.
import { describe, it, expect } from 'vitest';
import { formatLike, moveEvent, resizeEvent, createRange, conflicts, allowed, type DropPoint } from '../../src/scheduler/drag-model';
import { zonedInstant } from '../../src/scheduler/time';
import type { SchedulerEvent } from '../../src/scheduler/grid-model';

const ROME = 'Europe/Rome';
const HALF = 30 * 60_000;
const ev = (id: string, start: string, end: string, extra: Partial<SchedulerEvent> = {}): SchedulerEvent => ({ id, title: id, start, end, ...extra });
/** The slot at `hh:mm` of `date` in Rome, as a time grid reads it. */
const at = (date: string, hh: number, mm = 0, resource: string | null = null): DropPoint => ({ at: zonedInstant(date, hh * 60 + mm, ROME), date, resource, allDay: false });
const day = (date: string, resource: string | null = null): DropPoint => ({ at: zonedInstant(date, 0, ROME), date, resource, allDay: true });

describe('formatLike', () => {
    const t = Date.parse('2026-09-22T08:30:00Z');
    it('a date stays a date, an instant is written in UTC, a wall time stays a wall time in the zone', () => {
        expect(formatLike('2026-09-01', t, ROME)).toBe('2026-09-22');
        expect(formatLike('2026-09-01T10:00:00+02:00', t, ROME)).toBe('2026-09-22T08:30:00Z');
        expect(formatLike('2026-09-01T10:00', t, ROME)).toBe('2026-09-22T10:30');
    });
});

describe('moveEvent', () => {
    const review = ev('review', '2026-09-22T10:00', '2026-09-22T12:00', { resource: 'a' });

    it('a timed move keeps the duration and the point it was grabbed at', () => {
        // Grabbed in its second slot (10:30), dropped on Wednesday's 14:30: it starts at 14:00.
        expect(moveEvent(review, { point: at('2026-09-22', 10, 30, 'a') }, at('2026-09-23', 14, 30, 'a'), ROME))
            .toEqual({ start: '2026-09-23T14:00', end: '2026-09-23T16:00', resource: 'a' });
    });

    it('to another resource: the one it was dragged from is replaced, the others kept', () => {
        expect(moveEvent(review, { point: at('2026-09-22', 10, 0, 'a') }, at('2026-09-22', 10, 0, 'b'), ROME).resource).toBe('b');
        const both = ev('call', '2026-09-22T10:00', '2026-09-22T11:00', { resource: ['a', 'c'] });
        expect(moveEvent(both, { point: at('2026-09-22', 10, 0, 'a') }, at('2026-09-22', 10, 0, 'b'), ROME).resource).toEqual(['b', 'c']);
    });

    it('over a change of the clock it keeps the wall time: 09:00 on Saturday 24 October is 09:00 on Monday 26', () => {
        const nine = ev('standup', '2026-10-24T09:00', '2026-10-24T09:30');
        expect(moveEvent(nine, { point: at('2026-10-24', 9) }, at('2026-10-26', 9), ROME))
            .toEqual({ start: '2026-10-26T09:00', end: '2026-10-26T09:30', resource: undefined });
    });

    it('an all-day event, or any event dropped on a day, moves by whole days at the same wall time', () => {
        const trip = ev('trip', '2026-09-25', '2026-09-28');
        expect(moveEvent(trip, { point: day('2026-09-26') }, day('2026-09-29'), ROME)).toEqual({ start: '2026-09-28', end: '2026-10-01', resource: undefined });
        expect(moveEvent(review, { point: day('2026-09-22') }, day('2026-09-24'), ROME)).toEqual({ start: '2026-09-24T10:00', end: '2026-09-24T12:00', resource: 'a' });
    });
});

describe('resizeEvent', () => {
    const review = ev('review', '2026-09-22T10:00', '2026-09-22T12:00');

    it('the end to the end of the slot under the pointer, never before one slot after the start', () => {
        expect(resizeEvent(review, 'end', at('2026-09-22', 13, 30), HALF, ROME).end).toBe('2026-09-22T14:00');
        expect(resizeEvent(review, 'end', at('2026-09-22', 8), HALF, ROME).end).toBe('2026-09-22T10:30');
    });

    it('the start to the start of the slot under the pointer, never after one slot before the end', () => {
        expect(resizeEvent(review, 'start', at('2026-09-22', 9), HALF, ROME).start).toBe('2026-09-22T09:00');
        expect(resizeEvent(review, 'start', at('2026-09-22', 15), HALF, ROME).start).toBe('2026-09-22T11:30');
    });

    it('an all-day event by whole days, at least one', () => {
        const trip = ev('trip', '2026-09-25', '2026-09-28');
        expect(resizeEvent(trip, 'end', day('2026-09-29'), HALF, ROME).end).toBe('2026-09-30');
        expect(resizeEvent(trip, 'end', day('2026-09-20'), HALF, ROME).end).toBe('2026-09-26');
        expect(resizeEvent(trip, 'start', day('2026-09-30'), HALF, ROME).start).toBe('2026-09-27');
    });
});

describe('createRange', () => {
    it('from the slot it began on to the one under the pointer, either way, both included', () => {
        expect(createRange(at('2026-09-22', 11, 0, 'a'), at('2026-09-22', 9, 30, 'a'), HALF, ROME))
            .toEqual({ start: '2026-09-22T07:30:00.000Z', end: '2026-09-22T09:30:00.000Z', resource: 'a', allDay: false });
    });

    it('whole days on whole-day points', () => {
        expect(createRange(day('2026-09-24'), day('2026-09-22'), HALF, ROME))
            .toEqual({ start: '2026-09-21T22:00:00.000Z', end: '2026-09-24T22:00:00.000Z', resource: null, allDay: true });
    });
});

describe('conflicts', () => {
    const events = [
        ev('a1', '2026-09-22T09:00', '2026-09-22T10:00', { resource: 'a' }),
        ev('b1', '2026-09-22T09:00', '2026-09-22T10:00', { resource: 'b' }),
        ev('block', '2026-09-22T09:00', '2026-09-22T12:00', { resource: 'a', background: true }),
        ev('a2', '2026-09-22T11:00', '2026-09-22T12:00', { resource: 'a' }),
    ];

    it('the events of the same resource whose range crosses it, itself and background events left out', () => {
        expect(conflicts(events, 'a2', { start: '2026-09-22T09:30', end: '2026-09-22T11:30', resource: 'a' }, ROME).map((e) => e.id)).toEqual(['a1']);
    });

    it('touching is not overlapping', () => {
        expect(conflicts(events, 'x', { start: '2026-09-22T10:00', end: '2026-09-22T11:00', resource: 'a' }, ROME)).toEqual([]);
    });

    it('without resources, any event crosses it', () => {
        expect(conflicts(events, null, { start: '2026-09-22T09:30', end: '2026-09-22T09:45', resource: undefined }, ROME).map((e) => e.id)).toEqual(['a1', 'b1']);
    });
});

describe('allowed', () => {
    const tree = [{ id: 'site', label: 'Site', draggable: false, children: [{ id: 'a', label: 'A', draggable: true }, { id: 'b', label: 'B' }] }, { id: 'c', label: 'C', readonly: true }];
    const open = { readonly: false };

    it('the event decides first, then its nearest resource that says, then the scheduler', () => {
        expect(allowed(ev('x', '2026-09-22', '2026-09-23', { resource: 'b', draggable: true }), 'move', tree, open)).toBe(true);
        expect(allowed(ev('x', '2026-09-22', '2026-09-23', { resource: 'a' }), 'move', tree, open)).toBe(true);
        expect(allowed(ev('x', '2026-09-22', '2026-09-23', { resource: 'b' }), 'move', tree, open)).toBe(false);
        expect(allowed(ev('x', '2026-09-22', '2026-09-23', { resource: 'b' }), 'resize', tree, open)).toBe(true);
        expect(allowed(ev('x', '2026-09-22', '2026-09-23'), 'move', tree, { readonly: true })).toBe(false);
    });

    it('a readonly event, a background one, or one in a readonly resource is never moved', () => {
        expect(allowed(ev('x', '2026-09-22', '2026-09-23', { readonly: true, draggable: true }), 'move', tree, open)).toBe(false);
        expect(allowed(ev('x', '2026-09-22', '2026-09-23', { background: true }), 'move', tree, open)).toBe(false);
        expect(allowed(ev('x', '2026-09-22', '2026-09-23', { resource: 'c' }), 'resize', tree, open)).toBe(false);
    });
});
