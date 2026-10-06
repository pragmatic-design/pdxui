// The first argument of `$watch`, as `watch()` has to receive it.

import ts from 'typescript';
import { findClosing, skipNonCode } from './tokenizer';

/**
 * Emit a `$watch` source for `watch()`.
 *
 * A source the rewrite CHANGED reads something reactive, and a read is a value taken once in setup:
 * it is emitted as a getter, which `watch()` tracks. An untouched source — a plain
 * `const` signal — is passed as it is.
 *
 * An ARRAY LITERAL is a list of sources, and each element gets that rule on its own:
 * `[a, b]` → `[() => __a(), () => __b()]`. Wrapped whole, it would be one getter returning a new
 * array on every run, which `watch()` compares with `Object.is` — always «changed», so the callback
 * would run on the first run and on every re-run over equal values.
 */
export function emitWatchSource(source: string, rewrite: (expr: string) => string): string {
    const elements = arrayElements(source);
    if (elements) return `[${elements.map((e) => one(e, rewrite)).join(', ')}]`;
    return one(source, rewrite);
}

function one(expr: string, rewrite: (expr: string) => string): string {
    const rewritten = rewrite(expr);
    // A source that is already a getter — `() => open`, `function () { return x; }`, the form core's
    // `watch(getter, cb)` and Vue teach — is a getter once rewritten: wrapped again it would hand
    // watch() `() => () => open()`, whose value is the inner arrow, and the callback would never run.
    if (isFunction(expr)) return rewritten;
    return rewritten === expr ? rewritten : `() => ${rewritten}`;
}

/** True when the whole of `expr` is an arrow function or a function expression. */
function isFunction(expr: string): boolean {
    const sf = ts.createSourceFile('__pdx_watch.ts', `(${expr})`, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
    const st = sf.statements[0];
    if (sf.statements.length !== 1 || !st || !ts.isExpressionStatement(st)) return false;
    let e: ts.Expression = st.expression;
    while (ts.isParenthesizedExpression(e)) e = e.expression;
    return ts.isArrowFunction(e) || ts.isFunctionExpression(e);
}

/**
 * The elements of `source` when the whole of it is ONE array literal, else null. `rows[0]` and
 * `[a][0]` are not lists: the bracket that opens the source must close it.
 */
function arrayElements(source: string): string[] | null {
    const s = source.trim();
    if (!s.startsWith('[') || findClosing(s, 0) !== s.length - 1) return null;
    const inner = s.slice(1, -1);
    const out: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < inner.length; i++) {
        const skip = skipNonCode(inner, i);
        if (skip !== null) { i = skip - 1; continue; }
        const ch = inner[i];
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') depth--;
        else if (ch === ',' && depth === 0) { out.push(inner.slice(start, i).trim()); start = i + 1; }
    }
    const last = inner.slice(start).trim();
    if (last) out.push(last);
    return out.length > 0 ? out : null;
}
