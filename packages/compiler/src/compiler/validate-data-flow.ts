// The data-flow pair of the component-design rules, over the script's TypeScript tree.
//
//   CD-S2  PDX_DERIVED_WRITE  precise    a member of a value reached from a $derived is written
//   CD-D2  PDX_EFFECT_STATE   heuristic  an effect writes a $signal from what it reads
//
// Both are warnings. CD-D2 cannot see intent: it spares a write that follows what a side effect
// answered (the tickets list's live watch: `const outcome = source.applyServerChange(…)`, then state
// from `outcome`), a write after an `await` (the documents list's `loaded`), and a reset to a constant
// of what a handler chose (the asset picker's `pickedText`) — and says it is a heuristic in its message.

import ts from 'typescript';
import type { ValidationWarning } from './validate';

/** Calls that compute and change nothing: translation, conversion, arithmetic. */
const PURE_CALLS = new Set(['$t', '$d', '$n', '$r', 'String', 'Number', 'Boolean', 'parseInt', 'parseFloat', 'isNaN']);
/** Objects whose methods compute and change nothing. */
const PURE_OBJECTS = new Set(['Math', 'JSON', 'Object', 'Array', 'Number', 'String', 'Date', 'Intl']);
/** Array methods whose callback parameter is an element of the array they are called on. */
const ELEMENT_CALLBACKS = new Set(['forEach', 'map', 'filter', 'find', 'some', 'every', 'flatMap', 'findLast']);
const WATCHERS = new Set(['$watch', 'watch']);
const EFFECTS = new Set(['$effect', 'effect']);

type Fn = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration;

/**
 * The identifier an expression is reached from: `a.b[0].c()` and `a.find(…)` start at `a`. A call to
 * a plain function starts nowhere: its result is a new value, not the object it was given.
 */
function rootOf(e: ts.Expression): ts.Identifier | null {
    let cur: ts.Expression = e;
    for (;;) {
        if (ts.isIdentifier(cur)) return cur;
        if (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur)) cur = cur.expression;
        else if (ts.isParenthesizedExpression(cur) || ts.isNonNullExpression(cur)) cur = cur.expression;
        else if (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) cur = cur.expression.expression;
        else return null;
    }
}

function isAssignment(n: ts.Node): n is ts.BinaryExpression {
    return ts.isBinaryExpression(n)
        && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
}

/** What a write changes: `x = …`, `x += …`, `x++`, `--x`; `target` is the left side. */
function writeTarget(n: ts.Node): ts.Expression | null {
    if (isAssignment(n)) return n.left;
    if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n))
        && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)) return n.operand;
    return null;
}

/** CD-S2: a member written through a value that came from a $derived — directly or through locals. */
function checkDerivedWrites(sf: ts.SourceFile, deriveds: Set<string>, at: (n: ts.Node) => number): ValidationWarning[] {
    // name → the $derived it was reached from.
    const from = new Map<string, string>([...deriveds].map(d => [d, d]));
    const taint = (name: ts.BindingName, source: ts.Expression): boolean => {
        const root = rootOf(source);
        const origin = root ? from.get(root.text) : undefined;
        if (!origin || !ts.isIdentifier(name) || from.has(name.text)) return false;
        from.set(name.text, origin);
        return true;
    };
    // To a fixed point: `const s = x.find(…)` then `for (const i of s.children)` is two steps.
    for (let changed = true, rounds = 0; changed && rounds < 8; rounds++) {
        changed = false;
        const visit = (n: ts.Node): void => {
            if (ts.isVariableDeclaration(n) && n.initializer) changed = taint(n.name, n.initializer) || changed;
            if (ts.isForOfStatement(n) && ts.isVariableDeclarationList(n.initializer)) {
                for (const d of n.initializer.declarations) changed = taint(d.name, n.expression) || changed;
            }
            if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ELEMENT_CALLBACKS.has(n.expression.name.text)) {
                const cb = n.arguments[0];
                if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) && cb.parameters[0]) {
                    changed = taint(cb.parameters[0].name, n.expression.expression) || changed;
                }
            }
            ts.forEachChild(n, visit);
        };
        visit(sf);
    }

    const warnings: ValidationWarning[] = [];
    const visit = (n: ts.Node): void => {
        const target = writeTarget(n);
        if (target && (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target))) {
            const root = rootOf(target);
            const origin = root ? from.get(root.text) : undefined;
            if (origin) {
                warnings.push({
                    code: 'PDX_DERIVED_WRITE',
                    severity: 'warn',
                    message: `This writes into '${origin}', a $derived (CD-S2): its next computation replaces the objects `
                        + `written, so the value lies until something patches it again.`,
                    hint: `Derive the field from its source instead (a signal the $derived reads); if the reader overrides it, `
                        + `that is a $signal reset by $watch on the source.`,
                    line: at(n),
                });
            }
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return warnings;
}

