// PDX_SCRIPT_EXPORT: an `export` in a component's script (#551).
//
// The script is the body of `setup(ctx)`, run once per instance, and an `export` inside a function is
// a syntax error: the module failed to load in the browser, far from the line, and the compiler said
// nothing. A component's script has nothing a module could export, so each value export is an error
// at its line, and the setup gets the declaration without its `export` — the module still parses, and
// the name is the component's own. A type export is erased like any type. A @store module lifts its
// exports instead (store-exports.ts), and is not checked here.

import ts from 'typescript';
import type { SFCDescriptor } from '../parser/sfc';
import type { ValidationWarning } from './validate';
import { withoutDeclarations } from './validate-rune-position';

/** A statement's modifiers, none when it cannot have any. */
const modifiersOf = (stmt: ts.Statement): readonly ts.Modifier[] =>
    (ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) : undefined) ?? [];

/** A statement's `export` modifier, or null. */
function exportModifier(stmt: ts.Statement): ts.Modifier | null {
    return modifiersOf(stmt).find((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? null;
}

/** Whether a top-level statement exports a value: a type, or a `declare`, exports nothing at run time. */
function exportsValue(stmt: ts.Statement): boolean {
    if (ts.isExportAssignment(stmt)) return true;
    if (ts.isExportDeclaration(stmt)) return !stmt.isTypeOnly;
    if (!exportModifier(stmt)) return false;
    if (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) return false;
    return !modifiersOf(stmt).some((m) => m.kind === ts.SyntaxKind.DeclareKeyword);
}

/** Every value export of `code`, with where its `export` starts. */
function valueExports(code: string): { stmt: ts.Statement; sf: ts.SourceFile }[] {
    if (!/\bexport\b/.test(code)) return [];
    const sf = ts.createSourceFile('__pdx_exports.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    return sf.statements.filter(exportsValue).map((stmt) => ({ stmt, sf }));
}

/** Blank `code` from `at` to `end` to spaces, newlines kept. */
const blank = (code: string, at: number, end: number): string =>
    code.slice(0, at) + code.slice(at, end).replace(/[^\n]/g, ' ') + code.slice(end);

/**
 * The setup body without its value exports, same length and lines: `export const x` loses its
 * `export` (and `export default function f` its `default`), and `export { a }` or `export default 1`
 * goes whole, since it declares nothing.
 */
export function dropScriptExports(body: string): string {
    let out = body;
    for (const { stmt, sf } of valueExports(body)) {
        const modifier = exportModifier(stmt);
        if (!modifier) { out = blank(out, stmt.getStart(sf), stmt.end); continue; }
        const dflt = modifiersOf(stmt).find((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
        out = blank(out, modifier.getStart(sf), (dflt ?? modifier).end);
    }
    return out;
}

/** Every value export of a component's script, as PDX_SCRIPT_EXPORT at its line. */
export function validateScriptExports(descriptor: SFCDescriptor, source: string, isStore: boolean): ValidationWarning[] {
    const script = descriptor.script && !descriptor.script.src ? descriptor.script : null;
    if (!script || isStore) return [];
    return valueExports(withoutDeclarations(script.content).code).map(({ stmt, sf }) => {
        const at = script.start + stmt.getStart(sf);
        const before = source.slice(0, at);
        return {
            code: 'PDX_SCRIPT_EXPORT',
            severity: 'error' as const,
            message: 'An `export` in a component script: the script runs once per instance, inside the component, where there is nothing to export. It is compiled without the `export`.',
            hint: 'Move what you meant to share into a .ts module and import it from there.',
            line: before.split('\n').length,
            column: at - before.lastIndexOf('\n'),
        };
    });
}
