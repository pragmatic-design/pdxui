// A composition relation in a certification manifest asserts something.
//
// A relation can assert nothing. `contained-in` between two bare names compares `undefined` with
// `undefined`: a runner whose switch runs only when both sides are numbers runs no `expect`, and
// `pnpm certify` reports the relation green whatever the page does; an operator with no case does
// the same. The meaning of each operator is pinned here with measurements built by hand, and every relation
// in every manifest is checked for a shape that can assert — no browser needed.
//
// It lives in core/tests for the same reason as certification-gate: a check on the repository, and
// core's suite is the one `pnpm test` runs.

import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkRelation, relationShapeProblem } from '../../responsive/tests/integration/ui-components/contracts/relations';
import type { CompositionRelation, CompositionRule, MeasuredElement } from '../../responsive/tests/integration/ui-components/contracts/types';

function box(left: number, top: number, width: number, height: number): MeasuredElement {
    return {
        left, top, width, height, right: left + width, bottom: top + height,
        centerX: left + width / 2, centerY: top + height / 2,
        overflow: 'visible', contentOverflowX: 0,
        borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0,
        borderTopStyle: 'none', borderRightStyle: 'none', borderBottomStyle: 'none', borderLeftStyle: 'none',
        borderTopColor: '', borderRightColor: '', borderBottomColor: '', borderLeftColor: '',
        borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderBottomLeftRadius: 0,
        backgroundColor: 'rgb(0, 0, 0)', color: 'rgb(0, 0, 0)', opacity: 1, fontSize: 14,
        fontFamily: 'x', fontWeight: '400', letterSpacing: 'normal', textTransform: 'none',
        cursor: 'auto', display: 'block', minHeight: 0, maxWidth: 0, minWidth: 0,
        boxShadow: 'none', pointerEvents: 'auto',
    };
}

const rel = (left: string, op: CompositionRelation['op'], right: string, tolerance?: number): CompositionRelation =>
    ({ description: `${left} ${op} ${right}`, left, op, right, tolerance });

const failed = (checks: { what: string; pass: boolean }[]) => checks.filter((c) => !c.pass).map((c) => c.what);

describe('contained-in compares two boxes, on all four edges', () => {
    const outer = box(100, 100, 200, 100);   // 100..300 × 100..200

    it('a box inside passes', () => {
        const checks = checkRelation(rel('child', 'contained-in', 'outer'), { outer, child: box(110, 110, 50, 50) });
        expect(checks).toHaveLength(4);
        expect(failed(checks)).toEqual([]);
    });

    it.each([
        ['left edge', box(90, 110, 50, 50)],
        ['top edge', box(110, 90, 50, 50)],
        ['right edge', box(260, 110, 50, 50)],
        ['bottom edge', box(110, 160, 50, 50)],
    ])('a box past the %s fails, and the check names that edge', (edge, child) => {
        expect(failed(checkRelation(rel('child', 'contained-in', 'outer'), { outer, child }))).toEqual([edge]);
    });

    it('the tolerance is allowed on each edge, and no more', () => {
        const child = box(99, 99, 202, 102);   // 1px past every edge
        expect(failed(checkRelation(rel('child', 'contained-in', 'outer', 1), { outer, child }))).toEqual([]);
        expect(failed(checkRelation(rel('child', 'contained-in', 'outer', 0), { outer, child })))
            .toEqual(['left edge', 'top edge', 'right edge', 'bottom edge']);
    });
});

describe('flush-left / flush-right compare one edge', () => {
    const a = box(100, 0, 50, 20);

    it('the same left edge passes; 5px off fails', () => {
        expect(failed(checkRelation(rel('a', 'flush-left', 'b'), { a, b: box(100, 30, 80, 20) }))).toEqual([]);
        expect(failed(checkRelation(rel('a', 'flush-left', 'b'), { a, b: box(105, 30, 80, 20) }))).toEqual(['left edges']);
    });

    it('the same right edge passes; 5px off fails', () => {
        expect(failed(checkRelation(rel('a', 'flush-right', 'b'), { a, b: box(70, 30, 80, 20) }))).toEqual([]);
        expect(failed(checkRelation(rel('a', 'flush-right', 'b'), { a, b: box(75, 30, 80, 20) }))).toEqual(['right edges']);
    });
});

