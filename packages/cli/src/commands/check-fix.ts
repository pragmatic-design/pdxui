// Applying fixes for `pdx check --fix`, and showing them in `--json`.
//
// A fix is a list of offset edits into the file (FixProposal). Several fixes on one file are applied
// together, from the end of the file backwards so an edit never moves the offsets of the ones still
// to apply. A fix whose edits overlap an edit already accepted is refused, whole: half of a fix is a
// broken file.

import type { FixProposal, FixEdit } from '@pdxui/compiler';

/** A fix as `--json` shows it: its edits with 1-based positions as well as offsets. */
export interface ReportedFix {
    title: string;
    edits: (FixEdit & { line: number; column: number; endLine: number; endColumn: number })[];
}

/** 1-based line and column of an offset. */
function lineColumn(source: string, offset: number): { line: number; column: number } {
    const before = source.slice(0, offset);
    return { line: before.split('\n').length, column: offset - before.lastIndexOf('\n') };
}

/** The fix with the positions of its edits, for a reader that works in lines. */
export function reportFix(source: string, fix: FixProposal): ReportedFix {
    return {
        title: fix.title,
        edits: fix.edits.map((e) => {
            const from = lineColumn(source, e.start);
            const to = lineColumn(source, e.end);
            return { ...e, line: from.line, column: from.column, endLine: to.line, endColumn: to.column };
        }),
    };
}

/** Two edits touch the same text. Two inserts at one offset overlap too: their order is not defined. */
const overlaps = (a: FixEdit, b: FixEdit): boolean =>
    a.start === b.start || (a.start < b.end && b.start < a.end);

/**
 * Apply the fixes that do not overlap one another, in order. Returns the new source, the fixes
 * applied and the fixes refused.
 */
export function applyFixes<F extends { fix: FixProposal }>(source: string, fixes: F[]): { source: string; applied: F[]; refused: F[] } {
    const accepted: FixEdit[] = [];
    const applied: F[] = [];
    const refused: F[] = [];
    for (const f of fixes) {
        const edits = f.fix.edits;
        const inBounds = edits.every((e) => e.start >= 0 && e.start <= e.end && e.end <= source.length);
        const clash = edits.some((e, i) => edits.some((o, j) => i !== j && overlaps(e, o)))
            || edits.some((e) => accepted.some((a) => overlaps(e, a)));
        if (!inBounds || clash || edits.length === 0) { refused.push(f); continue; }
        accepted.push(...edits);
        applied.push(f);
    }
    let out = source;
    for (const e of [...accepted].sort((a, b) => b.start - a.start)) {
        out = out.slice(0, e.start) + e.newText + out.slice(e.end);
    }
    return { source: out, applied, refused };
}
