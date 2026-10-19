// PDX_REMOVED_FORM: a form the beta removed, written in a .pdx (#121).
//
// The registry (`changes.ts`) says how to find each form and what replaces it. Here the compiler
// reports the `removed` ones it has no code of its own for, as an error at the line, with the message
// that names the beta form and `pdx migrate`. A `changed` form and a `fix` are valid source with a new
// meaning: they are `pdx migrate`'s to report, never the compiler's.

import type { SFCDescriptor } from '../parser/sfc';
import type { ValidationWarning } from '../compiler/validate';
import { languageChanges, type LanguageChangeContext } from './changes';

/** The line (1-based) of `index` in `text`. */
function lineOf(text: string, index: number): number {
    return text.slice(0, index).split('\n').length;
}

/**
 * The removed forms in the .pdx `source`, each placed at its line. `context` is what a change that
 * reads other files looks with — the components' alpha events (#478); without it those find nothing.
 */
export function checkRemovedForms(descriptor: SFCDescriptor, source: string, context?: LanguageChangeContext): ValidationWarning[] {
    const out: ValidationWarning[] = [];
    const script = descriptor.script && !descriptor.script.src ? descriptor.script : null;
    for (const change of languageChanges()) {
        if (change.kind !== 'removed' || change.reportedAs) continue;
        let findings: { line: number; found: string; note?: string }[] = [];
        if (change.scope === 'pdx') {
            findings = change.detect(source, context);
        } else if (change.scope === 'script' && script) {
            // Found in the script, placed in the file: its first line is the line the content starts on.
            const offset = lineOf(source, script.start) - 1;
            findings = change.detect(script.content, context).map((f) => ({ ...f, line: f.line + offset }));
        }
        for (const f of findings) {
            out.push({
                code: 'PDX_REMOVED_FORM',
                severity: 'error',
                message: `\`${f.found}\` is a form the beta removed: ${change.message} ${f.note ? `${f.note} ` : ''}`
                    + (change.fix === 'flag' ? 'Run `pdx migrate` to list every place it is written.' : 'Run `pdx migrate` to rewrite it.'),
                hint: change.fix === 'flag'
                    ? 'Each place `pdx migrate` lists is rewritten by hand.'
                    : '`pdx migrate` rewrites it in this file and in every other; `--dry` shows what it would change.',
                line: f.line,
            });
        }
    }
    return out;
}
