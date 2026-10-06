// The catalog of every diagnostic the PDX tooling emits: one entry per `PDX_*` code.
//
// Each emitter keeps its code as a literal, so a grep finds where it is raised; this file says what it
// means. `packages/compiler/tests/diagnostics-catalog.test.ts` ties the two together both ways — a code
// emitted and not described, or described and emitted nowhere, fails — and compiles every example.

import { DEFECTS } from './catalog-defects';
import { DESIGN } from './catalog-design';

export type DiagnosticCategory =
    /** Something is wrong: the output differs from what was written, or nothing is generated. */
    | 'defect'
    /** A review question a heuristic raises (CD rules that say "a heuristic", and the cross-file ones). */
    | 'design';

export interface DiagnosticEntry {
    severity: 'error' | 'warn' | 'info';
    category: DiagnosticCategory;
    /** One line: what the code says. */
    summary: string;
    /** Why it matters — what goes wrong if it is left. */
    explanation: string;
    /** What to write instead. */
    fix: string;
    /**
     * The finding carries a fix — edits `pdx check --fix` and the editor apply — where the right text
     * is determined. With an `example`, applying it to `bad` gives `good`.
     */
    fixable?: true;
    /**
     * A one-file example the catalog test compiles: `bad` yields the code at `severity` (or a compile
     * that throws naming it), `good` does not.
     */
    example?: { bad: string; good: string };
    /** Produced where one file through compile() cannot show it: the test that does, and names it. */
    reproducedIn?: string;
    /** Neither: why no input reaches it today. */
    unreachable?: string;
}

/** Every code, by name. */
export const DIAGNOSTICS: Readonly<Record<string, DiagnosticEntry>> = { ...DEFECTS, ...DESIGN };

/** Where a code is explained on the site: the generated diagnostics page, one anchor per code. */
export function diagnosticUrl(code: string): string {
    return `https://pdxui.com/docs/diagnostics#${code.toLowerCase()}`;
}

/** The entry for a code, or undefined for a code the catalog does not know. */
export function explainDiagnostic(code: string): DiagnosticEntry | undefined {
    return Object.prototype.hasOwnProperty.call(DIAGNOSTICS, code) ? DIAGNOSTICS[code] : undefined;
}
