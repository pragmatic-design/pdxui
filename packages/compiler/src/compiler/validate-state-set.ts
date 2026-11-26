// `@state name;` (#1436) declares a state the script sets by assignment: `name = on` is
// `ctx.state('name', !!(on))`. Nothing holds its value for the script to read back — CSS reads it with
// `:state(name)` — so a read is an error, and so is a name the script also declares, whose assignments
// would set the variable and not the state.
//   PDX_STATE_READ        — a read in the script or the template, `!shown`, `shown ||= x`, `shown++`
//   PDX_STATE_REDECLARED  — `@state shown;` beside a `let`/`const`/`function shown` of the script

import ts from 'typescript';
import type { ScriptAnalysis } from './script-analyzer';
import type { ValidationWarning } from './validate';
import { collectBlockBindings, isReadPosition, scopeBindings } from './signal-rewrite-ast';

/** The names of `names` that `code` reads, outside a scope that declares them. */
function readsIn(code: string, names: ReadonlySet<string>): Set<string> {
    const found = new Set<string>();
    const sf = ts.createSourceFile('state-reads.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const scopes: Set<string>[] = [new Set(collectBlockBindings(sf.statements))];
    const visible = (n: string): boolean => names.has(n) && !scopes.some(s => s.has(n));
    const visit = (node: ts.Node): void => {
        const frame = scopeBindings(node);
        if (frame) scopes.push(new Set(frame));
        if (ts.isIdentifier(node) && visible(node.text) && readsValue(node)) found.add(node.text);
        ts.forEachChild(node, visit);
        if (frame) scopes.pop();
    };
    visit(sf);
    return found;
}

/** A read, or a write that reads first: every assignment but a plain `=` (`x ||= y`, `x += 1`, `x++`). */
function readsValue(id: ts.Identifier): boolean {
    const p = id.parent;
    if (ts.isBinaryExpression(p) && p.left === id) return p.operatorToken.kind !== ts.SyntaxKind.EqualsToken
        && p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
    if ((ts.isPostfixUnaryExpression(p) || ts.isPrefixUnaryExpression(p)) && p.operand === id) return true;
    return isReadPosition(id);
}

/**
 * PDX_STATE_READ for each `@state name;` the script (`scriptPieces`, each parsed on its own) or the
 * template (`templateIds`) reads; PDX_STATE_REDECLARED for each the script also declares (`declared`).
 */
export function checkSetStates(
    analysis: ScriptAnalysis,
    scriptPieces: readonly string[],
    templateIds: ReadonlySet<string>,
    declared: ReadonlySet<string>,
): ValidationWarning[] {
    const names = new Set(analysis.states.filter(s => s.expr === undefined).map(s => s.name));
    if (names.size === 0) return [];
    const out: ValidationWarning[] = [];
    const redeclared = new Set([...names].filter(n => declared.has(n)));
    for (const name of redeclared) {
        out.push({
            code: 'PDX_STATE_REDECLARED',
            severity: 'error',
            message: `'${name}' is both @state ${name}; and a declaration of the script: an assignment would set the variable, not the state.`,
            hint: `Rename one of them, or set the state from the variable: @state ${name} = expression;`,
        });
    }
    const read = new Set<string>();
    for (const piece of scriptPieces) for (const n of readsIn(piece, names)) read.add(n);
    for (const id of templateIds) if (names.has(id)) read.add(id);
    for (const name of read) {
        if (redeclared.has(name)) continue;
        out.push({
            code: 'PDX_STATE_READ',
            severity: 'error',
            message: `@state '${name}' is read, but a state declared with no expression is only set: \`${name} = on\` is ctx.state('${name}', on), and nothing holds the value to read back.`,
            hint: `Keep the value in a $signal and follow it: let ${name}On = $signal(false); @state ${name} = ${name}On; — or, in CSS, read :state(${name}).`,
        });
    }
    return out;
}
