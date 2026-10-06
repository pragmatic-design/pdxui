// Diagnostics — maps ValidationWarning[] to LSP Diagnostic[].

import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import type { ValidationWarning } from '@pdxui/compiler';
import { offsetToPosition, type ScriptBlock } from '../utils/positions';

export type { ScriptBlock };

/** Map compiler severity to LSP DiagnosticSeverity. */
function mapSeverity(sev?: string): DiagnosticSeverity {
    switch (sev) {
        case 'error': return DiagnosticSeverity.Error;
        case 'warn': return DiagnosticSeverity.Warning;
        case 'info': return DiagnosticSeverity.Information;
        default: return DiagnosticSeverity.Warning;
    }
}

/** Convert ValidationWarning[] to LSP Diagnostic[]. */
export function toDiagnostics(warnings: ValidationWarning[], source: string, script?: ScriptBlock | null): Diagnostic[] {
    return warnings.map(w => ({
        severity: mapSeverity(w.severity),
        range: warningRange(w, source, script ?? null),
        message: w.message + (w.hint ? `\nHint: ${w.hint}` : ''),
        source: 'pdx',
        code: w.code,
    }));
}

/**
 * The range a warning is drawn on. The compiler places every finding it can at a 1-based line and
 * column in the file (`positionWarnings`); the range runs from there to the end of the
 * token it starts, so the squiggle covers the name, the tag or the directive. A finding with no
 * position is drawn at the start of the script.
 * Exported so code-actions can target the same range as the diagnostic.
 */
export function warningRange(w: ValidationWarning, source: string, script: ScriptBlock | null): Range {
    if (w.line !== undefined) {
        const line = w.line - 1;
        const character = Math.max(0, (w.column ?? 1) - 1);
        const text = source.split('\n')[line] ?? '';
        // Match: the token at the column — a name, `@directive`, `<tag` or `:binding` — up to a
        // character that cannot be part of one.
        const token = /^[@<:]{0,2}[\w$.-]*/.exec(text.slice(character))?.[0] ?? '';
        return Range.create(line, character, line, character + token.length);
    }
    if (script) {
        const pos = offsetToPosition(source, script.start);
        return Range.create(pos, pos);
    }
    return Range.create(0, 0, 0, 0);
}