/** A value that reads nothing: a literal, `null`, `undefined`, `[]`, `{}`. */
function isConstant(e: ts.Expression): boolean {
    if (ts.isParenthesizedExpression(e)) return isConstant(e.expression);
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isNumericLiteral(e)) return true;
    if (e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword || e.kind === ts.SyntaxKind.NullKeyword) return true;
    if (ts.isIdentifier(e) && e.text === 'undefined') return true;
    if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken) return ts.isNumericLiteral(e.operand);
    if (ts.isArrayLiteralExpression(e)) return e.elements.length === 0;
    if (ts.isObjectLiteralExpression(e)) return e.properties.length === 0;
    return false;
}

/** Where the first `await` of a function body ends, nested functions aside; Infinity when none. */
function firstAwaitEnd(body: ts.Node): number {
    let end = Infinity;
    const visit = (n: ts.Node): void => {
        if (end !== Infinity || ts.isFunctionLike(n)) return;
        if (ts.isAwaitExpression(n) || (ts.isForOfStatement(n) && n.awaitModifier)) { end = n.getEnd(); return; }
        ts.forEachChild(n, visit);
    };
    ts.forEachChild(body, visit);
    return end;
}

/**
 * The $signals something outside `inside` writes with a value that reads something: a handler's
 * choice, which an effect may reset to a constant when its source changes.
 */
