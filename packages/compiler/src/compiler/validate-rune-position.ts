// PDX_RUNE_POSITION: a `$` rune where the compiler does not read it (#278; decision 12,
// docs/language/script.md → «The script and its rewrite»).
//
// A rune is rewritten only in its position: `$signal`, `$derived`, `$store` as the whole initialiser of
// a top-level declaration, `$effect` and `$watch` as a top-level statement. Anywhere else — a function
// body, a callback, a block — the alpha left the call as written, and `$signal` names nothing when it
// runs; an `$effect` inside an `if` was lifted out of it and ran unconditionally. Each is an error at
// the call, naming the core function that is right in that place.

import ts from 'typescript';
import type { SFCDescriptor } from '../parser/sfc';
import type { ValidationWarning } from './validate';
import { maskNonCode } from './tokenizer';
import { declarationEnd } from './statement-extent';

// Maps, not object literals: a name is looked up here for every call of the script, and an object
// answered for `valueOf`, `toString` and the rest of Object.prototype (#681).
/** The runes read as the initialiser of a top-level declaration, with the core function for elsewhere. */
const DECLARED = new Map<string, string>([['$signal', 'signal'], ['$derived', 'computed'], ['$store', 'store']]);
/** The runes read as a top-level statement, with the core function for elsewhere. */
const STATEMENT = new Map<string, string>([['$effect', 'effect'], ['$watch', 'watch']]);

// Match: a declaration opening its line, `@name`. Read on the masked script.
const DECLARATION = /^[ \t]*@[A-Za-z]/gm;
// Match: the head of `@provide Token = value`, up to the `=`; the value is code (#550).
const PROVIDE_HEAD = /^@provide\s+[A-Za-z_$][\w$]*\s*=/;

/** Blank `code` from `at` to `end` to spaces, newlines kept. */
const blank = (code: string, at: number, end: number): string =>
    code.slice(0, at) + code.slice(at, end).replace(/[^\n]/g, ' ') + code.slice(end);

/**
 * The script with every `@` declaration blanked to spaces, newlines kept: what is left is TypeScript,
 * at the same offsets. A rune inside a declaration (`@raw { … }`) is not a rune — except in the value
 * of `@provide`, which is emitted as an argument of `provide()`: that value stays, and its range is
 * returned, since no rune is in its position there.
 */
export function withoutDeclarations(code: string): { code: string; values: [number, number][] } {
    const masked = maskNonCode(code);
    let out = code;
    const values: [number, number][] = [];
    for (const m of masked.matchAll(DECLARATION)) {
        const at = m.index + m[0].length - 2;
        const end = declarationEnd(code, masked, at);
        const head = PROVIDE_HEAD.exec(masked.slice(at, end));
        if (head) {
            out = blank(out, at, at + head[0].length);
            values.push([at + head[0].length, end]);
        } else {
            out = blank(out, at, end);
        }
    }
    return { code: out, values };
}

/** The node an expression is the value of, past any parentheses around it. */
function outer(node: ts.Node): ts.Node {
    let n = node;
    while (n.parent && ts.isParenthesizedExpression(n.parent)) n = n.parent;
    return n;
}

/** Whether a declaration rune's call is the whole initialiser of a named top-level declaration. */
function declaredInPosition(call: ts.CallExpression, sf: ts.SourceFile): boolean {
    const value = outer(call);
    const decl = value.parent;
    if (!decl || !ts.isVariableDeclaration(decl) || decl.initializer !== value || !ts.isIdentifier(decl.name)) return false;
    const statement = decl.parent?.parent;
    return !!statement && ts.isVariableStatement(statement) && statement.parent === sf;
}

/** Whether a statement rune's call is a top-level statement of its own. */
function statementInPosition(call: ts.CallExpression, sf: ts.SourceFile): boolean {
    const statement = outer(call).parent;
    return !!statement && ts.isExpressionStatement(statement) && statement.parent === sf;
}

/** A rune call outside its position: where it is in the script, the rune, and the call as written. */
export interface MisplacedRune {
    at: number;
    rune: string;
    text: string;
}

