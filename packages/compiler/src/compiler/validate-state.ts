// `@state name = expression;` holds a boolean (#132): a state is on or off. The check catches what is
// visibly not one — the case it exists for is `@state count = 0;`, written by someone who means
// Svelte's `$state`, a reactive variable.

import ts from 'typescript';
import type { ScriptAnalysis } from './script-analyzer-types';

/** The expression of `source`, parenthesised away; null when it is not one expression. */
function expressionOf(source: string): ts.Expression | null {
    const file = ts.createSourceFile('state.ts', `(${source});`, ts.ScriptTarget.Latest, false);
    const stmt = file.statements[0];
    if (file.statements.length !== 1 || !stmt || !ts.isExpressionStatement(stmt)) return null;
    let e: ts.Expression = stmt.expression;
    while (ts.isParenthesizedExpression(e)) e = e.expression;
    return e;
}

/** A literal that is not `true` or `false`: a number, a string, a template, an array, an object, null. */
function isNonBooleanLiteral(e: ts.Expression): boolean {
    return ts.isNumericLiteral(e) || ts.isStringLiteralLike(e) || ts.isTemplateExpression(e)
        || ts.isArrayLiteralExpression(e) || ts.isObjectLiteralExpression(e)
        || e.kind === ts.SyntaxKind.NullKeyword
        || (ts.isIdentifier(e) && e.text === 'undefined')
        || (ts.isPrefixUnaryExpression(e) && ts.isNumericLiteral(e.operand));
}

/**
 * Whether a `@state` expression is visibly not a boolean: a non-boolean literal, a `$signal(…)` or
 * `$store(…)` (data, not a condition), or a `$signal` of the script whose initial value is a
 * non-boolean literal. Anything else — a comparison, a call, a `$derived` — is taken as written.
 */
export function stateExprIsNotBoolean(expr: string, analysis: Pick<ScriptAnalysis, 'signals'>): boolean {
    const e = expressionOf(expr);
    if (!e) return false;
    if (isNonBooleanLiteral(e)) return true;
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)
        && (e.expression.text === '$signal' || e.expression.text === '$store')) return true;
    if (ts.isIdentifier(e)) {
        const signal = analysis.signals.find(s => s.name === e.text);
        const initial = signal ? expressionOf(signal.initialExpr) : null;
        return !!initial && isNonBooleanLiteral(initial);
    }
    return false;
}
