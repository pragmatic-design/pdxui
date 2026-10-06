// Code Actions — quick-fixes from the diagnostics that carry a FixProposal: offset edits into the
// .pdx source, built by the compiler from the finding's position. They are applied
// wherever they fall — script, template or style — exactly as `pdx check --fix` applies them. As
// more codes attach a fix, they become quick-fixes here with no change.

import { CodeAction, CodeActionKind, Diagnostic, Range, TextEdit } from 'vscode-languageserver';
import type { ValidationWarning, FixProposal, SFCDescriptor } from '@pdxui/compiler';
import { warningRange } from './diagnostics';
import { offsetToPosition } from '../utils/positions';

/** Two ranges share at least one position (touching counts). */
function rangesOverlap(a: Range, b: Range): boolean {
    const before = (p: Range['start'], q: Range['start']): boolean =>
        p.line < q.line || (p.line === q.line && p.character < q.character);
    return !(before(a.end, b.start) || before(b.end, a.start));
}

/**
 * A FixProposal as text edits, or null when it cannot be applied to this text: no edits, an edit
 * outside the document, or two edits over the same text. A broken edit would corrupt the file.
 */
function toTextEdits(fix: FixProposal, source: string): TextEdit[] | null {
    const edits = fix.edits ?? [];
    if (edits.length === 0) return null;
    if (!edits.every((e) => e.start >= 0 && e.start <= e.end && e.end <= source.length)) return null;
    const sorted = [...edits].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].start < sorted[i - 1].end || sorted[i].start === sorted[i - 1].start) return null;
    }
    return sorted.map((e) => TextEdit.replace(
        Range.create(offsetToPosition(source, e.start), offsetToPosition(source, e.end)),
        e.newText,
    ));
}

export interface CodeActionQuery {
    uri: string;
    source: string;
    descriptor: SFCDescriptor | null;
    warnings: ValidationWarning[];
    /** The range the editor requested actions for (cursor/selection). */
    range: Range;
}

/** Quick-fix code actions for fixable diagnostics overlapping the requested range. */
export function getCodeActions(q: CodeActionQuery): CodeAction[] {
    const script = q.descriptor?.script ?? null;
    const actions: CodeAction[] = [];

    for (const w of q.warnings) {
        if (!w.fix) continue;
        const wr = warningRange(w, q.source, script);
        if (!rangesOverlap(wr, q.range)) continue;
        const edits = toTextEdits(w.fix, q.source);
        if (!edits) continue;

        const diagnostic: Diagnostic = { range: wr, message: w.message, code: w.code, source: 'pdx' };
        actions.push({
            title: `${w.code}: ${w.fix.title}`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            isPreferred: true,
            edit: { changes: { [q.uri]: edits } },
        });
    }

    return actions;
}
