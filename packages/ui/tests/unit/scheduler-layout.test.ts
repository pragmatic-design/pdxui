// The layout engines of pdx-scheduler (#1020, part 2). Events are intervals [start, end) on one axis;
// the time grid lays a day column out in side-by-side columns, the month view and the timeline stack
// a row in lanes with a "+N" past a limit.
import { describe, it, expect } from 'vitest';
import { assignLanes, layoutColumns, layoutRow } from '../../src/scheduler/layout';

const byId = <T extends { id: string }>(list: T[]) => Object.fromEntries(list.map(({ id, ...rest }) => [id, rest]));

describe('assignLanes', () => {
    it('reuses a lane once the interval in it has ended; an interval ending where another starts does not overlap it', () => {
        const lanes = assignLanes([
            { id: 'a', start: 0, end: 60 },
            { id: 'b', start: 30, end: 90 },
            { id: 'c', start: 60, end: 120 },
        ]);
        expect(byId(lanes)).toEqual({ a: { lane: 0 }, b: { lane: 1 }, c: { lane: 0 } });
    });

    it('of two that start together, the longer takes the first lane; the order does not depend on the input order', () => {
        const items = [{ id: 'short', start: 0, end: 30 }, { id: 'long', start: 0, end: 120 }];
        expect(byId(assignLanes(items))).toEqual({ long: { lane: 0 }, short: { lane: 1 } });
        expect(byId(assignLanes([...items].reverse()))).toEqual({ long: { lane: 0 }, short: { lane: 1 } });
    });

    it('an interval of no length is given one unit, so it is not lost under its neighbour', () => {
        expect(byId(assignLanes([{ id: 'a', start: 10, end: 10 }, { id: 'b', start: 10, end: 40 }]))).toEqual({ b: { lane: 0 }, a: { lane: 1 } });
    });
});

describe('layoutColumns', () => {
    it('an event alone takes the whole column', () => {
        expect(layoutColumns([{ id: 'a', start: 60, end: 120 }])).toEqual([{ id: 'a', column: 0, columns: 1, span: 1 }]);
    });

    it('overlapping events share the width; a later group of events starts over at one column', () => {
        const out = byId(layoutColumns([
            { id: 'a', start: 0, end: 60 },
            { id: 'b', start: 30, end: 90 },
            { id: 'later', start: 120, end: 150 },
        ]));
        expect(out.a).toEqual({ column: 0, columns: 2, span: 1 });
        expect(out.b).toEqual({ column: 1, columns: 2, span: 1 });
        expect(out.later).toEqual({ column: 0, columns: 1, span: 1 });
    });

    it('events chained through a third are one group: three columns although a and c never meet', () => {
        const out = byId(layoutColumns([
            { id: 'a', start: 0, end: 60 },
            { id: 'b', start: 30, end: 120 },
            { id: 'c', start: 90, end: 150 },
            { id: 'd', start: 0, end: 150 },
        ]));
        // d is the longest at 0, so it is column 0; a is 1; b is 2; c reuses column 1 after a ends.
        expect(out.d).toMatchObject({ column: 0, columns: 3 });
        expect(out.a).toMatchObject({ column: 1, columns: 3 });
        expect(out.b).toMatchObject({ column: 2, columns: 3 });
        expect(out.c).toMatchObject({ column: 1, columns: 3 });
    });

    it('an event widens to the right over columns nobody uses while it lasts', () => {
        const out = byId(layoutColumns([
            { id: 'long', start: 0, end: 180 },
            { id: 'x', start: 0, end: 60 },
            { id: 'y', start: 0, end: 60 },
            { id: 'z', start: 90, end: 150 },
        ]));
        expect(out.long).toEqual({ column: 0, columns: 3, span: 1 });
        // z starts after x and y end: column 1 is free, and column 2 too, so it takes both.
        expect(out.z).toEqual({ column: 1, columns: 3, span: 2 });
        expect(out.x).toEqual({ column: 1, columns: 3, span: 1 });
    });
});

describe('layoutRow', () => {
    // A week row: units are the 7 days, intervals are [first day, day after the last).
    it('stacks multi-day bars in lanes', () => {
        const { placed, more } = layoutRow([
            { id: 'trip', start: 1, end: 4 },
            { id: 'mon', start: 0, end: 1 },
            { id: 'wed', start: 2, end: 3 },
        ], 7);
        expect(byId(placed)).toEqual({ mon: { lane: 0 }, trip: { lane: 0 }, wed: { lane: 1 } });
        expect(more).toEqual([0, 0, 0, 0, 0, 0, 0]);
    });

    it('past maxLanes an interval is left out and counted on every day it covers', () => {
        const { placed, more } = layoutRow([
            { id: 'a', start: 0, end: 7 },
            { id: 'b', start: 0, end: 7 },
            { id: 'c', start: 2, end: 4 },
            { id: 'd', start: 3, end: 4 },
        ], 7, 2);
        expect(placed.map((l) => l.id).sort()).toEqual(['a', 'b']);
        expect(more).toEqual([0, 0, 1, 2, 0, 0, 0]);
    });

    it('an interval that starts before the row or ends after it is counted only inside it', () => {
        const { more } = layoutRow([
            { id: 'a', start: -3, end: 10 },
            { id: 'b', start: -2, end: 2 },
        ], 7, 1);
        expect(more).toEqual([1, 1, 0, 0, 0, 0, 0]);
    });
});