function chosenElsewhere(sf: ts.SourceFile, signals: Set<string>, inside: ts.Node, byTemplate: Set<string>): Set<string> {
    const out = new Set(byTemplate);
    const visit = (n: ts.Node): void => {
        if (n === inside) return;
        if (writesChoice(n, signals)) out.add((writeTarget(n) as ts.Identifier).text);
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return out;
}

/** A write of a $signal whose value reads something: `x = e.target.value`, `x++` — not `x = ''`. */
function writesChoice(n: ts.Node, signals: Set<string>): boolean {
    const target = writeTarget(n);
    return !!target && ts.isIdentifier(target) && signals.has(target.text)
        && !(isAssignment(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && isConstant(n.right));
}

/**
 * The $signals the template's event handlers write with a value that reads something:
 * `@input="e => query = e.target.value"` is the reader's choice, as much as a script handler's.
 */
function writtenByTemplateHandlers(template: string, signals: Set<string>): Set<string> {
    const out = new Set<string>();
    // Match: an event attribute and its quoted handler, `@input="…"` or `@click='…'`.
    // Groups: [1]=double-quoted handler [2]=single-quoted handler
    for (const m of template.matchAll(/\s@[\w:.-]+\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        const handler = ts.createSourceFile('__pdx_handler.ts', m[1] ?? m[2], ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        const visit = (n: ts.Node): void => {
            if (writesChoice(n, signals)) out.add((writeTarget(n) as ts.Identifier).text);
            ts.forEachChild(n, visit);
        };
        visit(handler);
    }
    return out;
}

/** The functions a same-file call can reach: `function f() {}` and `const f = () => …`. */
function localFunctions(sf: ts.SourceFile): Map<string, Fn> {
    const fns = new Map<string, Fn>();
    for (const st of sf.statements) {
        if (ts.isFunctionDeclaration(st) && st.name) fns.set(st.name.text, st);
        if (ts.isVariableStatement(st)) {
            for (const d of st.declarationList.declarations) {
                if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
                    fns.set(d.name.text, d.initializer);
                }
            }
        }
    }
    return fns;
}

/** CD-D2: an effect (or a same-file function it calls) that writes a $signal from what it reads. */
function checkEffectState(sf: ts.SourceFile, signals: Set<string>, deriveds: Set<string>, at: (n: ts.Node) => number,
    byTemplate: Set<string>): ValidationWarning[] {
    const fns = localFunctions(sf);

    /** A call that changes something, or answers from outside the component. */
    const isImpureCall = (c: ts.CallExpression): boolean => {
        const callee = c.expression;
        if (ts.isIdentifier(callee)) {
            return !(PURE_CALLS.has(callee.text) || signals.has(callee.text) || deriveds.has(callee.text) || fns.has(callee.text));
        }
        const root = rootOf(callee);
        return !(root && PURE_OBJECTS.has(root.text));
    };
    const mentionsImpure = (e: ts.Node, impureLocals: Set<string>): boolean => {
        let found = false;
        const visit = (n: ts.Node): void => {
            if (found) return;
            if (ts.isCallExpression(n) && isImpureCall(n)) { found = true; return; }
            if (ts.isIdentifier(n) && impureLocals.has(n.text)) { found = true; return; }
            ts.forEachChild(n, visit);
        };
        visit(e);
        return found;
    };
    /** The conditions that decide whether `n` runs, up to `stop`. */
    const guards = (n: ts.Node, stop: ts.Node): ts.Expression[] => {
        const out: ts.Expression[] = [];
        for (let p: ts.Node | undefined = n.parent, child: ts.Node = n; p && p !== stop; child = p, p = p.parent) {
            if (ts.isIfStatement(p) && child !== p.expression) out.push(p.expression);
            if (ts.isConditionalExpression(p) && child !== p.condition) out.push(p.condition);
            if (ts.isBinaryExpression(p) && child === p.right
                && (p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || p.operatorToken.kind === ts.SyntaxKind.BarBarToken)) out.push(p.left);
        }
        return out;
    };

    const reported = new Set<string>();
    const warnings: ValidationWarning[] = [];

    /** Walk one function body; `effectLine` names the effect the report is about. */
    const scan = (fn: Fn, effect: string, visited: Set<Fn>, chosen: Set<string>): void => {
        if (visited.has(fn) || !fn.body) return;
        visited.add(fn);
        const impureLocals = new Set<string>();
        // What follows an `await` runs when the answer comes, after the effect has returned.
        const awaited = firstAwaitEnd(fn.body);
        const visit = (n: ts.Node): void => {
            if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && mentionsImpure(n.initializer, impureLocals)) {
                impureLocals.add(n.name.text);
            }
            const target = writeTarget(n);
            if (target && ts.isIdentifier(target) && signals.has(target.text)) {
                const value = isAssignment(n) ? n.right : undefined;
                const follows = (value && mentionsImpure(value, impureLocals))
                    || guards(n, fn).some(g => mentionsImpure(g, impureLocals))
                    || n.getStart(sf) >= awaited
                    // A reset: the value a handler chose, cleared when its source changes (CD-S2's hint).
                    || (value !== undefined && isConstant(value) && chosen.has(target.text));
                const key = `${effect}:${target.text}`;
                if (!follows && !reported.has(key)) {
                    reported.add(key);
                    warnings.push({
                        code: 'PDX_EFFECT_STATE',
                        severity: 'warn',
                        message: `'${target.text}' is written by an effect (CD-D2, a heuristic): if its value follows from what the `
                            + `effect reads, it is a $derived, and the effect is a second copy that can lag behind.`,
                        hint: `Declare it with $derived(…). An effect is for what leaves the component: storage, the URL, the DOM, a request. `
                            + `A write that follows what such a call answered is not reported.`,
                        line: at(n),
                    });
                }
            }
            if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
                const callee = fns.get(n.expression.text);
                if (callee && n.getStart(sf) < awaited && !guards(n, fn).some(g => mentionsImpure(g, impureLocals))) {
                    scan(callee, effect, visited, chosen);
                }
            }
            // A function written inside the effect — an observer's callback, a timer, a handler — runs
            // later, on its own event: what it writes is not the effect computing state.
            if (ts.isFunctionLike(n)) return;
            ts.forEachChild(n, visit);
        };
        visit(fn.body);
    };

    const visit = (n: ts.Node): void => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
            const name = n.expression.text;
            const cb = WATCHERS.has(name) ? n.arguments[1] : EFFECTS.has(name) ? n.arguments[0] : undefined;
            if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
                scan(cb, `${name}@${n.getStart(sf)}`, new Set(), chosenElsewhere(sf, signals, cb, byTemplate));
            }
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return warnings;
}

/** CD-S2 and CD-D2 over the parsed script; `template` is read for the handlers' writes. */
export function checkDataFlow(sf: ts.SourceFile, signals: Set<string>, deriveds: Set<string>, at: (n: ts.Node) => number,
    template = ''): ValidationWarning[] {
    const byTemplate = writtenByTemplateHandlers(template, signals);
    return [...checkDerivedWrites(sf, deriveds, at), ...checkEffectState(sf, signals, deriveds, at, byTemplate)];
}
