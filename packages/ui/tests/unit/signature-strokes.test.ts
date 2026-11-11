// The stroke model of pdx-signature-pad (#1019): what counts as signed, and what a redraw traces. The
// strokes are kept as points so a resize redraws them instead of stretching a bitmap; the canvas itself is
// measured in Chromium (signature-pad-beta-contract.spec.ts), happy-dom has no 2D context.
import { describe, it, expect } from 'vitest';
import { addPoint, isSigned, strokeLength, traceStrokes, type SignatureStroke } from '../../src/signature-pad/strokes';

describe('signature strokes', () => {
    it('a stroke is as long as the path through its points', () => {
        expect(strokeLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }])).toBe(11);
        expect(strokeLength([{ x: 5, y: 5 }])).toBe(0);
        expect(strokeLength([])).toBe(0);
    });

    it('with no minimum, one stroke of any length signs it; with none, nothing does', () => {
        expect(isSigned([], 0)).toBe(false);
        expect(isSigned([[{ x: 1, y: 1 }]], 0)).toBe(true);
    });

    it('with a minimum, the strokes together have to reach it', () => {
        const short: SignatureStroke[] = [[{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 5 }, { x: 0, y: 15 }]];
        expect(isSigned(short, 21)).toBe(false);
        expect(isSigned(short, 20)).toBe(true);
    });

    it('a point closer than the minimum distance to the last one is not kept', () => {
        const s: SignatureStroke = [{ x: 0, y: 0 }];
        expect(addPoint(s, { x: 0.5, y: 0.5 }, 1)).toBe(false);
        expect(addPoint(s, { x: 2, y: 0 }, 1)).toBe(true);
        expect(s).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }]);
    });

    it('a redraw traces a dot for a single point and a line through the others, in CSS pixels', () => {
        const calls: string[] = [];
        const ctx = {
            beginPath: () => calls.push('begin'),
            moveTo: (x: number, y: number) => calls.push(`move ${x},${y}`),
            lineTo: (x: number, y: number) => calls.push(`line ${x},${y}`),
            arc: (x: number, y: number, r: number) => calls.push(`arc ${x},${y} r${r}`),
            fill: () => calls.push('fill'),
            stroke: () => calls.push('stroke'),
        };
        traceStrokes(ctx, [[{ x: 4, y: 4 }], [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }]], 2);
        expect(calls).toEqual([
            'begin', 'arc 4,4 r1', 'fill',
            'begin', 'move 0,0', 'line 5,0', 'line 5,5', 'stroke',
        ]);
    });
});
