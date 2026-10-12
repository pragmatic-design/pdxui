// Reading `let/const/var name = $signal<T>(init)` with TypeScript's parser (#275).
//
// The analyzer read a rune declaration with regexes that did not balance brackets: a type argument
// with a comma (`Record<string, string>`) split the declaration in two, one with parentheses or an
// arrow (`(A & B)[]`, `() => void`) was not read as a rune at all, and either way `$signal` reached
// the emitted module. The parser balances everything, and the type argument is skipped whole.

import ts from 'typescript';

/** The three runes a declaration can be initialised with. */
export type RuneKind = 'signal' | 'derived' | 'store';

/** One declarator of a `let/const/var` statement. */
export interface DeclaratorRead {
    /** The rune it is initialised with, or null for an ordinary declarator. */
    kind: RuneKind | null;
    /** The bound name; null for a pattern (`{ a } = …`). */
    name: string | null;
    /**
     * For a rune, the text of its first argument (empty when it has none). A trailing comma,
     * `$derived(a * 2,)`, is not part of it: pasted into `computed(() => a * 2,, …)` it made a module
     * that does not parse (#202).
     */
    arg: string;
    /** The declarator as written: `name: T = expr`, for an ordinary one to be kept as it is. */
    text: string;
}

/** Whether `code` names a rune as a call, with or without a type argument: `$signal(` or `$signal<`. */
export const RUNE_CALL = /\$(?:signal|derived|store)\s*[<(]/;

const RUNE_OF: Record<string, RuneKind> = { $signal: 'signal', $derived: 'derived', $store: 'store' };

/** A statement read: its declarators, and the code that follows it on the same lines, if any. */
export interface StatementRead {
    declarators: DeclaratorRead[];
    /** What the collected lines hold after the statement (`let a = $signal(0); go();` → `go();`). */
    rest: string;
}

/**
 * The declarators of the `let`/`const`/`var` statement `text` starts with, read by the TypeScript
 * parser; null when the text does not parse or does not start with a variable statement — the caller
 * reports it rather than guessing.
 */
export function readDeclarators(text: string): StatementRead | null {
    const sf = ts.createSourceFile('decl.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const diagnostics = (sf as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
    const first = sf.statements[0];
    if (diagnostics.length > 0 || !first || !ts.isVariableStatement(first)) return null;

    const declarators = first.declarationList.declarations.map((d): DeclaratorRead => {
        const name = ts.isIdentifier(d.name) ? d.name.text : null;
        const init = d.initializer;
        if (init && ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text in RUNE_OF) {
            return {
                kind: RUNE_OF[init.expression.text],
                name,
                arg: init.arguments[0]?.getText(sf) ?? '',
                text: d.getText(sf),
            };
        }
        return { kind: null, name, arg: '', text: d.getText(sf) };
    });
    return { declarators, rest: text.slice(first.getEnd()).trim() };
}
