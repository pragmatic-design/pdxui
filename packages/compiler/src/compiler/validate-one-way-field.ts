// A one-way binding on a field its own handler edits (#678). `:value` writes when its value changes,
// not when the field differs from it (#44: a re-run for another reason must not overwrite what is being
// typed). So a handler that writes the bound signal and puts it back in one go — the user types `a`,
// the handler clears the signal to `''`, the value it last wrote — leaves `a` in the field while the
// signal is empty, without a word. The form whose state always wins over the field is the two-way one,
// `::value`; PDX_ONE_WAY_EDITED_FIELD says so, and offers the change when the handler is nothing but
// the assignment `::value` already makes.

import ts from 'typescript';
import type { TemplateNode } from '../parser/template';
import type { ValidationWarning, FixProposal } from './validate';
import { openingTagTexts } from '../text-scan';
import { markupOf } from './validate-parts';
import { offsetOf } from './fix-builders';

/** The native fields a user edits, and the properties of theirs that hold what was entered. */
const FIELDS = new Set(['input', 'textarea', 'select']);

// Match: a one-way `:value=` or `:checked=` with no modifier. Groups: [1]=the property [2]/[3]=the value
const ONE_WAY = /(?<=\s):(value|checked)\s*=\s*(?:"([^"]*)"|'([^']*)')/;
// Match: an `@input` or `@change` handler, with its modifiers. Groups: [1]=the event [2]/[3]=the handler
const HANDLER = /\s@(input|change)(?:\.[\w()]+)*\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
// Match: a bare identifier, the bound value the check is about.
const IDENT = /^\s*([A-Za-z_$][\w$]*)\s*$/;

const parse = (text: string): ts.SourceFile => ts.createSourceFile('__pdx_field.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

/** Whether `n` assigns `name`: `name = …`, `name += …`, `name++`. */
function assigns(n: ts.Node, name: string): boolean {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
        return ts.isIdentifier(n.left) && n.left.text === name;
    }
    if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n))
        && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)) {
        return ts.isIdentifier(n.operand) && n.operand.text === name;
    }
    return false;
}

/** The script's top-level functions, by name: `function f() {}` and `const f = () => …`. */
function scriptFunctions(body: string): Map<string, ts.Node> {
    const fns = new Map<string, ts.Node>();
    for (const st of parse(body).statements) {
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

/** Whether the handler, or a script function it reaches, assigns `name`. */
function handlerWrites(handler: string, name: string, fns: Map<string, ts.Node>): boolean {
    const seen = new Set<string>();
    const visit = (n: ts.Node): boolean => {
        if (assigns(n, name)) return true;
        // A function the handler names — `onInput`, `onInput($event)` — or one it calls in turn.
        if (ts.isIdentifier(n) && fns.has(n.text) && !seen.has(n.text)) {
            seen.add(n.text);
            if (visit(fns.get(n.text)!)) return true;
        }
        return ts.forEachChild(n, visit) ?? false;
    };
    return visit(parse(handler));
}

/** `e`, `(e)`, `e as T`, `(e as T)`: the expression under parentheses and casts. */
function bare(e: ts.Expression): ts.Expression {
    while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e)) e = e.expression;
    return e;
}

/**
 * Whether the handler is nothing but the assignment a two-way binding makes: `x = $event.target.value`,
 * or `(e) => x = (e.target as HTMLInputElement).value`, with `prop` (`value` or `checked`) read.
 */
