// The names a piece of code reads without declaring them (#977).
//
// A `@loader` and `@page`'s label function are lifted out of the component to module scope, so what
// they read has to be there. Telling that apart by name over the text gets two things wrong that this
// does not: a name in a type annotation (the code is read with its types erased), and a local of
// another function, or the code's own local of the same name (scopes are followed).
//
// Scopes, from the syntax alone: a function's parameters, its `var`s wherever they are in its body,
// its own name when it is an expression; a block's `let`, `const`, `class` and `function`; a `for`'s
// head; a `catch` clause's binding. A property name, an object key and a label are not reads; a
// shorthand `{ signal }` is.

import ts from 'typescript';

type FunctionLike = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration
    | ts.ConstructorDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration;

const isFunctionLike = (n: ts.Node): n is FunctionLike => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)
    || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n)
    || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n);

/** The names a binding declares: `a`, or every name of `{ a, b: [c] }`. */
function bind(name: ts.BindingName, into: Set<string>): void {
    if (ts.isIdentifier(name)) { into.add(name.text); return; }
    for (const el of name.elements) if (!ts.isOmittedExpression(el)) bind(el.name, into);
}

/** What a list of statements declares at its own level: `let`, `const`, `var`, functions, classes. */
function declareStatements(statements: readonly ts.Statement[], into: Set<string>): void {
    for (const stmt of statements) {
        if (ts.isVariableStatement(stmt)) for (const d of stmt.declarationList.declarations) bind(d.name, into);
        else if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) && stmt.name) into.add(stmt.name.text);
    }
}

/** The `var`s anywhere in `node`, not crossing into a nested function: they belong to its function. */
function collectVars(node: ts.Node, into: Set<string>): void {
    ts.forEachChild(node, (child) => {
        if (isFunctionLike(child) || ts.isClassLike(child)) return;
        if (ts.isVariableDeclarationList(child) && !(child.flags & ts.NodeFlags.BlockScoped)) {
            for (const d of child.declarations) bind(d.name, into);
        }
        collectVars(child, into);
    });
}

/** The scope a node opens, with what it declares; null for a node that opens none. */
function scopeOf(node: ts.Node): Set<string> | null {
    const s = new Set<string>();
    if (isFunctionLike(node)) {
        if (ts.isFunctionExpression(node) && node.name) s.add(node.name.text);
        for (const p of node.parameters) bind(p.name, s);
        if (node.body) {
            collectVars(node.body, s);
            if (ts.isBlock(node.body)) declareStatements(node.body.statements, s);
        }
        return s;
    }
    if (ts.isClassExpression(node) && node.name) { s.add(node.name.text); return s; }
    // A function's body block is the function's scope, opened above.
    if (ts.isBlock(node) && !(node.parent && isFunctionLike(node.parent))) { declareStatements(node.statements, s); return s; }
    if (ts.isCaseBlock(node)) { for (const c of node.clauses) declareStatements(c.statements, s); return s; }
    if ((ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node))
        && node.initializer && ts.isVariableDeclarationList(node.initializer)) {
        for (const d of node.initializer.declarations) bind(d.name, s);
        return s;
    }
    if (ts.isCatchClause(node) && node.variableDeclaration) { bind(node.variableDeclaration.name, s); return s; }
    return null;
}

/** Whether `id` stands where a name is READ, not declared, keyed or labelled. */
function isRead(id: ts.Identifier): boolean {
    const p = id.parent;
    if (!p) return true;
    if (ts.isPropertyAccessExpression(p)) return p.expression === id;
    if (ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p)
        || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p) || ts.isEnumMember(p)) return p.name !== id;
    if (ts.isBindingElement(p)) return p.name !== id && p.propertyName !== id;
    if (ts.isVariableDeclaration(p) || ts.isParameter(p)) return p.name !== id;
    if (ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p) || ts.isClassExpression(p)) return p.name !== id;
    if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) return false;
    if (ts.isMetaProperty(p)) return false;
    return true;
}

/**
 * The names `code` reads and does not declare, or null when it does not parse — the compile reports a
 * script that does not parse on its own, and a check that cannot read the code says nothing.
 */
export function freeNames(code: string): Set<string> | null {
    const sf = ts.createSourceFile('__pdx_free.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const errors = (sf as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics;
    if (errors && errors.length > 0) return null;

    const top = new Set<string>();
    collectVars(sf, top);
    declareStatements(sf.statements, top);
    const scopes: Set<string>[] = [top];
    const free = new Set<string>();

    const visit = (node: ts.Node): void => {
        const scope = scopeOf(node);
        if (scope) scopes.push(scope);
        if (ts.isIdentifier(node)) {
            if (isRead(node) && node.text !== 'arguments' && !scopes.some((s) => s.has(node.text))) free.add(node.text);
        } else if (ts.isShorthandPropertyAssignment(node)) {
            // `{ signal }` reads `signal`; its name is both the key and the read.
            if (!scopes.some((s) => s.has(node.name.text))) free.add(node.name.text);
            if (node.objectAssignmentInitializer) visit(node.objectAssignmentInitializer);
        } else {
            ts.forEachChild(node, visit);
        }
        if (scope) scopes.pop();
    };
    ts.forEachChild(sf, visit);
    return free;
}
