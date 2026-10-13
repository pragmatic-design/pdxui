// Bindings that can never change, written once with no effect (#110).
//
// An effect over a value that cannot change is right, only wasteful: on a list it is one closure and
// one set of dependency bookkeeping per row that never re-runs. Two kinds of binding are constant:
//   - an expression of literals only: `'x'`, `1 + 2`, `true ? 'a' : 'b'`, and of the script's top-level
//     `const`s whose value is itself literals only. A call is never one, even of literals — `$t('key')`
//     reads the locale — and neither is any other name: an imported store reads signals;
//   - inside a `@for`, the loop's `track` expression, alone or with literals (`'kpi-' + k.key`): a row
//     with a different key is a different row, so a row's key is the same while the row exists.
// Everything else keeps its effect.

import ts from 'typescript';
import type { CompileContext } from './compile-context';
import { bindingNames } from './codegen-prefix';
import { maskNonCode } from './tokenizer';

/** The keywords a literal expression may contain as words. */
const LITERAL_NAMES = new Set(['true', 'false', 'null']);

/** Whitespace removed, so `row.id` and `row . id` are the same expression. */
const normalize = (expr: string): string => expr.replace(/\s+/g, '');

/** The names an expression starts a path with — `row` in `row.id`, not `id`. */
function rootNames(expr: string): string[] {
    // Match: an identifier not preceded by `.` (a member name is not a reference). Groups: [1]=name
    return [...expr.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)/g)].map(m => m[1]);
}

/**
 * Is `node` made of literals and row keys only: no other name, no call, no assignment? `keys` are the
 * track expressions in scope, whitespace removed; a sub-expression that is exactly one of them counts
 * as a literal, so `'kpi-' + k.key` under `track k.key` is constant.
 */
function literalOnly(node: ts.Node, sf: ts.SourceFile, keys: readonly string[]): boolean {
    if (keys.length > 0 && keys.includes(normalize(node.getText(sf)))) return true;
    const sub = (n: ts.Node): boolean => literalOnly(n, sf, keys);
    switch (node.kind) {
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NumericLiteral:
        case ts.SyntaxKind.BigIntLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        case ts.SyntaxKind.TrueKeyword:
        case ts.SyntaxKind.FalseKeyword:
        case ts.SyntaxKind.NullKeyword:
            return true;
        case ts.SyntaxKind.ParenthesizedExpression:
            return sub((node as ts.ParenthesizedExpression).expression);
        case ts.SyntaxKind.PrefixUnaryExpression: {
            const op = (node as ts.PrefixUnaryExpression).operator;
            // ++ and -- write: never a literal expression.
            if (op === ts.SyntaxKind.PlusPlusToken || op === ts.SyntaxKind.MinusMinusToken) return false;
            return sub((node as ts.PrefixUnaryExpression).operand);
        }
        case ts.SyntaxKind.BinaryExpression: {
            const b = node as ts.BinaryExpression;
            const op = b.operatorToken.kind;
            if (op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment) return false;
            return sub(b.left) && sub(b.right);
        }
        case ts.SyntaxKind.ConditionalExpression: {
            const c = node as ts.ConditionalExpression;
            return sub(c.condition) && sub(c.whenTrue) && sub(c.whenFalse);
        }
        default:
            return false;
    }
}

/** Is the template expression `expr` made of literals, and of the row keys `keys`, only? */
export function isLiteralExpression(expr: string, keys: readonly string[] = []): boolean {
    const text = expr.trim();
    if (!text) return false;
    // Most bindings name a signal: a name that is neither a literal keyword nor the start of a key
    // settles it without a parse. Strings are blanked first, by the tokenizer's linear scan, so their
    // words are not names. A template literal's `${…}` is blanked with it: the parse below settles it.
    const unquoted = maskNonCode(text);
    const keyRoots = new Set(keys.flatMap(rootNames));
    if (rootNames(unquoted).some(n => !LITERAL_NAMES.has(n) && !keyRoots.has(n))) return false;
    const sf = ts.createSourceFile('__pdx_constant.ts', `(${text});`, ts.ScriptTarget.Latest, true);
    const statement = sf.statements[0];
    if (sf.statements.length !== 1 || !statement || !ts.isExpressionStatement(statement)) return false;
    return literalOnly(statement.expression, sf, keys);
}

/**
 * Generate a `@for` body with its track key known as constant. A key of an outer loop whose names
 * the inner loop declares again is dropped for the inner body: there, `row.id` reads the inner row.
 */
export function withRowKey<T>(node: { item: string; index?: string; track: string }, ctx: CompileContext, generate: () => T): T {
    const names = [...bindingNames(node.item), ...(node.index ? [node.index] : [])];
    const outer = ctx.rowKeys.slice();
    const kept = outer.filter(key => !rootNames(key).some(n => names.includes(n)));
    ctx.rowKeys.length = 0;
    ctx.rowKeys.push(...kept);
    if (node.track.trim()) ctx.rowKeys.push(normalize(node.track));
    try {
        return generate();
    } finally {
        ctx.rowKeys.length = 0;
        ctx.rowKeys.push(...outer);
    }
}

/**
 * The names the script declares at its top level with `const` and a value of literals only —
 * `const MAX = 10;` — which the template reads as values that cannot change. A destructuring, a `let`
 * and anything initialised by a call or a name are left out.
 */
export function literalConstNames(script: string): Set<string> {
    const names = new Set<string>();
    const sf = ts.createSourceFile('__pdx_consts.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    for (const statement of sf.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        if (!(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
        for (const d of statement.declarationList.declarations) {
            if (ts.isIdentifier(d.name) && d.initializer && literalOnly(d.initializer, sf, [])) names.add(d.name.text);
        }
    }
    return names;
}

/** Can the binding written `expr` in the template never change where it is? */
export function isConstantBinding(expr: string, ctx: CompileContext): boolean {
    // A literal const counts as a literal — unless a loop or a boundary has put the same name in scope.
    const consts = [...ctx.literalConsts].filter(n => !ctx.scopeVars.has(n));
    return isLiteralExpression(expr, consts.length > 0 ? [...ctx.rowKeys, ...consts] : ctx.rowKeys);
}
