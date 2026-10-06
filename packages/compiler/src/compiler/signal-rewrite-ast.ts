// Signal/callable rewriter (AST) — the TypeScript-AST rewriter for setup() bodies.
//
// NOTE: the mutation rewrites do not preserve the expression's value —
// `const a = count++` becomes the return of .set() (undefined), not the previous value.
// Use the mutations as statements, not as expressions.
//
// One walk rewrites, in a single pass:
//   • signal reads      count       → __count()
//   • signal mutations  count++      → __count.set(__v => __v + 1)
//                       count += x   → __count.set(__v => __v + x)
//                       count = x    → __count.set(x)
//                       count = …count… → __count.set(prev => …prev…)   (self-reference)
//   • callable reads    total/prop   → total()    (deriveds + props + typed route params)
//
// The AST gives lexical scope/shadowing for free and natively handles generics, multiline,
// comments, ternaries, optional chaining and shorthand properties that a regex path
// mishandles. Mutations emit only WRAPPER edits (prefix/suffix); their RHS is rewritten by the
// normal read-recursion, so position-keyed edits never overlap. An unparseable fragment (e.g. a
// `} else {` line from a /*@raw*/ split — which carries no rewrites anyway) or an edit overlap
// returns the code unchanged rather than guessing.

import ts from 'typescript';
import type { ValidationWarning } from './validate';
import { withoutOrigins } from './sourcemap';

interface Edit { start: number; end: number; text: string; }

/**
 * Rewrite signal mutations/reads and callable (prop/derived) reads in a setup-body fragment.
 * @param signalNames   names declared via $signal — get __name() / .set(…)
 * @param callableNames names that are computed/props/route-params — get name()
 */
/** The fragment contains one of the names involved (outside strings? a lexical test is enough here). */
function mentionsAnyName(code: string, names: Set<string>): boolean {
    for (const n of names) {
        if (new RegExp(`\\b${n}\\b`).test(code)) return true;
    }
    return false;
}

