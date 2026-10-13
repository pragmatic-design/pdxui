// `:class`, specialised at compile time when the compiler can see the classes it yields (#112).
//
// The generic routine (`classBind` in codegen-template-inline.ts) splits the value, filters it, removes
// what is gone and adds what is new — on every change of every binding, a selected row's
// `row.id === selected ? 'danger' : ''` included. Where the classes are visible in the expression,
// the update is written for them:
//   - a conditional or `&&` whose branches are string literals: one effect that toggles each class;
//   - any other value on a plain element nothing else puts a class on: `className` is assigned.
// An object literal never reaches here: it is expanded to one `:class.x` per key (#96), each its own
// effect. Everything else keeps the generic routine, which owns only the classes it wrote.

import ts from 'typescript';
import { jsString } from './js-literal';

/** What else writes classes on the element: the generic routine must stay when anything does. */
export interface ClassSources {
    /** The element's static `class` attribute, split. */
    staticClasses: readonly string[];
    /** The names of its `:class.x` bindings. */
    toggled: readonly string[];
    /** A component: it may put classes on its own host, which `className` would wipe. */
    custom: boolean;
    /** SVG, where `className` is a read-only SVGAnimatedString and the attribute is written. */
    svg: boolean;
}

/** The classes a string literal names, or null when `node` is not one. */
function classesOf(node: ts.Expression): string[] | null {
    const n = ts.isParenthesizedExpression(node) ? node.expression : node;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text.split(/\s+/).filter(Boolean);
    return null;
}

/**
 * `c ? 'a' : 'b'` or `c && 'a'`: the condition's source and the classes of each branch, or null for
 * any other shape. `c && 'a'` adds 'a' when `c` is truthy and nothing otherwise — a falsy `0` is no
 * class, where the generic routine wrote the class "0".
 */
function conditionalClasses(expr: string): { cond: string; whenTrue: string[]; whenFalse: string[] } | null {
    const sf = ts.createSourceFile('__pdx_class.ts', `(${expr});`, ts.ScriptTarget.Latest, true);
    const statement = sf.statements[0];
    if (sf.statements.length !== 1 || !statement || !ts.isExpressionStatement(statement)) return null;
    let e = statement.expression;
    while (ts.isParenthesizedExpression(e)) e = e.expression;
    if (ts.isConditionalExpression(e)) {
        const whenTrue = classesOf(e.whenTrue), whenFalse = classesOf(e.whenFalse);
        if (!whenTrue || !whenFalse) return null;
        return { cond: e.condition.getText(sf), whenTrue, whenFalse };
    }
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        const whenTrue = classesOf(e.right);
        if (!whenTrue) return null;
        return { cond: e.left.getText(sf), whenTrue, whenFalse: [] };
    }
    return null;
}

/**
 * The specialised statement for `:class="expr"` on `el`, or null when the generic routine must stay.
 * `read` rewrites a template expression into the render's code (`ctx.` prefix, signal calls).
 */
export function specialisedClassBinding(el: string, expr: string, read: (expr: string) => string, sources: ClassSources, imports: Set<string>): string | null {
    const others = new Set([...sources.staticClasses, ...sources.toggled]);
    const conditional = conditionalClasses(expr);
    if (conditional) {
        const { cond, whenTrue, whenFalse } = conditional;
        const all = new Set([...whenTrue, ...whenFalse]);
        // A class another source also writes would be removed by a toggle: the generic routine never
        // removes a static class, and leaves a :class.x one to its own binding.
        if (all.size === 0 || [...all].some(c => others.has(c))) return null;
        const always = [...all].filter(c => whenTrue.includes(c) && whenFalse.includes(c));
        const onTrue = [...all].filter(c => whenTrue.includes(c) && !whenFalse.includes(c));
        const onFalse = [...all].filter(c => whenFalse.includes(c) && !whenTrue.includes(c));
        const toggles = [
            ...onTrue.map(c => `${el}.classList.toggle(${jsString(c)},__c);`),
            ...onFalse.map(c => `${el}.classList.toggle(${jsString(c)},!__c);`),
        ].join('');
        const added = always.map(c => `${el}.classList.add(${jsString(c)});`).join('');
        return added + (toggles ? `effect(()=>{const __c=!!(${read(cond)});${toggles}});` : '');
    }
    // Any other value: assigned whole, when nothing else on the element writes a class. Its text is
    // core's interpolationText, the generic routine's: null, undefined and false are no class.
    if (sources.custom || others.size > 0) return null;
    imports.add('interpolationText');
    const value = `interpolationText(${read(expr)})`;
    return sources.svg
        ? `effect(()=>{${el}.setAttribute("class",${value});});`
        : `effect(()=>{${el}.className=${value};});`;
}
