// Where a "late" $signal is declared in the setup body.
//
// A signal whose initial value reads a top-level local of the script cannot be declared before the
// body, where the other signals go: the local is declared there. Emitted after the WHOLE body, a
// top-level statement written after it, and reading it, would run in its temporal dead zone.
// The right place is just after the statement that declares the last local it reads: the earliest
// point its initializer can run, and never later than where the author wrote it.
//
// A late $derived is placed the same way: emitted after the whole body, a top-level `effect()` that
// read it would throw `Cannot access '<name>' before initialization`.

import ts from 'typescript';

interface LateSignal {
    name: string;
    initialExpr: string;
    /**
     * Where it goes when it reads nothing the body declares: the end of the body (a late signal, whose
     * locals are declared only in nested scopes) or its start (a derived after the before-body
     * prefix only because an EARLIER one reads a local).
     */
    unplaced?: 'end' | 'start';
}

const reads = (expr: string, name: string): boolean => new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(expr);

/**
 * The signals that must wait for the body: those reading a body-local, and — transitively — those
 * reading such a signal. A signal reading a late one and declared before the body would read it in
 * its dead zone.
 */
export function lateSignals<S extends LateSignal>(signals: S[], bodyLocals: Set<string>): Set<string> {
    const late = new Set<string>();
    for (const s of signals) if ([...bodyLocals].some((n) => reads(s.initialExpr, n))) late.add(s.name);
    let grew = true;
    while (grew) {
        grew = false;
        for (const s of signals) {
            if (late.has(s.name)) continue;
            if ([...late].some((n) => reads(s.initialExpr, n))) { late.add(s.name); grew = true; }
        }
    }
    return late;
}

/** The names a top-level statement declares: variables (destructuring included), functions, classes. */
function declaredNames(stmt: ts.Statement): string[] {
    const out: string[] = [];
    const bind = (n: ts.BindingName): void => {
        if (ts.isIdentifier(n)) { out.push(n.text); return; }
        for (const el of n.elements) if (!ts.isOmittedExpression(el)) bind(el.name);
    };
    if (ts.isVariableStatement(stmt)) for (const d of stmt.declarationList.declarations) bind(d.name);
    else if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) && stmt.name) out.push(stmt.name.text);
    return out;
}

/**
 * For each late signal, in source order, the offset in `body` after which it is declared: the end of
 * the top-level statement that declares the last local it reads, or of the late signal it reads, if
 * that comes later. A signal whose locals are declared only inside nested scopes keeps the end of the
 * body. `null` when the body does not parse: the caller keeps that placement.
 */
export function lateSignalOffsets(body: string, signals: LateSignal[]): Map<string, number> | null {
    const sf = ts.createSourceFile('__pdx_setup.ts', body, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
    const diags = (sf as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics;
    if (diags && diags.length > 0) return null;
    const declaredAt = new Map<string, number>();
    for (const stmt of sf.statements) for (const n of declaredNames(stmt)) if (!declaredAt.has(n)) declaredAt.set(n, stmt.end);
    const offsets = new Map<string, number>();
    for (const s of signals) {
        let at = -1;
        for (const [n, end] of declaredAt) if (reads(s.initialExpr, n)) at = Math.max(at, end);
        for (const [n, end] of offsets) if (reads(s.initialExpr, n)) at = Math.max(at, end);
        offsets.set(s.name, at !== -1 ? at : s.unplaced === 'start' ? 0 : body.length);
    }
    return offsets;
}

const MARKER = (i: number): string => `/*@pdx-late-signal:${i}*/`;
const MARKER_LINE = /^[ \t]*\/\*@pdx-late-signal:(\d+)\*\/[ \t]*$/gm;

/**
 * `body` with a marker comment on its own line where each late signal goes. Comments are trivia, so
 * the markers survive the signal rewrite; `replaceLateSignalMarkers` turns them into declarations.
 */
export function insertLateSignalMarkers(body: string, signals: LateSignal[], offsets: Map<string, number>): string {
    const cuts = signals.map((s, i) => ({ at: offsets.get(s.name)!, i }))
        .sort((a, b) => b.at - a.at || b.i - a.i);
    let out = body;
    for (const { at, i } of cuts) {
        // The rest of the statement's line — a trailing comment, in a script without semicolons —
        // goes on a line of its own, or the marker would not be one and would never be replaced.
        const restOfLine = out.slice(at, out.indexOf('\n', at) < 0 ? out.length : out.indexOf('\n', at));
        out = `${out.slice(0, at)}\n${MARKER(i)}${restOfLine.trim() ? '\n' : ''}${out.slice(at)}`;
    }
    return out;
}

/** Replaces each marker line with the declaration `declare(i)` emits for the i-th late signal. */
export function replaceLateSignalMarkers(code: string, declare: (i: number) => string): string {
    return code.replace(MARKER_LINE, (_line, i: string) => declare(Number(i)));
}
