// The exported declarations of a @store module, lifted out of the store's factory.
//
// A @store module is lowered into `createGlobalStore(name, () => { …body… })`. The body cannot
// carry every statement of the script: an `export const` inside a function is a syntax error at
// load, with no word from the compiler. An exported declaration is not store state:
// it belongs to the module, and is emitted above the factory.

import ts from 'typescript';
import type { ScriptAnalysis } from './script-analyzer-types';
import type { ValidationWarning } from './validate';

export interface LiftedStoreExports {
    /** The body with each lifted statement blanked — same length, same lines, so origins still hold. */
    body: string;
    /** The lifted statements, as written, in source order. */
    statements: string[];
    /** The names they declare, which the store does not return. */
    names: Set<string>;
    /** An export that reads what the store owns cannot live outside it. */
    warnings: ValidationWarning[];
}

function isExported(stmt: ts.Statement): boolean {
    if (ts.isExportDeclaration(stmt) || ts.isExportAssignment(stmt)) return true;
    return ts.canHaveModifiers(stmt) && (ts.getModifiers(stmt) ?? []).some(m => m.kind === ts.SyntaxKind.ExportKeyword);
}

/** The names a top-level statement declares. */
function declaredBy(stmt: ts.Statement): string[] {
    if (ts.isVariableStatement(stmt)) {
        const out: string[] = [];
        const visit = (n: ts.BindingName) => {
            if (ts.isIdentifier(n)) out.push(n.text);
            else for (const el of n.elements) if (!ts.isOmittedExpression(el)) visit(el.name);
        };
        for (const d of stmt.declarationList.declarations) visit(d.name);
        return out;
    }
    if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) || ts.isEnumDeclaration(stmt)) && stmt.name) return [stmt.name.text];
    return [];
}

/**
 * The free names a statement reads: identifiers in expression position, minus those the statement
 * itself declares anywhere inside it (its parameters, its locals). A shadowing parameter named like a
 * store signal is the statement's own, not a read of the store.
 */
function namesRead(stmt: ts.Statement): Set<string> {
    const read = new Set<string>();
    const local = new Set<string>(declaredBy(stmt));
    const visit = (n: ts.Node) => {
        if ((ts.isParameter(n) || ts.isVariableDeclaration(n) || ts.isBindingElement(n)) && ts.isIdentifier(n.name)) local.add(n.name.text);
        if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isClassDeclaration(n)) && n.name) local.add(n.name.text);
        if (ts.isIdentifier(n)) {
            const p = n.parent;
            const isName = (ts.isPropertyAccessExpression(p) && p.name === n)
                || ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p)
                    || ts.isPropertySignature(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p)) && p.name === n)
                || (ts.isBindingElement(p) && p.propertyName === n)
                || (ts.isExportSpecifier(p) && p.name === n && p.propertyName !== undefined);
            if (!isName) read.add(n.text);
        }
        ts.forEachChild(n, visit);
    };
    visit(stmt);
    for (const name of local) read.delete(name);
    return read;
}

/**
 * Lift the top-level `export` statements out of a @store body. Each is blanked in place (its
 * characters turned to spaces, its newlines kept) and returned to be emitted at module level.
 * An export that reads a name the store owns — a signal, a derived, a function or constant of the
 * body — would throw a ReferenceError out there, so it is reported as `PDX_STORE_EXPORT`.
 */
export function liftStoreExports(analysis: ScriptAnalysis, filename: string): LiftedStoreExports {
    const body = analysis.body;
    const none: LiftedStoreExports = { body, statements: [], names: new Set(), warnings: [] };
    if (!body || !/\bexport\b/.test(body)) return none;

    const sf = ts.createSourceFile(filename, body, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const lifted = sf.statements.filter(isExported);
    if (lifted.length === 0) return none;

    const names = new Set(lifted.flatMap(declaredBy));
    // What the store owns: its runes, and every top-level declaration of the body that stays inside.
    const owned = new Set<string>([
        ...analysis.signals.map(s => s.name),
        ...analysis.deriveds.map(d => d.name),
        ...analysis.stores.map(s => s.name),
        ...analysis.forms.map(f => f.name),
        ...analysis.exports.map(e => e.name),
        ...sf.statements.filter(s => !isExported(s)).flatMap(declaredBy),
    ]);
    for (const n of names) owned.delete(n);

    const warnings: ValidationWarning[] = [];
    const statements: string[] = [];
    let out = body;
    for (const stmt of lifted) {
        const start = stmt.getStart(sf, true);
        const text = body.slice(start, stmt.end);
        statements.push(text);
        out = out.slice(0, start) + text.replace(/[^\n]/g, ' ') + out.slice(stmt.end);
        const reads = [...namesRead(stmt)].filter(n => owned.has(n));
        if (reads.length > 0) {
            // The statement's first line in backticks: position-warnings.ts finds the finding's line by it.
            const firstLine = text.split('\n')[0].trim();
            warnings.push({
                code: 'PDX_STORE_EXPORT', severity: 'error',
                message: `The export \`${firstLine}\` of a @store module reads ${reads.map(r => `'${r}'`).join(', ')}, which the store owns. Exports are emitted outside the store, where its own names do not exist.`,
                hint: `Reach the store through its hook (use${capitalize(analysis.globalStore?.name ?? 'Store')}()), or move the export to its own module.`,
            });
        }
    }
    return { body: out, statements, names, warnings };
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