/** Every rune call of a script (its content) that is outside its position. */
export function misplacedRunes(code: string): MisplacedRune[] {
    if (!/\$(?:signal|derived|store|effect|watch)\b/.test(code)) return [];
    const { code: script, values } = withoutDeclarations(code);
    const sf = ts.createSourceFile('__pdx_runes.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const out: MisplacedRune[] = [];
    const inValue = (at: number): boolean => values.some(([start, end]) => at >= start && at < end);
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
            const rune = node.expression.text;
            const known = DECLARED.has(rune) || STATEMENT.has(rune);
            const wrong = known && inValue(node.getStart(sf)) ? true
                : DECLARED.has(rune) ? !declaredInPosition(node, sf) : STATEMENT.has(rune) ? !statementInPosition(node, sf) : false;
            if (wrong) out.push({ at: node.getStart(sf), rune, text: node.getText(sf) });
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return out;
}

/** A call of a member of a rune name: where it is, the rune, the member, and the call as written. */
export interface RuneMemberCall {
    at: number;
    rune: string;
    member: string;
    text: string;
}

/**
 * Every call of a member of a rune name — `$derived.by(…)`, `$effect.pre(…)` — in a script (its
 * content), wherever it is (#1404). PDX has no such form: the call reached the module as written, and
 * `$derived` names nothing when it runs. misplacedRunes reads a call whose callee is the rune itself,
 * so it never saw these.
 */
export function runeMemberCalls(code: string): RuneMemberCall[] {
    if (!/\$(?:signal|derived|store|effect|watch)\s*\./.test(code)) return [];
    const { code: script } = withoutDeclarations(code);
    const sf = ts.createSourceFile('__pdx_runes.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const out: RuneMemberCall[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)) {
            const rune = node.expression.expression.text;
            if (DECLARED.has(rune) || STATEMENT.has(rune)) {
                out.push({ at: node.getStart(sf), rune, member: node.expression.name.text, text: node.getText(sf) });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return out;
}

/** The PDX form a rune is written in, for a message that names it. */
const RUNE_FORM = new Map<string, string>([
    ['$signal', '`let name = $signal(initial)`'],
    ['$derived', '`const name = $derived(expression)`, or `$derived(() => { … })` for a derived with a body'],
    ['$store', '`let name = $store({ … })`'],
    ['$effect', '`$effect(() => { … })`, a top-level statement'],
    ['$watch', '`$watch(source, (value) => { … })`, a top-level statement'],
]);

/** Every call of a member of a rune name, as PDX_RUNE_MEMBER at the call. */
function validateRuneMembers(content: string, start: number, source: string): ValidationWarning[] {
    return runeMemberCalls(content).map(({ at: offset, rune, member }) => {
        const at = start + offset;
        const before = source.slice(0, at);
        return {
            code: 'PDX_RUNE_MEMBER',
            severity: 'error' as const,
            message: `\`${rune}.${member}(…)\` is not a PDX rune: the call is left as written, and \`${rune}\` is not defined when it runs.`,
            hint: `Write ${RUNE_FORM.get(rune)}.`,
            line: before.split('\n').length,
            column: at - before.lastIndexOf('\n'),
        };
    });
}

/**
 * Every rune of the script outside its position, as PDX_RUNE_POSITION at the call, and every call
 * of a member of a rune name, as PDX_RUNE_MEMBER (#1404).
 */
export function validateRunePosition(descriptor: SFCDescriptor, source: string): ValidationWarning[] {
    const script = descriptor.script && !descriptor.script.src ? descriptor.script : null;
    if (!script) return [];
    const members = validateRuneMembers(script.content, script.start, source);
    return [...members, ...misplacedRunes(script.content).map(({ at: offset, rune }) => {
        const at = script.start + offset;
        const before = source.slice(0, at);
        const declared = DECLARED.get(rune);
        return {
            code: 'PDX_RUNE_POSITION',
            severity: 'error' as const,
            message: declared
                ? `\`${rune}(…)\` is read only as the whole initialiser of a top-level \`let\` or \`const\`: here it is left as written, and \`${rune}\` is not defined when it runs.`
                : `\`${rune}(…)\` is read only as a top-level statement of the script: here it is not, and \`${rune}\` is not defined when it runs.`,
            hint: `Here, call the core function: \`${declared ?? STATEMENT.get(rune)}(…)\`, imported from '@pdxui/core'.`,
            line: before.split('\n').length,
            column: at - before.lastIndexOf('\n'),
        };
    })];
}
