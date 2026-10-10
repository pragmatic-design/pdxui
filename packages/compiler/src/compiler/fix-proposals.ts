// The fixes a finding carries, as text edits into the .pdx source.
//
// A fix is built from the finding's position — the declaration it is about — as offset edits, the
// shape of an LSP TextEdit, so `pdx check --fix` and the editor apply the same thing. A string to
// find and a string to put in its place, applied to the first occurrence in the file, would rewrite
// whichever of two `let count = 0` in different scopes came first.

import type { ValidationWarning, FixProposal } from './validate';
import {
    offsetOf, rawInterpolationFix, interpolationInBindingFix, boundNameFix, eventNameFix, tagRenameFix,
    undeclaredRefFix, fetchTypeColonFix,
} from './fix-builders';

/**
 * Where the initialiser of `name = …` ends: the first `;` or newline outside brackets and strings.
 * Returns [start, end) of the initialiser text, trimmed, or undefined when there is none.
 */
function initialiserAt(source: string, nameStart: number, name: string): [number, number] | undefined {
    if (source.slice(nameStart, nameStart + name.length) !== name) return undefined;
    // Match: ` = ` right after the name — an assignment, not `==`. A type annotation is not rewritten.
    const eq = /^\s*=(?!=)\s*/.exec(source.slice(nameStart + name.length));
    if (!eq) return undefined;
    const start = nameStart + name.length + eq[0].length;
    let depth = 0;
    let quote = '';
    let end = source.length;
    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (quote) {
            if (ch === '\\') { i++; continue; }
            if (ch === quote) quote = '';
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') {
            if (depth === 0) { end = i; break; }
            depth--;
        } else if ((ch === ';' || ch === '\n') && depth === 0) { end = i; break; }
    }
    while (end > start && /\s/.test(source[end - 1])) end--;
    return end > start ? [start, end] : undefined;
}

/** PDX_NON_REACTIVE: `let count = 0` → `let count = $signal(0)`, at the declaration the finding points at. */
function nonReactiveFix(source: string, w: ValidationWarning): FixProposal | undefined {
    const name = /'([\w$]+)'/.exec(w.message)?.[1];
    if (!name || w.line === undefined || w.column === undefined) return undefined;
    const at = offsetOf(source, w.line, w.column);
    if (at === undefined) return undefined;
    const init = initialiserAt(source, at, name);
    if (!init) return undefined;
    return {
        title: `Declare '${name}' with $signal`,
        edits: [
            { start: init[0], end: init[0], newText: '$signal(' },
            { start: init[1], end: init[1], newText: ')' },
        ],
    };
}

const BUILDERS: Record<string, (source: string, w: ValidationWarning) => FixProposal | undefined> = {
    PDX_NON_REACTIVE: nonReactiveFix,
    PDX_RAW_INTERPOLATION: rawInterpolationFix,
    PDX_RAW_INTERPOLATION_IN_BINDING: interpolationInBindingFix,
    PDX_UNKNOWN_PROP: boundNameFix,
    PDX_PROP_NAME_CASE: boundNameFix,
    PDX_EVENT_NAME_CASE: eventNameFix,
    PDX_UNRESOLVED_COMPONENT: tagRenameFix,
    PDX_UNDECLARED_REF: undeclaredRefFix,
    PDX_FETCH_TYPE_COLON: fetchTypeColonFix,
};

/**
 * Attach to each positioned finding the fix its code knows how to build, as edits into `source`.
 * A finding that already carries one keeps it.
 */
export function proposeFixes(source: string, warnings: ValidationWarning[]): ValidationWarning[] {
    for (const w of warnings) {
        if (w.fix) continue;
        const fix = BUILDERS[w.code]?.(source, w);
        if (fix) w.fix = fix;
    }
    return warnings;
}
