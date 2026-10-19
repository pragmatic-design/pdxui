// PDX_RUNE_POSITION: a `$` rune where the compiler does not read it (#278; decision 12,
// docs/language/beta/script.md → «The script and its rewrite»).
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

/** The runes read as the initialiser of a top-level declaration, with the core function for elsewhere. */
const DECLARED: Record<string, string> = { $signal: 'signal', $derived: 'computed', $store: 'store' };
/** The runes read as a top-level statement, with the core function for elsewhere. */
const STATEMENT: Record<string, string> = { $effect: 'effect', $watch: 'watch' };

// Match: a declaration opening its line, `@name`. Read on the masked script.
const DECLARATION = /^[ \t]*@[A-Za-z]/gm;

/**
 * The script with every `@` declaration blanked to spaces, newlines kept: what is left is TypeScript,
 * at the same offsets. A rune inside a declaration (`@raw { … }`) is not a rune.
 */
function withoutDeclarations(code: string): string {
    const masked = maskNonCode(code);
    let out = code;
    for (const m of masked.matchAll(DECLARATION)) {
        const at = m.index + m[0].length - 2;
        const end = declarationEnd(code, masked, at);
        out = out.slice(0, at) + out.slice(at, end).replace(/[^\n]/g, ' ') + out.slice(end);
    }
    return out;
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
    const sf = ts.createSourceFile('__pdx_runes.ts', withoutDeclarations(code), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const out: MisplacedRune[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
            const rune = node.expression.text;
            const wrong = DECLARED[rune] ? !declaredInPosition(node, sf) : STATEMENT[rune] ? !statementInPosition(node, sf) : false;
            if (wrong) out.push({ at: node.getStart(sf), rune, text: node.getText(sf) });
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return out;
}

/** Every rune of the script outside its position, as PDX_RUNE_POSITION at the call. */
export function validateRunePosition(descriptor: SFCDescriptor, source: string): ValidationWarning[] {
    const script = descriptor.script && !descriptor.script.src ? descriptor.script : null;
    if (!script) return [];
    return misplacedRunes(script.content).map(({ at: offset, rune }) => {
        const at = script.start + offset;
        const before = source.slice(0, at);
        const declared = DECLARED[rune];
        return {
            code: 'PDX_RUNE_POSITION',
            severity: 'error' as const,
            message: declared
                ? `\`${rune}(…)\` is read only as the whole initialiser of a top-level \`let\` or \`const\`: here it is left as written, and \`${rune}\` is not defined when it runs.`
                : `\`${rune}(…)\` is read only as a top-level statement of the script: here it is not, and \`${rune}\` is not defined when it runs.`,
            hint: `Here, call the core function: \`${declared ?? STATEMENT[rune]}(…)\`, imported from '@pdxui/core'.`,
            line: before.split('\n').length,
            column: at - before.lastIndexOf('\n'),
        };
    });
}
