// A grouped bar and its hover marker have to agree on where the bar is.
//
// `drawBars` offsets each series by its index; a marker at `xScale.map(p.x)` — the centre of the
// CATEGORY, identical for every series — would put both dots of a two-series chart over the gap
// between the bars. The geometry lives in one exported function and both callers use it.
//
// The chart draws to a canvas, so this asserts the arithmetic rather than pixels — that is the level
// the defect lives at.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { barSlot } from '../../src/chart/series/bar';
import type { ChartArea } from '../../src/chart/core/types';

const area: ChartArea = { x: 0, y: 0, width: 1200, height: 300 };
const CATS = 12;               // twelve months, as in the lab app
const catWidth = area.width / CATS;
const cx = catWidth * 1.5;     // the centre of the second category

describe('barSlot', () => {
    it('centres a single series on the category', () => {
        const slot = barSlot(cx, 0, 1, area, CATS, false);
        expect(slot.centre).toBeCloseTo(cx, 6);
    });

    it('puts two grouped series either side of the category centre', () => {
        const a = barSlot(cx, 0, 2, area, CATS, false);
        const b = barSlot(cx, 1, 2, area, CATS, false);

        expect(a.centre).toBeLessThan(cx);
        expect(b.centre).toBeGreaterThan(cx);
        // Symmetric about the category centre, and neither ON it — the defect puts both at cx.
        expect(cx - a.centre).toBeCloseTo(b.centre - cx, 6);
        expect(a.centre).not.toBeCloseTo(cx, 1);
    });

    it('places each marker inside its own bar, for two and three series', () => {
        for (const total of [2, 3]) {
            for (let i = 0; i < total; i++) {
                const s = barSlot(cx, i, total, area, CATS, false);
                expect(s.centre, `series ${i} of ${total}`).toBeGreaterThan(s.left);
                expect(s.centre).toBeLessThan(s.left + s.width);
            }
        }
    });

    it('leaves no gap and no overlap between adjacent bars of a group', () => {
        const a = barSlot(cx, 0, 3, area, CATS, false);
        const b = barSlot(cx, 1, 3, area, CATS, false);
        expect(b.left).toBeCloseTo(a.left + a.width, 6);
    });

    it('keeps a stacked group centred on the category, whatever the series index', () => {
        // Stacked bars share one slot: the category centre IS the bar centre.
        for (const i of [0, 1, 2]) {
            const s = barSlot(cx, i, 3, area, CATS, true);
            expect(s.centre).toBeCloseTo(cx, 6);
        }
    });

    it('uses 70% of the category for the group, leaving the gap between groups', () => {
        const group = barSlot(cx, 0, 1, area, CATS, false);
        expect(group.width).toBeCloseTo(catWidth * 0.7, 6);
    });
});

describe('the hover marker uses that geometry and not its own', () => {
    // ⚠️ Everything above would pass with the defect present: asserting `barSlot` says nothing about
    // a caller that does not use it. The chart draws to a
    // canvas, so the marker's x cannot be read from the DOM — this reads the source instead, which is
    // weaker than a measurement and is the honest ceiling here.
    const engine = readFileSync(join(__dirname, '../../src/chart/core/engine.ts'), 'utf-8');

    it('imports the shared geometry', () => {
        expect(engine).toMatch(/import \{[^}]*barSlot[^}]*\} from '\.\.\/series\/bar'/);
    });

    it('no longer takes the category centre as the marker x', () => {
        // The defect, verbatim: `px: this.xScale.map(point.x)` in the bar branch of the hover handler.
        expect(engine).not.toMatch(/px:\s*this\.xScale\.map\(point\.x\)/);
        expect(engine).toMatch(/px:\s*slot\.centre/);
    });
});
