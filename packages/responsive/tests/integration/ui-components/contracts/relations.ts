/**
 * Composition relations: what `left op right` means, and whether it asserts anything.
 *
 * Pure — no Playwright, no page — so the meaning of each operator is checked by a unit test with
 * measurements built by hand, and a manifest's relations are checked for shape without a browser.
 *
 * A relation that cannot assert THROWS — a mistyped property, an unknown operator, a string against
 * a number. Otherwise it asserts nothing and certify reports it green whatever the page does:
 * `contained-in` between two bare names resolving each side to `measurements[name][undefined]`, or
 * an operator with no case, would run no `expect` at all.
 */
import type { CompositionRelation, MeasuredElement, RelationOp } from './types';

/** Every measured property and its kind. Typed as a full record: a key added to MeasuredElement
 *  and not listed here is a compile error, so the static check never falls behind the measurer. */
export const MEASURED_KINDS: Record<keyof MeasuredElement, 'number' | 'string'> = {
    width: 'number', height: 'number', top: 'number', left: 'number', right: 'number', bottom: 'number',
    centerX: 'number', centerY: 'number',
    borderTopWidth: 'number', borderRightWidth: 'number', borderBottomWidth: 'number', borderLeftWidth: 'number',
    borderTopStyle: 'string', borderRightStyle: 'string', borderBottomStyle: 'string', borderLeftStyle: 'string',
    borderTopColor: 'string', borderRightColor: 'string', borderBottomColor: 'string', borderLeftColor: 'string',
    borderTopLeftRadius: 'number', borderTopRightRadius: 'number', borderBottomRightRadius: 'number', borderBottomLeftRadius: 'number',
    backgroundColor: 'string', color: 'string', opacity: 'number', fontSize: 'number',
    fontFamily: 'string', fontWeight: 'string', letterSpacing: 'string', textTransform: 'string',
    cursor: 'string', display: 'string', minHeight: 'number', maxWidth: 'number', minWidth: 'number',
    boxShadow: 'string', pointerEvents: 'string', overflow: 'string',
    contentOverflowX: 'number',
};

/** The operators that compare two boxes (bare names), and those that compare two numbers. */
const BOX_OPS: ReadonlySet<RelationOp> = new Set<RelationOp>(['contained-in', 'flush-left', 'flush-right']);
const NUMBER_OPS: ReadonlySet<RelationOp> = new Set<RelationOp>(['==', '<=', '>=', '<', '>']);

type Kind = 'number' | 'string' | 'box';
export type Operand = number | string | MeasuredElement;

/** One assertion a relation makes. `pass` is the verdict, `detail` the numbers behind it. */
export interface RelationCheck {
    what: string;
    pass: boolean;
    detail: string;
}

function isBox(v: Operand): v is MeasuredElement {
    return typeof v === 'object' && v !== null && typeof (v as MeasuredElement).left === 'number';
}

function kindOf(v: Operand): string {
    if (isBox(v)) return 'box';
    if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : 'number';
    return typeof v;
}

function nothingAsserted(rel: CompositionRelation, left: string, right: string): Error {
    return new Error(`relation "${rel.description}" (${rel.left} ${rel.op} ${rel.right}) compared ${left} with ${right}: nothing was asserted`);
}

/**
 * The value of one side. A number literal, a "quoted" string, `name.prop`, a spaced sum or
 * difference of those (`b.top - a.bottom`), or a bare `name`, which is the element's box.
 */
export function resolveOperand(expr: string, measurements: Record<string, MeasuredElement | null>): Operand {
    // `b.top - a.bottom`, `a.bottom + 12`: a distance between two boxes, which a single term cannot
    // name. Terms are separated by a spaced ` + ` or ` - `, evaluated left to right.
    const terms = expr.split(/ ([+-]) /);
    if (terms.length > 1) {
        let total = Number(resolveOperand(terms[0], measurements));
        for (let i = 1; i < terms.length; i += 2) {
            const v = Number(resolveOperand(terms[i + 1], measurements));
            total = terms[i] === '+' ? total + v : total - v;
        }
        return total;
    }
    if (/^-?\d+(\.\d+)?$/.test(expr)) return parseFloat(expr);
    if (expr.startsWith('"') && expr.endsWith('"')) return expr.slice(1, -1);
    const dot = expr.indexOf('.');
    const name = dot < 0 ? expr : expr.slice(0, dot);
    const m = measurements[name];
    if (!m) throw new Error(`Element "${name}" not found in measurements`);
    if (dot < 0) return m;
    const prop = expr.slice(dot + 1);
    if (!(prop in MEASURED_KINDS)) throw new Error(`"${expr}": ${prop} is not a measured property`);
    return (m as unknown as Record<string, number | string>)[prop];
}

const GEOMETRY: ReadonlySet<string> = new Set(['width', 'height', 'top', 'left', 'right', 'bottom', 'centerX', 'centerY']);

/**
 * The first element whose geometry `expr` reads while it is not rendered (a 0×0 box), or null.
 * That is typically the first match of an unscoped selector, in a scenario section that is hidden:
 * two of them "contain" each other at 0,0, and `a.bottom <= b.top` holds as 0 <= 0 — the relation
 * passes without measuring anything.
 */