describe('a relation that cannot assert throws', () => {
    const m = { a: box(0, 0, 10, 10), b: box(0, 0, 20, 20) };

    it('an ordering operator between two bare names', () => {
        expect(() => checkRelation(rel('a', '<=', 'b'), m)).toThrow(/nothing was asserted/);
    });

    it('contained-in between two numbers', () => {
        expect(() => checkRelation(rel('a.left', 'contained-in', 'b.left'), m)).toThrow(/nothing was asserted/);
    });

    it('a string against a number', () => {
        expect(() => checkRelation(rel('a.display', '<', 'b.width'), m)).toThrow(/nothing was asserted/);
    });

    it('a box operator on an element that is not rendered (0×0) — an unscoped selector into a hidden section', () => {
        expect(() => checkRelation(rel('a', 'contained-in', 'b'), { a: box(0, 0, 0, 0), b: box(0, 0, 0, 0) })).toThrow(/not rendered/);
        expect(() => checkRelation(rel('a', 'contained-in', 'b'), { a: box(10, 10, 5, 5), b: box(0, 0, 0, 0) })).toThrow(/"b" measured an element that is not rendered/);
    });

    it('a geometry read from an element that is not rendered: 0 <= 0 would hold without measuring', () => {
        expect(() => checkRelation(rel('a.bottom', '<=', 'b.top'), { a: box(0, 0, 0, 0), b: box(0, 0, 0, 0) })).toThrow(/"a" measured an element that is not rendered/);
        expect(() => checkRelation(rel('b.top - a.bottom', '>=', '0'), { a: box(0, 0, 0, 0), b: box(0, 10, 5, 5) })).toThrow(/"a" measured/);
        // A style read is not geometry: an element's color is there whether it has a box or not.
        expect(failed(checkRelation(rel('a.display', '==', 'b.display'), { a: box(0, 0, 0, 0), b: box(0, 10, 5, 5) }))).toEqual([]);
    });

    it('a mistyped property', () => {
        expect(() => checkRelation(rel('a.hieght', '==', 'b.height'), m)).toThrow(/not a measured property/);
    });

    it('the control: numbers and strings still compare', () => {
        expect(failed(checkRelation(rel('a.height', '<', 'b.height'), m))).toEqual([]);
        expect(failed(checkRelation(rel('b.top - a.bottom', '==', '-10'), m))).toEqual([]);
        expect(failed(checkRelation(rel('a.display', '==', 'b.display'), m))).toEqual([]);
        expect(failed(checkRelation(rel('a.height', '>', 'b.height'), m))).toEqual(['greater than']);
    });
});

// ── Every relation in every manifest ──

const MANIFESTS = join(__dirname, '..', '..', 'responsive', 'tests', 'manifests');

interface ScenarioContracts { composition?: CompositionRule[] }
interface ManifestLike {
    name: string;
    contracts?: {
        scenarios?: Record<string, ScenarioContracts>;
        themeOverrides?: Record<string, Record<string, ScenarioContracts>>;
    };
}

interface Found { where: string; rel: CompositionRelation; names: Set<string> }

describe('every composition relation in the manifests has a shape that asserts', () => {
    const found: Found[] = [];

    beforeAll(async () => {
        const files = readdirSync(MANIFESTS).filter((f) => f.endsWith('.manifest.ts'));
        for (const f of files) {
            const mod = await import(pathToFileURL(join(MANIFESTS, f)).href);
            const m: ManifestLike = mod.default ?? mod[Object.keys(mod).find((k) => k !== 'default')!];
            const blocks: [string, Record<string, ScenarioContracts>][] = [['', m.contracts?.scenarios ?? {}]];
            for (const [theme, byScenario] of Object.entries(m.contracts?.themeOverrides ?? {})) blocks.push([theme, byScenario]);
            for (const [theme, byScenario] of blocks) {
                for (const [scenario, c] of Object.entries(byScenario)) {
                    for (const rule of c.composition ?? []) {
                        const names = new Set(['parent', ...Object.keys(rule.children)]);
                        for (const r of rule.relations) found.push({ where: `${m.name} ${theme ? theme + '/' : ''}${scenario}`, rel: r, names });
                    }
                }
            }
        }
    }, 30_000);

    it('no relation names a missing element or property, or an operator its sides cannot satisfy', () => {
        const problems = found
            .map((f) => ({ f, p: relationShapeProblem(f.rel, f.names) }))
            .filter((x) => x.p)
            .map((x) => `${x.f.where} — "${x.f.rel.description}": ${x.p}`);
        expect(problems).toEqual([]);
    });

    it('the box operators are among them: the relations that asserted nothing now run', () => {
        const byOp = (op: string) => found.filter((f) => f.rel.op === op).length;
        // Measured when the hole was closed: 147 contained-in and 1 flush-left. A floor, not an
        // exact count, so adding a relation does not break it — dropping them does.
        expect(byOp('contained-in')).toBeGreaterThanOrEqual(147);
        expect(byOp('flush-left') + byOp('flush-right')).toBeGreaterThanOrEqual(1);
    });
});