/** True if `code` parses as TypeScript with no syntax diagnostics. */
export function parsesCleanly(code: string): boolean {
    const sf = ts.createSourceFile('__pdx_parsecheck.ts', code, ts.ScriptTarget.Latest, /*setParentNodes*/ false, ts.ScriptKind.TS);
    const diags = (sf as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics;
    return !diags || diags.length === 0;
}

/**
 * The sink codegen diagnostics are written to. `CompileContext.warnings` is the one the compiler
 * passes; a direct caller may pass nothing and get the console line only.
 */
export type WarningSink = { push(w: ValidationWarning): void };

/** PDX_REWRITE_FALLBACK — the rewrite was skipped, so the generated code reads a signal raw. */
function reportFallback(filename: string, reason: string, fragment: string, sink?: WarningSink): void {
    const message = `PDX_REWRITE_FALLBACK (${filename}): ${reason} — rewrite skipped. Fragment: ${fragment}`;
    // The console line stays: it is what a `pdx build` in a terminal shows, and dropping it would
    // trade one blind consumer for another.
    console.warn(`[pdx] ${message}`);
    sink?.push({
        code: 'PDX_REWRITE_FALLBACK',
        severity: 'warn',
        message,
        hint: 'The generated code reads this signal without calling it, so it will not be reactive. '
            + 'Fix the syntax, or move the fragment out of the setup body.',
    });
}

export function rewriteAst(code: string, signalNames: Set<string>, callableNames: Set<string>, _filename: string, protectedRanges?: [number, number][], sink?: WarningSink): string {
    if (signalNames.size === 0 && callableNames.size === 0) return code;
    // Edits whose start falls inside a protected [start,end) range are dropped — used to skip
    // @raw regions while still parsing the WHOLE body as one unit (so multiline statements
    // outside @raw are rewritten correctly). Raw spans are marked by /*@raw*/ comments, which
    // TS treats as trivia, so the body still parses.
    const inProtected = (pos: number): boolean =>
        !!protectedRanges && protectedRanges.some(([s, e]) => pos >= s && pos < e);

    const sf = ts.createSourceFile('__pdx_rewrite.ts', code, ts.ScriptTarget.Latest, /*setParentNodes*/ true, ts.ScriptKind.TS);
    // createSourceFile never throws on bad syntax — it records parseDiagnostics. Anything
    // unparseable (structural fragments carry no signal mutations) is returned untouched.
    // The fallback must NOT be silent when the fragment names a signal:
    // a mutation left unrewritten is a runtime bug with no diagnostic.
    const diags = (sf as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics;
    if (diags && diags.length > 0) {
        // An expression that is not a statement: the callback of `$effect(function() { … })`, which
        // the caller hands over alone. `function() {}` with no name is not a valid statement, an
        // arrow is — so without this the arrow form compiles and this one falls back. In parentheses it
        // is an expression statement; rewrite it that way and take the parentheses off again.
        const wrapped = `(${code})`;
        if (parsesCleanly(wrapped)) {
            const shifted = protectedRanges?.map(([s, e]): [number, number] => [s + 1, e + 1]);
            return rewriteAst(wrapped, signalNames, callableNames, _filename, shifted, sink).slice(1, -1);
        }
        if (mentionsAnyName(code, signalNames)) {
            reportFallback(_filename, 'unparseable fragment that names a signal', withoutOrigins(code).slice(0, 80), sink);
        }
        return code;
    }

    const edits: Edit[] = [];
    const scopeStack: Set<string>[] = [];
    const shadowed = (name: string): boolean => scopeStack.some((f) => f.has(name));
    const isSignal = (n: ts.Node): n is ts.Identifier => ts.isIdentifier(n) && signalNames.has(n.text) && !shadowed(n.text);

    // selfName: inside the RHS of `name = …` a read of `name` becomes `prev`; other signals/
    // callables still get rewritten normally.
    function visit(node: ts.Node, selfName?: string): void {
        const frame = scopeBindings(node);
        if (frame) scopeStack.push(new Set(frame));
        if (!handle(node, selfName)) ts.forEachChild(node, (c) => visit(c, selfName));
        if (frame) scopeStack.pop();
    }

    function handle(node: ts.Node, selfName?: string): boolean {
        // count++ / ++count / count-- / --count
        if ((ts.isPostfixUnaryExpression(node) || ts.isPrefixUnaryExpression(node)) &&
            (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) &&
            isSignal(node.operand)) {
            const name = (node.operand as ts.Identifier).text;
            const op = node.operator === ts.SyntaxKind.PlusPlusToken ? '+' : '-';
            edits.push({ start: node.getStart(sf), end: node.getEnd(), text: `__${name}.set(__v => __v ${op} 1)` });
            return true;
        }

        if (ts.isBinaryExpression(node) && isSignal(node.left)) {
            const name = (node.left as ts.Identifier).text;
            const logicalOp = LOGICAL_ASSIGN_OP[node.operatorToken.kind];
            if (logicalOp) {
                // Short-circuiting compound assignment: `c ||= x` / `c &&= x` / `c ??= x`.
                // Preserve semantics: only set when the logical op would assign.
                //   c ||= x  → (__c() || __c.set(x))      (sets only when falsy)
                //   c &&= x  → (__c() && __c.set(x))      (sets only when truthy)
                //   c ??= x  → (__c() ?? __c.set(x))      (sets only when null/undefined)
                edits.push({ start: node.left.getStart(sf), end: node.right.getStart(sf), text: `(__${name}() ${logicalOp} __${name}.set(` });
                edits.push({ start: node.right.getEnd(), end: node.right.getEnd(), text: '))' });
                visit(node.right, selfName);
                return true;
            }
            const jsOp = COMPOUND_OP[node.operatorToken.kind];
            if (jsOp) {
                edits.push({ start: node.left.getStart(sf), end: node.right.getStart(sf), text: `__${name}.set(__v => __v ${jsOp} ` });
                edits.push({ start: node.right.getEnd(), end: node.right.getEnd(), text: ')' });
                visit(node.right, selfName);
                return true;
            }
            if (node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                if (containsRead(node.right, name)) {
                    // A right-hand side that starts with `{` becomes the arrow's BODY, read as a block:
                    // `prev => { ...prev }` is a SyntaxError that takes the whole module down. Wrap it
                    // so the arrow returns the object. Checked on the source text, so
                    // `{ … } as const` is covered and an already-parenthesised `({ … })` is left alone.
                    const wrap = code[node.right.getStart(sf)] === '{';
                    edits.push({ start: node.left.getStart(sf), end: node.right.getStart(sf), text: `__${name}.set(prev => ${wrap ? '(' : ''}` });
                    edits.push({ start: node.right.getEnd(), end: node.right.getEnd(), text: wrap ? '))' : ')' });
                    visit(node.right, name);
                } else {
                    edits.push({ start: node.left.getStart(sf), end: node.right.getStart(sf), text: `__${name}.set(` });
                    edits.push({ start: node.right.getEnd(), end: node.right.getEnd(), text: ')' });
                    visit(node.right, selfName);
                }
                return true;
            }
        }

        // { count } → { count: __count() }   (regex would emit invalid { __count() })
        // …but NOT when this shorthand is a destructuring-assignment TARGET (`({ count } = obj)`),
        // where rewriting the key to a call produces an invalid assignment LHS.
        if (ts.isShorthandPropertyAssignment(node) && signalNames.has(node.name.text) && !shadowed(node.name.text) &&
            !isDestructuringAssignmentTarget(node.name)) {
            edits.push({ start: node.name.getEnd(), end: node.name.getEnd(), text: `: __${node.name.text}()` });
            return true;
        }
        // { productId } → { productId: productId() } for a prop / derived / route param. A shorthand
        // is not an identifier read, so the read branch below never sees it: the object would carry
        // the signal FUNCTION where a value is meant.
        if (ts.isShorthandPropertyAssignment(node) && callableNames.has(node.name.text) && !shadowed(node.name.text) &&
            !isDestructuringAssignmentTarget(node.name)) {
            edits.push({ start: node.name.getEnd(), end: node.name.getEnd(), text: `: ${node.name.text}()` });
            return true;
        }

        // reads: signal → __count() (or prev), callable → total()
        if (ts.isIdentifier(node) && isReadPosition(node) && !shadowed(node.text)) {
            if (signalNames.has(node.text)) {
                edits.push({ start: node.getStart(sf), end: node.getEnd(), text: selfName && node.text === selfName ? 'prev' : `__${node.text}()` });
                return true;
            }
            if (callableNames.has(node.text)) {
                edits.push({ start: node.getStart(sf), end: node.getEnd(), text: `${node.text}()` });
                return true;
            }
        }

        return false;
    }

    scopeStack.push(new Set(collectBlockBindings(sf.statements)));
    ts.forEachChild(sf, (c) => visit(c));
    scopeStack.pop();

    const effectiveEdits = protectedRanges ? edits.filter((ed) => !inProtected(ed.start)) : edits;
    const out = applyEdits(code, effectiveEdits);
    if (out === null) {
        reportFallback(_filename, 'overlapping edits', withoutOrigins(code).slice(0, 80), sink);
        return code;
    }
    return out;
}

const COMPOUND_OP: Partial<Record<ts.SyntaxKind, string>> = {
    [ts.SyntaxKind.PlusEqualsToken]: '+',
    [ts.SyntaxKind.MinusEqualsToken]: '-',
    [ts.SyntaxKind.AsteriskEqualsToken]: '*',
    [ts.SyntaxKind.SlashEqualsToken]: '/',
    [ts.SyntaxKind.PercentEqualsToken]: '%',
    [ts.SyntaxKind.AsteriskAsteriskEqualsToken]: '**',
    [ts.SyntaxKind.AmpersandEqualsToken]: '&',
    [ts.SyntaxKind.BarEqualsToken]: '|',
    [ts.SyntaxKind.CaretEqualsToken]: '^',
    [ts.SyntaxKind.LessThanLessThanEqualsToken]: '<<',
    [ts.SyntaxKind.GreaterThanGreaterThanEqualsToken]: '>>',
    [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken]: '>>>',
};

// Logical compound assignments must short-circuit (only assign when needed) — they cannot
// use the `prev => prev OP x` wrapper form, which would always evaluate/assign x.
const LOGICAL_ASSIGN_OP: Partial<Record<ts.SyntaxKind, string>> = {
    [ts.SyntaxKind.BarBarEqualsToken]: '||',
    [ts.SyntaxKind.AmpersandAmpersandEqualsToken]: '&&',
    [ts.SyntaxKind.QuestionQuestionEqualsToken]: '??',
};

/** True when this Identifier is a genuine value READ (not a property name, declaration, callee,
 *  assignment target, ++/-- operand, type, or import specifier). Mirrors the regex read filter. */
function isReadPosition(id: ts.Identifier): boolean {
    const p = id.parent;
    if (!p) return true;
    // Destructuring-assignment target: `[count] = pair` / `({ count } = obj)`. The identifier is
    // a WRITE target — rewriting it to a call (`[__count()] = pair`) is an invalid assignment LHS.
    if (isDestructuringAssignmentTarget(id)) return false;
    if (ts.isPropertyAccessExpression(p) && p.name === id) return false;   // obj.count
    if (ts.isQualifiedName(p) && p.right === id) return false;             // ns.Type
    if (ts.isPropertyAssignment(p) && p.name === id) return false;         // { count: … }
    if (ts.isShorthandPropertyAssignment(p)) return false;                 // handled separately
    if (ts.isVariableDeclaration(p) && p.name === id) return false;
    if (ts.isParameter(p) && p.name === id) return false;
    if (ts.isBindingElement(p) && (p.name === id || p.propertyName === id)) return false;
    if ((ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p) ||
         ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p)) && p.name === id) return false;
    if (ts.isLabeledStatement(p) && p.label === id) return false;
    if (ts.isBreakOrContinueStatement(p)) return false;
    if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.expression === id) return false; // count(
    if (ts.isBinaryExpression(p) && p.left === id && isAssignmentOp(p.operatorToken.kind)) return false; // LHS
    // Only ++/-- operands are write targets; !/-/+/~ operands are genuine reads.
    if ((ts.isPostfixUnaryExpression(p) || ts.isPrefixUnaryExpression(p)) && p.operand === id &&
        (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken)) return false;
    if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p)) return false;
    if (ts.isTypeNode(p) || ts.isTypeReferenceNode(p) || ts.isTypeQueryNode(p)) return false;
    return true;
}

