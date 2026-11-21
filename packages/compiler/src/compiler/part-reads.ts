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

/**
 * The names among `names` that the script source mentions as code. TypeScript's scanner skips comments
 * and reads a plain string as one token, so `'root'` and `// the root` are no read; a property name
 * or an object key is counted, and so is any name inside a template literal's text. The `@part`
 * declarations themselves are left out.
 */
function scriptMentions(script: string, names: ReadonlySet<string>): Set<string> {
    // Match: a `@part a, b;` line, the declaration, which names every part.
    const src = script.split('\n').map((line) => (/^\s*@part\b/.test(line) ? '' : line)).join('\n');
    const found = new Set<string>();
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, src);
    for (let t = scanner.scan(); t !== ts.SyntaxKind.EndOfFileToken; t = scanner.scan()) {
        const text = scanner.getTokenText();
        if (t === ts.SyntaxKind.Identifier) {
            if (names.has(text)) found.add(text);
        } else if (t === ts.SyntaxKind.NoSubstitutionTemplateLiteral || t === ts.SyntaxKind.TemplateHead
            || t === ts.SyntaxKind.TemplateMiddle || t === ts.SyntaxKind.TemplateTail) {
            // A template literal's text: what its `${…}` reads is counted too, as words.
            for (const n of names) if (new RegExp(`(?<![\\w$])${n}(?![\\w$])`).test(text)) found.add(n);
        }
    }
    return found;
}

/**
 * The parts of `parts` that the script or a template expression reads: the ones that need a ref.
 * `quoted` are the expressions the script writes inside quotes, `@host`'s values: to the scanner they
 * are strings, so they are searched as words.
 */
export function readParts(parts: readonly string[], script: string, ast: TemplateNode[], declared: ReadonlySet<string>,
    quoted: readonly string[] = []): Set<string> {
    const names = new Set(parts);
    const read = scriptMentions(script, names);
    for (const text of quoted) for (const n of names) if (new RegExp(`(?<![\\w$])${n}(?![\\w$])`).test(text)) read.add(n);
    for (const id of collectTemplateIdentifiers(ast, declared)) if (names.has(id)) read.add(id);
    return read;
}
