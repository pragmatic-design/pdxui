// PDX_SIGNAL_MUTATED_IN_PLACE — a $signal's value changed in place updates nothing (#151).
//
// A signal notifies when it is SET, and `set` compares with Object.is: `items.push(x)` on a
// `$signal([])` mutates the array the signal already holds, so no `set` runs and nothing that reads
// `items` updates. The rewriter only rewrites assignments to the name itself, so this is valid
// JavaScript that compiles and does nothing visible. Reported where it is written, over the script's
// TypeScript tree and over each template event handler's (#210); `push` and a one-level property
// assignment carry the fix to the immutable form. A $store is a proxy, where in-place mutation is the
// point, and is not in the set of names checked.

import ts from 'typescript';
import type { SFCDescriptor } from '../parser/sfc';
import type { TemplateNode, HtmlNode } from '../parser/template';
import type { ScriptAnalysis } from './script-analyzer-types';
import type { ValidationWarning, FixProposal } from './validate';
import { parseableScript } from './validate-design';
import { bindingNames } from './codegen-prefix';

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

/** A template event handler's code, where it starts in the template's content, and the names the template binds around it. */
interface TemplateHandler {
    code: string;
    offset: number;
    bound: Set<string>;
}

/**
 * Every event handler in the template, each with the names in scope where it is written: a `@for`
 * item and index, a `@let`, a slot's `let:` names, the error and retry names of `@catch` and `@error`.
 * Those are the template's own values, not the script's $signals, whatever their name.
 */
function templateHandlers(ast: TemplateNode[]): TemplateHandler[] {
    const out: TemplateHandler[] = [];
    const walk = (nodes: TemplateNode[] | undefined, outer: Set<string>): void => {
        // A `@let` names its value for the rest of its block.
        const bound = new Set(outer);
        const plus = (...names: (string | undefined)[]): Set<string> => new Set([...bound, ...names.filter((n): n is string => !!n)]);
        for (const node of nodes ?? []) {
            switch (node.type) {
                case 'html': if (!node.raw) out.push(...handlersIn(node, bound)); break;
                case 'let': bound.add(node.name); break;
                case 'for': walk(node.body, plus(...bindingNames(node.item), node.index)); walk(node.emptyBody, bound); break;
                case 'slot-template': walk(node.body, plus(...node.scopeVars)); break;
                case 'try': walk(node.body, bound); walk(node.catchBody, plus(node.errorVar, node.retryVar)); break;
                case 'await':
                    walk(node.body, bound); walk(node.loading, bound);
                    walk(node.errorBody, plus(node.errorVar, node.retryVar ?? 'retry'));
                    break;
                case 'if': case 'require': walk(node.body, bound); walk(node.elseBody, bound); break;
                case 'switch': for (const c of node.cases) walk(c.body, bound); walk(node.defaultBody, bound); break;
                case 'show': case 'portal': case 'custom-directive': walk(node.body, bound); break;
                case 'defer': walk(node.body, bound); walk(node.placeholder, bound); walk(node.loading, bound); walk(node.error, bound); break;
            }
        }
    };
    walk(ast, new Set());
    return out;
}

/** The event handlers of one piece of markup, positioned in the template's content. */
function handlersIn(node: HtmlNode, bound: Set<string>): TemplateHandler[] {
    if (node.loc?.offset === undefined) return [];
    const base = node.loc.offset;
    const shifts = node.shifts ?? [];
    // A comment is not rendered: blanked to spaces, so every index still points where it did.
    const markup = node.content.replace(/<!--[\s\S]*?-->/g, c => ' '.repeat(c.length));
    const out: TemplateHandler[] = [];
    // Match: an event attribute and its quoted handler, `@click="…"` or `@input.prevent='…'`, after the
    // space that separates it from the tag name or the attribute before it — as the codegen reads it.
    // Groups: [1]=double-quoted handler [2]=single-quoted handler
    for (const m of markup.matchAll(/\s@[\w.-]+=(?:"([^"]*)"|'([^']*)')/g)) {
        const at = m.index + 1;
        let code = m[1] ?? m[2];
        let start = m.index + m[0].length - 1 - code.length;
        // An `@@` escape is text, not an attribute; and past one inside the handler, the content and
        // the source no longer line up character for character.
        if (shifts.some(s => s >= at && s < start + code.length)) continue;
        // `@click="${handler}"` is the same handler, written the way the codegen also accepts.
        const wrapped = code.match(/^\$\{(.+)\}$/);
        if (wrapped) { code = wrapped[1]; start += 2; }
        out.push({ code, offset: base + start + shifts.filter(s => s < at).length, bound });
    }
    return out;
}

/**
 * The in-place mutations of a $signal value — in the script and in each template event handler —
 * each positioned in the .pdx, with a fix where the immutable form is one rewrite of the statement.
 */
export function validateSignalMutation(
    descriptor: SFCDescriptor, analysis: ScriptAnalysis | null, source: string, ast?: TemplateNode[],
): ValidationWarning[] {
    const script = descriptor.script;
    const template = descriptor.template;
    // A `:ref` target holds an element (or a component's host), and setting its properties —
    // `bar.style.width = …`, `dialog.open = true` — is what it is for, not state the signal tracks.
    const refs = refTargets(template?.content ?? '');
    const signals = new Set((analysis?.signals ?? []).map(s => s.name).filter(n => !refs.has(n)));
    if (signals.size === 0) return [];
    const warnings: ValidationWarning[] = [];
    // A block read from another file has no offsets in this one: its findings could not be placed.
    if (script && !script.src && script.content.trim()) {
        warnings.push(...mutationsIn(parseableScript(script.content), script.content, script.start, signals, source));
    }
    if (template && !template.src && ast) {
        for (const h of templateHandlers(ast)) {
            const names = new Set([...signals].filter(n => !h.bound.has(n)));
            const sf = ts.createSourceFile('__pdx_handler.ts', h.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
            warnings.push(...mutationsIn(sf, h.code, template.start + h.offset, names, source));
        }
    }
    return warnings;
}

/** The in-place mutations of `signals` in one parsed piece of code that starts at `base` in the .pdx. */
function mutationsIn(sf: ts.SourceFile, code: string, base: number, signals: Set<string>, source: string): ValidationWarning[] {
    /** Offset in the .pdx of an offset in the code. */
    const fileOffset = (codeOffset: number): number => base + codeOffset;
    const text = (n: ts.Node): string => code.slice(n.getStart(sf), n.getEnd());
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