function isAssignmentOp(kind: ts.SyntaxKind): boolean {
    return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

/**
 * True when `id` sits on the LHS of a destructuring assignment — `[count] = pair`,
 * `({ a: count } = obj)`, `[count = 1] = pair` (default) — i.e. a WRITE target reached
 * through array/object literals used as an assignment pattern. Such targets must not be
 * rewritten to a call (an invalid assignment LHS). NOTE: destructuring-to-`.set()` is not
 * lowered — the target is simply left untouched (safe: no syntax error).
 */
function isDestructuringAssignmentTarget(id: ts.Identifier): boolean {
    let node: ts.Node = id;
    let parent: ts.Node | undefined = id.parent;
    while (parent) {
        if (ts.isArrayLiteralExpression(parent) || ts.isObjectLiteralExpression(parent) ||
            ts.isSpreadElement(parent) || ts.isSpreadAssignment(parent)) {
            node = parent; parent = parent.parent; continue;
        }
        if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
            node = parent; parent = parent.parent; continue;
        }
        if (ts.isShorthandPropertyAssignment(parent)) {
            node = parent; parent = parent.parent; continue;
        }
        // `[a = 1] = x` — the default's `=` binary sits inside the array-literal pattern.
        if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
            // Reached the destructuring assignment itself (its LHS is our accumulated node),
            // or a default-value `=` whose target (left) is our node.
            return parent.left === node;
        }
        return false;
    }
    return false;
}