function unrenderedGeometry(expr: string, measurements: Record<string, MeasuredElement | null>): string | null {
    for (const term of expr.split(/ [+-] /)) {
        if (/^-?\d+(\.\d+)?$/.test(term) || term.startsWith('"')) continue;
        const dot = term.indexOf('.');
        const name = dot < 0 ? term : term.slice(0, dot);
        if (dot >= 0 && !GEOMETRY.has(term.slice(dot + 1))) continue;
        const m = measurements[name];
        if (m && m.width === 0 && m.height === 0) return name;
    }
    return null;
}

/** The assertions `rel` makes on these measurements. Throws when it would make none. */
export function checkRelation(rel: CompositionRelation, measurements: Record<string, MeasuredElement | null>): RelationCheck[] {
    const l = resolveOperand(rel.left, measurements);
    const r = resolveOperand(rel.right, measurements);
    const tol = rel.tolerance ?? 1;

    for (const expr of [rel.left, rel.right]) {
        const name = unrenderedGeometry(expr, measurements);
        if (name) {
            throw new Error(`relation "${rel.description}": "${name}" measured an element that is not rendered (0×0 box) — scope its selector to the scenario; nothing was asserted`);
        }
    }

    if (BOX_OPS.has(rel.op)) {
        if (!isBox(l) || !isBox(r)) throw nothingAsserted(rel, kindOf(l), kindOf(r));
        switch (rel.op) {
            case 'contained-in': return [
                { what: 'left edge', pass: l.left >= r.left - tol, detail: `${l.left} >= ${r.left} - ${tol}` },
                { what: 'top edge', pass: l.top >= r.top - tol, detail: `${l.top} >= ${r.top} - ${tol}` },
                { what: 'right edge', pass: l.right <= r.right + tol, detail: `${l.right} <= ${r.right} + ${tol}` },
                { what: 'bottom edge', pass: l.bottom <= r.bottom + tol, detail: `${l.bottom} <= ${r.bottom} + ${tol}` },
            ];
            case 'flush-left': return [
                { what: 'left edges', pass: Math.abs(l.left - r.left) <= tol, detail: `|${l.left} - ${r.left}| <= ${tol}` },
            ];
            case 'flush-right': return [
                { what: 'right edges', pass: Math.abs(l.right - r.right) <= tol, detail: `|${l.right} - ${r.right}| <= ${tol}` },
            ];
        }
    }

    if (NUMBER_OPS.has(rel.op) && kindOf(l) === 'number' && kindOf(r) === 'number') {
        const a = l as number, b = r as number;
        switch (rel.op) {
            case '==': return [{ what: 'equal', pass: Math.abs(a - b) <= tol, detail: `|${a} - ${b}| <= ${tol}` }];
            case '<=': return [{ what: 'at most', pass: a <= b + tol, detail: `${a} <= ${b} + ${tol}` }];
            case '>=': return [{ what: 'at least', pass: a >= b - tol, detail: `${a} >= ${b} - ${tol}` }];
            case '<': return [{ what: 'less than', pass: a < b, detail: `${a} < ${b}` }];
            case '>': return [{ what: 'greater than', pass: a > b, detail: `${a} > ${b}` }];
        }
    }

    if (rel.op === '==' && typeof l === 'string' && typeof r === 'string') {
        return [{ what: 'equal', pass: l === r, detail: `"${l}" === "${r}"` }];
    }

    throw nothingAsserted(rel, kindOf(l), kindOf(r));
}

function staticKind(expr: string, names: ReadonlySet<string>): Kind | string {
    const terms = expr.split(/ ([+-]) /);
    if (terms.length > 1) {
        for (let i = 0; i < terms.length; i += 2) {
            const k = staticKind(terms[i], names);
            if (k !== 'number') return `the term "${terms[i]}" of "${expr}" is ${k}, not a number`;
        }
        return 'number';
    }
    if (/^-?\d+(\.\d+)?$/.test(expr)) return 'number';
    if (expr.startsWith('"') && expr.endsWith('"')) return 'string';
    const dot = expr.indexOf('.');
    const name = dot < 0 ? expr : expr.slice(0, dot);
    if (!names.has(name)) return `"${name}" is not the parent or a named child`;
    if (dot < 0) return 'box';
    const prop = expr.slice(dot + 1) as keyof MeasuredElement;
    return MEASURED_KINDS[prop] ?? `"${prop}" is not a measured property`;
}

/**
 * What is wrong with a relation's shape, before anything is measured: a side that names no
 * element or no measured property, or an operator its sides cannot satisfy. Null when it asserts.
 * `names` holds `parent` and the rule's child names.
 */
export function relationShapeProblem(rel: CompositionRelation, names: ReadonlySet<string>): string | null {
    const l = staticKind(rel.left, names);
    const r = staticKind(rel.right, names);
    for (const k of [l, r]) if (k !== 'number' && k !== 'string' && k !== 'box') return k;
    if (BOX_OPS.has(rel.op)) return l === 'box' && r === 'box' ? null : `${rel.op} compares two boxes (bare names), got ${l} and ${r}`;
    if (NUMBER_OPS.has(rel.op) && l === 'number' && r === 'number') return null;
    if (rel.op === '==' && l === 'string' && r === 'string') return null;
    return `${rel.op} between ${l} and ${r} asserts nothing`;
}