export function isPlainFieldAssignment(handler: string, name: string, prop: string): boolean {
    const statements = parse(handler).statements;
    if (statements.length !== 1 || !ts.isExpressionStatement(statements[0])) return false;
    let expr = bare(statements[0].expression);
    let event = '$event';
    if (ts.isArrowFunction(expr)) {
        const [param, ...rest] = expr.parameters;
        if (!param || rest.length || !ts.isIdentifier(param.name)) return false;
        event = param.name.text;
        const body = expr.body;
        if (ts.isBlock(body)) {
            const [only, ...more] = body.statements;
            if (!only || more.length || !ts.isExpressionStatement(only)) return false;
            expr = bare(only.expression);
        } else expr = bare(body);
    }
    if (!ts.isBinaryExpression(expr) || expr.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false;
    if (!ts.isIdentifier(expr.left) || expr.left.text !== name) return false;
    const read = bare(expr.right);
    if (!ts.isPropertyAccessExpression(read) || read.name.text !== prop) return false;
    const target = bare(read.expression);
    return ts.isPropertyAccessExpression(target) && target.name.text === 'target'
        && ts.isIdentifier(target.expression) && target.expression.text === event;
}

const ordinal = (n: number): string => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

/**
 * PDX_ONE_WAY_EDITED_FIELD for each `<input|textarea|select :value="x">` (or `:checked`) whose
 * `@input`/`@change` handler — inline, or a script function it reaches — assigns `x`. `body` is the
 * script (`analysis.body`), where the functions a handler names are.
 */
export function checkOneWayEditedField(ast: TemplateNode[], body: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    let fns: Map<string, ts.Node> | undefined;
    // How many times each `<tag :prop="x"` has been seen, so a finding names which one it is about.
    const uses = new Map<string, number>();
    for (const text of markupOf(ast).flatMap(openingTagTexts)) {
        const tag = /^<([A-Za-z][\w-]*)/.exec(text)?.[1].toLowerCase() ?? '';
        if (!FIELDS.has(tag)) continue;
        const bound = ONE_WAY.exec(text);
        if (!bound) continue;
        const [, prop, dq, sq] = bound;
        const name = IDENT.exec(dq ?? sq)?.[1];
        if (!name) continue;
        const key = `${tag} ${prop} ${name}`;
        const use = (uses.get(key) ?? 0) + 1;
        uses.set(key, use);
        for (const h of text.matchAll(HANDLER)) {
            const handler = h[2] ?? h[3];
            fns ??= scriptFunctions(body);
            if (!handlerWrites(handler, name, fns)) continue;
            const plain = isPlainFieldAssignment(handler, name, prop);
            warnings.push({
                code: 'PDX_ONE_WAY_EDITED_FIELD', severity: 'warn',
                message: `':${prop}="${name}"' on <${tag}>${use > 1 ? ` (its ${ordinal(use)} use)` : ''} is bound one way, and its @${h[1]} handler writes '${name}': `
                    + `the binding writes only when its value changes, so a handler that sets '${name}' and puts it back leaves what was typed in the field.`,
                hint: plain
                    ? `Bind it two-way, ::${prop}="${name}", and remove the handler: the field and '${name}' then follow each other.`
                    : `Bind it two-way, ::${prop}="${name}", and keep in the handler only what it does besides writing '${name}' from the field.`,
            });
            break;
        }
    }
    return warnings;
}

/** Where the finding is: the `:prop="x"` the message names, in the nth such tag of the template. */
export function locateOneWayEditedField(message: string, find: (re: RegExp, nth: number) => number | undefined): number | undefined {
    // Groups: [1]=the property [2]=the name [3]=the tag [4]=which use, when there is more than one
    const m = /^':(value|checked)="([\w$]+)"' on <([\w-]+)>(?: \(its (\d+)(?:st|nd|rd|th) use\))?/.exec(message);
    if (!m) return undefined;
    const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return find(new RegExp(`(?<=<${m[3]}\\b[^>]*\\s):${m[1]}\\s*=\\s*["']${esc(m[2])}["']`, 'i'), m[4] ? Number(m[4]) - 1 : 0);
}

/**
 * The fix, when the handler is the plain assignment: `:value` becomes `::value` and the handler goes,
 * in the tag the finding points at.
 */
export function oneWayEditedFieldFix(source: string, w: ValidationWarning): FixProposal | undefined {
    const m = /^':(value|checked)="([\w$]+)"'/.exec(w.message);
    if (!m || w.line === undefined || w.column === undefined) return undefined;
    const [, prop, name] = m;
    const at = offsetOf(source, w.line, w.column);
    if (at === undefined || source[at] !== ':') return undefined;
    // The opening tag the binding is in: from its `<` to the `>` that is not inside a quoted value.
    const start = source.lastIndexOf('<', at);
    let end = at;
    for (let quote = ''; end < source.length; end++) {
        const ch = source[end];
        if (quote) { if (ch === quote) quote = ''; continue; }
        if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '>') break;
    }
    const tag = source.slice(start, end);
    for (const h of tag.matchAll(HANDLER)) {
        if (!isPlainFieldAssignment(h[2] ?? h[3], name, prop)) continue;
        const from = start + h.index!;
        return {
            title: `Bind '${name}' two-way with ::${prop} and remove the handler`,
            edits: [
                { start: at, end: at, newText: ':' },
                { start: from, end: from + h[0].length, newText: '' },
            ],
        };
    }
    return undefined;
}
