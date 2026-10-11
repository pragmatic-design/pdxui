// PDX_SIGNAL_MUTATED_IN_PLACE — a $signal's value changed in place updates nothing (#151).
//
// A signal notifies when it is SET, and `set` compares with Object.is: `items.push(x)` on a
// `$signal([])` mutates the array the signal already holds, so no `set` runs and nothing that reads
// `items` updates. The rewriter only rewrites assignments to the name itself, so this is valid
// JavaScript that compiles and does nothing visible. Reported where it is written, over the script's
// TypeScript tree; `push` and a one-level property assignment carry the fix to the immutable form. A
// $store is a proxy, where in-place mutation is the point, and is not in the set of names checked.

import ts from 'typescript';
import type { SFCDescriptor } from '../parser/sfc';
import type { ScriptAnalysis } from './script-analyzer-types';
import type { ValidationWarning, FixProposal } from './validate';
import { parseableScript } from './validate-design';

/** Array, Map and Set methods that change the object they are called on. */
const MUTATING_METHODS = new Set([
    'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin',
    'set', 'delete', 'clear', 'add',
]);

/** The identifier a member chain starts at: `a.b[0].c` → `a`. Null through a call or anything else. */
function memberRoot(e: ts.Expression): ts.Identifier | null {
    let cur: ts.Expression = e;
    for (;;) {
        if (ts.isIdentifier(cur)) return cur;
        if (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur)) cur = cur.expression;
        else if (ts.isParenthesizedExpression(cur) || ts.isNonNullExpression(cur)) cur = cur.expression;
        else return null;
    }
}

/** True when a parameter or a declaration between `node` and the script's top level names `name`. */
function isShadowed(node: ts.Node, name: string): boolean {
    const binds = (n: ts.BindingName): boolean => ts.isIdentifier(n)
        ? n.text === name
        : n.elements.some(el => ts.isBindingElement(el) && binds(el.name));
    for (let p: ts.Node | undefined = node.parent; p && !ts.isSourceFile(p); p = p.parent) {
        if (ts.isFunctionLike(p) && p.parameters.some(prm => binds(prm.name))) return true;
        if (ts.isBlock(p) || ts.isCaseClause(p) || ts.isDefaultClause(p)) {
            for (const st of p.statements) {
                if (ts.isVariableStatement(st) && st.declarationList.declarations.some(d => binds(d.name))) return true;
                if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name?.text === name) return true;
            }
        }
        if ((ts.isForStatement(p) || ts.isForOfStatement(p) || ts.isForInStatement(p))
            && p.initializer && ts.isVariableDeclarationList(p.initializer)
            && p.initializer.declarations.some(d => binds(d.name))) return true;
        if (ts.isCatchClause(p) && p.variableDeclaration && binds(p.variableDeclaration.name)) return true;
    }
    return false;
}

/** The names the template binds an element to: `:ref="name"` and `ref="name"`. */
function refTargets(template: string): Set<string> {
    const out = new Set<string>();
    // Match: a ref attribute with a bare identifier value. Groups: [1]=the name
    for (const m of template.matchAll(/(?:^|\s):?ref\s*=\s*["']\s*([A-Za-z_$][\w$]*)\s*["']/g)) out.add(m[1]);
    return out;
}

/** What a write changes: the left of `x.y = …` / `x.y += …`, the operand of `x.y++`. */
function writeTarget(n: ts.Node): ts.Expression | null {
    if (ts.isBinaryExpression(n)
        && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return n.left;
    if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n))
        && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)) return n.operand;
    return null;
}

/**
 * The script's in-place mutations of a $signal value, each positioned in the .pdx, with a fix where
 * the immutable form is one rewrite of the statement.
 */
export function validateSignalMutation(descriptor: SFCDescriptor, analysis: ScriptAnalysis | null, source: string): ValidationWarning[] {
    const script = descriptor.script;
    // A `:ref` target holds an element (or a component's host), and setting its properties —
    // `bar.style.width = …`, `dialog.open = true` — is what it is for, not state the signal tracks.
    const refs = refTargets(descriptor.template?.content ?? '');
    const signals = new Set((analysis?.signals ?? []).map(s => s.name).filter(n => !refs.has(n)));
    // A script read from another file has no offsets in this one: its findings could not be placed.
    if (!script || script.src || signals.size === 0 || !script.content.trim()) return [];
    const sf = parseableScript(script.content);
    /** Offset in the .pdx of a node's start, or of a script offset. */
    const fileOffset = (scriptOffset: number): number => script.start + scriptOffset;
    const text = (n: ts.Node): string => script.content.slice(n.getStart(sf), n.getEnd());
    const warnings: ValidationWarning[] = [];

    const report = (n: ts.Node, name: string, what: string, fix?: FixProposal): void => {
        const offset = fileOffset(n.getStart(sf));
        const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
        warnings.push({
            code: 'PDX_SIGNAL_MUTATED_IN_PLACE',
            severity: 'warn',
            message: `'${name}' is a $signal, and ${what} changes its value in place: the signal is never set, so nothing that reads '${name}' updates.`,
            hint: `Assign a new value instead — ${name} = [...${name}, x] for a push, ${name} = { ...${name}, field: v } for a field. `
                + `A value meant to be changed in place is a $store.`,
            line: source.slice(0, offset).split('\n').length,
            column: offset - lineStart + 1,
            fix,
        });
    };

    /** `x.push(a, b);` as a statement → `x = [...x, a, b];`. */
    const pushFix = (call: ts.CallExpression, name: string): FixProposal | undefined => {
        if (!ts.isExpressionStatement(call.parent)) return undefined;
        const args = call.arguments.map(text).join(', ');
        return {
            title: `Assign '${name}' a new array`,
            edits: [{ start: fileOffset(call.getStart(sf)), end: fileOffset(call.getEnd()), newText: `${name} = [...${name}, ${args}]` }],
        };
    };

    /** `x.field = v;` as a statement → `x = { ...x, field: v };`. */
    const fieldFix = (assign: ts.BinaryExpression, target: ts.PropertyAccessExpression, name: string): FixProposal | undefined => {
        if (!ts.isExpressionStatement(assign.parent) || assign.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return undefined;
        if (!ts.isIdentifier(target.expression) || !ts.isIdentifier(target.name)) return undefined;
        return {
            title: `Assign '${name}' a new object`,
            edits: [{
                start: fileOffset(assign.getStart(sf)), end: fileOffset(assign.getEnd()),
                newText: `${name} = { ...${name}, ${target.name.text}: ${text(assign.right)} }`,
            }],
        };
    };

    const visit = (n: ts.Node): void => {
        // x.push(…), x.set(…), x.items.push(…): a mutating method on the value or a member of it.
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && MUTATING_METHODS.has(n.expression.name.text)) {
            const root = memberRoot(n.expression.expression);
            if (root && signals.has(root.text) && !isShadowed(root, root.text)) {
                const method = n.expression.name.text;
                const direct = ts.isIdentifier(n.expression.expression);
                report(n, root.text, `\`${method}\``, direct && method === 'push' ? pushFix(n, root.text) : undefined);
            }
        }
        // x.field = …, x[i] = …, x.a.b += …, x.n++: a write through the value.
        const target = writeTarget(n);
        if (target && (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target))) {
            const root = memberRoot(target);
            if (root && signals.has(root.text) && !isShadowed(root, root.text)) {
                const fix = ts.isBinaryExpression(n) && ts.isPropertyAccessExpression(target) ? fieldFix(n, target, root.text) : undefined;
                report(n, root.text, 'this write to a member', fix);
            }
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return warnings;
}