/** Does `node` contain a non-shadowed value read of `name` (self-reference detection)? */
function containsRead(node: ts.Node, name: string): boolean {
    let found = false;
    const local: Set<string>[] = [];
    const shadowed = () => local.some((f) => f.has(name));
    const walk = (n: ts.Node): void => {
        if (found) return;
        const frame = scopeBindings(n);
        if (frame) local.push(new Set(frame));
        if (ts.isIdentifier(n) && n.text === name && isReadPosition(n) && !shadowed()) found = true;
        else ts.forEachChild(n, walk);
        if (frame) local.pop();
    };
    walk(node);
    return found;
}

/** Binding names a scope-introducing node adds, or null if `node` opens no scope. */
function scopeBindings(node: ts.Node): string[] | null {
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
        const names: string[] = [];
        for (const p of node.parameters) names.push(...bindingNames(p.name));
        if ('name' in node && node.name && ts.isIdentifier(node.name)) names.push(node.name.text);
        return names;
    }
    if (ts.isCatchClause(node) && node.variableDeclaration) return bindingNames(node.variableDeclaration.name);
    if (ts.isBlock(node)) return collectBlockBindings(node.statements);
    if (ts.isForStatement(node) && node.initializer && ts.isVariableDeclarationList(node.initializer)) {
        return node.initializer.declarations.flatMap((d) => bindingNames(d.name));
    }
    if ((ts.isForOfStatement(node) || ts.isForInStatement(node)) && ts.isVariableDeclarationList(node.initializer)) {
        return node.initializer.declarations.flatMap((d) => bindingNames(d.name));
    }
    return null;
}

/** let/const/var/function/class names declared directly in a statement list. */
function collectBlockBindings(statements: readonly ts.Statement[]): string[] {
    const names: string[] = [];
    for (const s of statements) {
        if (ts.isVariableStatement(s)) {
            for (const d of s.declarationList.declarations) names.push(...bindingNames(d.name));
        } else if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) && s.name) {
            names.push(s.name.text);
        }
    }
    return names;
}

/** Flatten a BindingName (identifier / object / array pattern, with rest & defaults) to names. */
function bindingNames(name: ts.BindingName): string[] {
    if (ts.isIdentifier(name)) return [name.text];
    const out: string[] = [];
    for (const el of name.elements) {
        if (ts.isBindingElement(el)) out.push(...bindingNames(el.name));
    }
    return out;
}

/** Apply non-overlapping edits in order. Returns null on overlap (→ caller keeps the code as-is). */
function applyEdits(code: string, edits: Edit[]): string | null {
    const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
    let result = '';
    let last = 0;
    for (const e of sorted) {
        if (e.start < last) return null;
        result += code.slice(last, e.start) + e.text;
        last = e.end;
    }
    return result + code.slice(last);
}
