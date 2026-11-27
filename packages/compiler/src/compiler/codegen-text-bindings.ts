// Interpolations that are text, which a block's group of bindings can hold (#1275).
//
// A block's bindings run in one effect, so each re-reads its value when anything ANOTHER one reads
// changes, and writes only when the value differs. For an attribute or a text that is free; for an
// interpolation that renders nodes — a snippet, a fragment, an array — a new value at each read would
// build its nodes again and lose their state. Such an interpolation keeps `bindInterpolation`, whose
// effect re-runs only when what it reads changes. One the compiler can see is text joins the group:
//   - a name the script declares as text: a `@prop` or `@model` whose type is a primitive (string,
//     number, boolean, a union of their literals, with null or undefined), a `$signal` typed so or
//     whose initial value is a primitive literal;
//   - literals and template strings; `+` of text, or of anything with a string; comparisons, `!`,
//     arithmetic, `typeof`; `a ? b : c`, `a ?? b`, `a || b` and `a && b` of text; `.length`;
//   - a call that returns a string: `String(x)`, `Number(x)`, the i18n runes `$t` `$n` `$d` `$r`, and
//     `.toFixed()`, `.toString()`, `.join()` and the other string methods listed below.
// Anything else — another name, a member, an unknown call — may be a node, and keeps its own effect.

import ts from 'typescript';
import type { CompileContext } from './compile-context';
import type { PropInfo, SignalDecl } from './script-analyzer-types';

/** A type that is one primitive: a keyword, or the literal of one. */
// Match: `string`, `number`, `boolean`, `null`, `undefined`, `true`, `false`, a quoted string, a number.
const PRIMITIVE_TYPE = /^(?:string|number|boolean|null|undefined|true|false|'[^']*'|"[^"]*"|-?\d+(?:\.\d+)?)$/;

/** Is `type` a primitive or a union of them: `string`, `'' | 'thin' | 'bold'`, `number | null`? */
export function isPrimitiveType(type: string): boolean {
    const parts = type.split('|').map((p) => p.trim()).filter(Boolean);
    return parts.length > 0 && parts.every((p) => PRIMITIVE_TYPE.test(p));
}

/** A `$signal`'s initial value that is a primitive literal: `0`, `'x'`, `true`, `` `a` ``. */
// Match: a quoted string, a template with no substitution, a number, true, false.
const PRIMITIVE_LITERAL = /^(?:'[^'\\]*'|"[^"\\]*"|`[^`$\\]*`|-?\d+(?:\.\d+)?|true|false)$/;

/** The names the script declares as text: what `isTextExpression` may read. */
export function textNames(props: readonly PropInfo[], signals: readonly SignalDecl[]): Set<string> {
    const names = new Set<string>();
    for (const p of props) if (isPrimitiveType(p.tsType)) names.add(p.name);
    for (const s of signals) {
        if (s.part) continue;
        if (s.type !== undefined ? isPrimitiveType(s.type) : PRIMITIVE_LITERAL.test(s.initialExpr.trim())) names.add(s.name);
    }
    return names;
}

/** Calls that return a string or a number, by the name called. */
const TEXT_CALLS = new Set(['String', 'Number', '$t', '$n', '$d', '$r']);
/** Methods that return a string or a number, on a primitive or an array. */
const TEXT_METHODS = new Set([
    'toFixed', 'toPrecision', 'toString', 'toLocaleString', 'toUpperCase', 'toLowerCase', 'trim', 'trimStart',
    'trimEnd', 'padStart', 'padEnd', 'slice', 'substring', 'replace', 'replaceAll', 'repeat', 'join', 'charAt',
    'indexOf', 'lastIndexOf',
]);

/** Operators whose result is a boolean or a number, whatever their operands. */
const PRIMITIVE_OPERATORS = new Set<ts.SyntaxKind>([
    ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.LessThanToken, ts.SyntaxKind.LessThanEqualsToken,
    ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.GreaterThanEqualsToken, ts.SyntaxKind.MinusToken,
    ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken,
    ts.SyntaxKind.AsteriskAsteriskToken, ts.SyntaxKind.InstanceOfKeyword, ts.SyntaxKind.InKeyword,
]);

/** Is `node` a string literal or a template string: `+` with it is a string. */
function isStringy(node: ts.Expression): boolean {
    while (ts.isParenthesizedExpression(node)) node = node.expression;
    return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node);
}

function text(node: ts.Expression, names: ReadonlySet<string>, shadowed: ReadonlySet<string>): boolean {
    const sub = (n: ts.Expression): boolean => text(n, names, shadowed);
    if (ts.isParenthesizedExpression(node)) return sub(node.expression);
    if (ts.isStringLiteral(node) || ts.isNumericLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) return true;
    switch (node.kind) {
        case ts.SyntaxKind.TrueKeyword: case ts.SyntaxKind.FalseKeyword: case ts.SyntaxKind.NullKeyword: return true;
    }
    if (ts.isIdentifier(node)) return node.text === 'undefined' || (names.has(node.text) && !shadowed.has(node.text));
    if (ts.isTypeOfExpression(node)) return true;
    if (ts.isPrefixUnaryExpression(node)) {
        // ++ and -- write, and are not read here: a template expression does not.
        return node.operator !== ts.SyntaxKind.PlusPlusToken && node.operator !== ts.SyntaxKind.MinusMinusToken;
    }
    if (ts.isConditionalExpression(node)) return sub(node.whenTrue) && sub(node.whenFalse);
    if (ts.isBinaryExpression(node)) {
        const op = node.operatorToken.kind;
        if (PRIMITIVE_OPERATORS.has(op)) return true;
        if (op === ts.SyntaxKind.PlusToken) return isStringy(node.left) || isStringy(node.right) || (sub(node.left) && sub(node.right));
        if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.AmpersandAmpersandToken) {
            return sub(node.left) && sub(node.right);
        }
        return false;
    }
    if (ts.isPropertyAccessExpression(node)) return node.name.text === 'length';
    if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (ts.isIdentifier(callee)) return TEXT_CALLS.has(callee.text) && !shadowed.has(callee.text);
        if (ts.isPropertyAccessExpression(callee)) return TEXT_METHODS.has(callee.name.text);
        return false;
    }
    return false;
}

/**
 * Is the template expression `expr`, as written, text: a value `bindInterpolation` would render as a
 * text node, never as nodes? A name a `@for` or a `@try` binds is not the script's, whatever it shadows.
 */
export function isTextExpression(expr: string, ctx: CompileContext): boolean {
    const sf = ts.createSourceFile('__pdx_text.ts', `(${expr})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const stmt = sf.statements[0];
    if (sf.statements.length !== 1 || !stmt || !ts.isExpressionStatement(stmt)) return false;
    const shadowed = new Set([...ctx.scopeVars, ...ctx.rowVars]);
    return text(stmt.expression, ctx.textNames, shadowed);
}
