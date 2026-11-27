// The value a binding has at mount, with the props at their defaults (#1275).
//
// A block's group writes each binding at its first run. With the props at their defaults — a component
// mounted with no attribute, which is most of a page's instances — most of those values are known when
// the component compiles: `legend || collapsible ? '' : 'display:none'` is 'display:none' with
// `legend = ''` and `collapsible = false`. The compiler writes such a value into the static markup and
// gives it to `bindGroup`, and the first run writes nothing for it. Measured on pdx-fieldset: its whole
// mount, the frame after it included, 0.80–0.86× its TypeScript version's with the group alone,
// 0.72–0.77× with the values in the markup.
//
// It is a prediction, and a wrong one costs one write, never a wrong page: the binding still reads its
// value at the first run, and writes it when it differs — an attribute on the host, a signal the setup
// changed, a branch of an `@if` rendered under another state.
//
// Known: literals and template strings of known parts; the script's props with a literal default and
// its `$signal`s with a literal initial value; `!`, unary `-`/`+`, `===` `!==` `==` `!=` `<` `<=` `>`
// `>=`, `+`, `a ? b : c`, `a || b`, `a && b`, `a ?? b` of known values. Anything else is not known.

import ts from 'typescript';
import type { CompileContext } from './compile-context';
import type { PropInfo, SignalDecl } from './script-analyzer-types';

/** A value the compiler knows at mount. */
export type MountValue = string | number | boolean | null | undefined;

/** Not known at compile time. */
const UNKNOWN = Symbol('unknown');
type Evaluated = MountValue | typeof UNKNOWN;

function parse(expr: string): ts.Expression | null {
    const sf = ts.createSourceFile('__pdx_mount.ts', `(${expr})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const stmt = sf.statements[0];
    return sf.statements.length === 1 && stmt && ts.isExpressionStatement(stmt) ? stmt.expression : null;
}

function evaluate(node: ts.Expression, env: ReadonlyMap<string, MountValue>, shadowed: ReadonlySet<string>): Evaluated {
    const sub = (n: ts.Expression): Evaluated => evaluate(n, env, shadowed);
    if (ts.isParenthesizedExpression(node)) return sub(node.expression);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    switch (node.kind) {
        case ts.SyntaxKind.TrueKeyword: return true;
        case ts.SyntaxKind.FalseKeyword: return false;
        case ts.SyntaxKind.NullKeyword: return null;
    }
    if (ts.isIdentifier(node)) {
        if (node.text === 'undefined') return undefined;
        return !shadowed.has(node.text) && env.has(node.text) ? env.get(node.text) : UNKNOWN;
    }
    if (ts.isTemplateExpression(node)) {
        let s = node.head.text;
        for (const span of node.templateSpans) {
            const v = sub(span.expression);
            if (v === UNKNOWN) return UNKNOWN;
            s += String(v) + span.literal.text;
        }
        return s;
    }
    if (ts.isPrefixUnaryExpression(node)) {
        const v = sub(node.operand);
        if (v === UNKNOWN) return UNKNOWN;
        switch (node.operator) {
            case ts.SyntaxKind.ExclamationToken: return !v;
            case ts.SyntaxKind.MinusToken: return typeof v === 'number' ? -v : UNKNOWN;
            case ts.SyntaxKind.PlusToken: return typeof v === 'number' ? v : UNKNOWN;
            default: return UNKNOWN;
        }
    }
    if (ts.isConditionalExpression(node)) {
        const c = sub(node.condition);
        return c === UNKNOWN ? UNKNOWN : sub(c ? node.whenTrue : node.whenFalse);
    }
    if (ts.isBinaryExpression(node)) {
        const op = node.operatorToken.kind;
        const l = sub(node.left);
        if (l === UNKNOWN) return UNKNOWN;
        // The short circuits read the right side only when it decides.
        if (op === ts.SyntaxKind.BarBarToken) return l ? l : sub(node.right);
        if (op === ts.SyntaxKind.AmpersandAmpersandToken) return l ? sub(node.right) : l;
        if (op === ts.SyntaxKind.QuestionQuestionToken) return l ?? sub(node.right);
        const r = sub(node.right);
        if (r === UNKNOWN) return UNKNOWN;
        switch (op) {
            case ts.SyntaxKind.EqualsEqualsEqualsToken: return l === r;
            case ts.SyntaxKind.ExclamationEqualsEqualsToken: return l !== r;
            case ts.SyntaxKind.EqualsEqualsToken: return l == r;
            case ts.SyntaxKind.ExclamationEqualsToken: return l != r;
            case ts.SyntaxKind.LessThanToken: return (l as number) < (r as number);
            case ts.SyntaxKind.LessThanEqualsToken: return (l as number) <= (r as number);
            case ts.SyntaxKind.GreaterThanToken: return (l as number) > (r as number);
            case ts.SyntaxKind.GreaterThanEqualsToken: return (l as number) >= (r as number);
            case ts.SyntaxKind.PlusToken:
                if (typeof l === 'string' || typeof r === 'string') return String(l) + String(r);
                return typeof l === 'number' && typeof r === 'number' ? l + r : UNKNOWN;
            default: return UNKNOWN;
        }
    }
    return UNKNOWN;
}

/** The value of a literal expression with no names: a default, an initial value. */
function literalValue(expr: string | undefined): Evaluated {
    if (expr === undefined) return UNKNOWN;
    const node = parse(expr);
    return node ? evaluate(node, new Map(), new Set()) : UNKNOWN;
}

/** The names a template reads whose value at mount is known: props with a literal default, `$signal`s. */
export function mountValues(props: readonly PropInfo[], signals: readonly SignalDecl[]): Map<string, MountValue> {
    const env = new Map<string, MountValue>();
    for (const p of props) {
        const v = literalValue(p.default);
        if (v !== UNKNOWN) env.set(p.name, v);
    }
    for (const s of signals) {
        if (s.part) continue;
        const v = literalValue(s.initialExpr);
        if (v !== UNKNOWN) env.set(s.name, v);
    }
    return env;
}

/**
 * The value the template expression `expr`, as written, has at mount with the props at their defaults,
 * or `{ known: false }`. A name a `@for` or a `@try` binds is not the script's, whatever it shadows.
 */
export function mountValue(expr: string, ctx: CompileContext): { known: true; value: MountValue } | { known: false } {
    if (ctx.mountValues.size === 0 && !/['"`\d]|\b(?:true|false|null)\b/.test(expr)) return { known: false };
    const node = parse(expr);
    if (!node) return { known: false };
    const v = evaluate(node, ctx.mountValues, new Set([...ctx.scopeVars, ...ctx.rowVars]));
    return v === UNKNOWN ? { known: false } : { known: true, value: v };
}
