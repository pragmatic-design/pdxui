// Which @part names something reads (#1268). A part's ref — its signal and the bindRef at its element —
// is for the script, which reads the element by the part's name (#134), or for a template expression.
// A part only the template and a theme use (`data-part` for styling, the manifest's `cssParts`) needs
// none, and every component written in .pdx declares several: each was a signal and a binding at every
// mount, for nothing.
//
// Both reads are looked for in a way that can see a read that is not there, never miss one that is:
// a part wrongly kept costs a signal; one wrongly dropped is a ReferenceError at setup.

import ts from 'typescript';
import type { TemplateNode } from '../parser/template';
import { collectTemplateIdentifiers } from './validate';
import { scopeBindings } from './signal-rewrite-ast';

/** The tokens after which a name followed by `:` is a key or a member: `{ a: …`, `, a: …`, `; a: …`, `(a: T`. */
const BEFORE_KEY = new Set([ts.SyntaxKind.OpenBraceToken, ts.SyntaxKind.CommaToken, ts.SyntaxKind.SemicolonToken, ts.SyntaxKind.OpenParenToken]);

/**
 * The names among `names` that the script source mentions as code. TypeScript's scanner skips comments
 * and reads a string as one token, so `'root'` and `// the root` are no read. Two positions are no
 * read either, since a bare name never stands there (#1332): a property name, after `.` or `?.`; and a
 * name followed by `:` right after `{`, `,`, `;` or `(` — an object key, a type or interface member,
 * an annotated parameter, a slot signature's parameter. A ternary's `? name :`, a shorthand `{ name }`
 * and `case name:` are reads. A template literal's text is a string too, and what its `${…}` holds is
 * code: at the `}` that closes an expression the scanner is asked to read on as the literal, or it
 * would take the next backtick for the start of another and the rest of the script for its text.
 * The `@part` declarations themselves are left out, blanked to spaces so every offset is the script's.
 * Each mention is the name and where it starts.
 */
function scriptMentions(script: string, names: ReadonlySet<string>): Array<{ name: string; at: number }> {
    // Match: a `@part a, b;` line, the declaration, which names every part.
    const src = script.split('\n').map((line) => (/^\s*@part\b/.test(line) ? ' '.repeat(line.length) : line)).join('\n');
    const found: Array<{ name: string; at: number }> = [];
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, src);
    // For each template literal being read, the depth of the braces opened inside its current `${`.
    const templates: number[] = [];
    // What follows a name that is a key or a member: `:`, or `?:` for an optional one. No expression
    // has `?` right before `:` — a ternary has its branch between them.
    const isMemberColon = (): boolean => {
        const next = scanner.scan();
        return next === ts.SyntaxKind.ColonToken
            || (next === ts.SyntaxKind.QuestionToken && scanner.scan() === ts.SyntaxKind.ColonToken);
    };
    let previous = ts.SyntaxKind.Unknown;
    for (let t = scanner.scan(); t !== ts.SyntaxKind.EndOfFileToken; previous = t, t = scanner.scan()) {
        if (t === ts.SyntaxKind.Identifier) {
            const text = scanner.getTokenText();
            if (!names.has(text)) continue;
            if (previous === ts.SyntaxKind.DotToken || previous === ts.SyntaxKind.QuestionDotToken) continue;
            if (BEFORE_KEY.has(previous) && scanner.lookAhead(isMemberColon)) continue;
            found.push({ name: text, at: scanner.getTokenStart() });
        } else if (t === ts.SyntaxKind.TemplateHead) {
            templates.push(0);
        } else if (t === ts.SyntaxKind.OpenBraceToken && templates.length > 0) {
            templates[templates.length - 1]++;
        } else if (t === ts.SyntaxKind.CloseBraceToken && templates.length > 0) {
            const depth = templates.length - 1;
            if (templates[depth] > 0) { templates[depth]--; continue; }
            // The `}` of `${…}`: the literal goes on, as its middle or its tail.
            if (scanner.reScanTemplateToken(false) === ts.SyntaxKind.TemplateTail) templates.pop();
        }
    }
    return found;
}

/**
 * Where the script names, with a part's name, a variable that is not the part (#1287): the name a
 * declaration gives — a `const`, a parameter, a destructured binding, a `catch`, a function or a class —
 * and every mention inside a scope that declares the name. pdx-input's `const input = inputEl` kept its
 * `input` part's ref, a signal and a bindRef at every mount, for nothing.
 *
 * Read by TypeScript's tree with the scopes the signal rewrite uses (`scopeBindings`), the rune lines
 * blanked to spaces so every offset is the script's. Only what the tree shows for certain is left out:
 * a mention on a rune line (`@expose root`), or where the tree has no identifier, stays a read. A
 * `var` in an inner block counts as that block's, which keeps a read the hoisting would have moved.
 */
function otherVariables(script: string, names: ReadonlySet<string>): Set<number> {
    // Match: a line that is a rune, `@prop …`, `@expose …`: not TypeScript.
    const src = script.split('\n').map((line) => (/^\s*@/.test(line) ? ' '.repeat(line.length) : line)).join('\n');
    const sf = ts.createSourceFile('__pdx_parts.ts', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const out = new Set<number>();
    const scopes: Set<string>[] = [];
    const visit = (node: ts.Node): void => {
        const frame = ts.isSourceFile(node) ? null : scopeBindings(node);
        if (frame) scopes.push(new Set(frame));
        if (ts.isIdentifier(node) && names.has(node.text)) {
            const declares = isDeclarationName(node);
            // A scope above this one declares it, or this name is the declaration: not the part.
            const shadowed = scopes.some((s) => s.has(node.text));
            if (declares || shadowed) out.add(node.getStart(sf));
        }
        ts.forEachChild(node, visit);
        if (frame) scopes.pop();
    };
    visit(sf);
    return out;
}

/** Is `id` the name a declaration gives: a variable, a parameter, a binding, a function or a class? */
function isDeclarationName(id: ts.Identifier): boolean {
    const p = id.parent;
    if (ts.isVariableDeclaration(p) || ts.isParameter(p)) return p.name === id;
    if (ts.isBindingElement(p)) return p.name === id;
    if (ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p) || ts.isClassExpression(p)) return p.name === id;
    return false;
}

/**
 * The parts of `parts` that the script or a template expression reads: the ones that need a ref.
 * `quoted` are the expressions the script writes inside quotes, `@host`'s values: to the scanner they
 * are strings, so they are searched as words.
 */
export function readParts(parts: readonly string[], script: string, ast: TemplateNode[], declared: ReadonlySet<string>,
    quoted: readonly string[] = []): Set<string> {
    const names = new Set(parts);
    const mentions = scriptMentions(script, names);
    const notReads = mentions.length > 0 ? otherVariables(script, names) : new Set<number>();
    const read = new Set(mentions.filter((m) => !notReads.has(m.at)).map((m) => m.name));
    for (const text of quoted) for (const n of names) if (new RegExp(`(?<![\\w$])${n}(?![\\w$])`).test(text)) read.add(n);
    for (const id of collectTemplateIdentifiers(ast, declared)) if (names.has(id)) read.add(id);
    return read;
}
