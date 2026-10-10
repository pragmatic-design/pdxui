// Escapes that covered some of the characters they had to (#71, js/incomplete-sanitization).

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { compile } from '../src/plugin';
import { parseObjectLiteralToJson } from '../src/compiler/script-analyzer-helpers';

/** Every template's cooked text in the module, joined: what the markup holds at runtime. */
function templateText(code: string): string {
    const body = code.replace(/^\s*import\b.*$/gm, '');
    new Function(body);
    const sf = ts.createSourceFile('gen.js', body, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const out: string[] = [];
    const visit = (n: ts.Node): void => {
        if (ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isStringLiteral(n)) {
            out.push(n.text);
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return out.join('');
}

describe('@raw keeps its text as written', () => {
    // A backslash went into the template literal unescaped: `\n` became a line break, `\d` a `d`,
    // and a backslash before the backtick the parser escaped ended the literal.
    const RAW = 'C:\\new \\d a`b ${x} \\`';
    for (const inline of [false, true]) {
        it(inline ? 'inline path' : 'template path', () => {
            const src = `<template>\n<pre>@raw {${RAW}}</pre>\n</template>\n<script setup>\nlet a = $signal(0);\n</script>\n`;
            const { code } = compile(src, 'raw.pdx', [], undefined, inline ? { production: true, inlineBindings: true } : { production: false });
            expect(templateText(code)).toContain(RAW);
        });
    }
});

describe('@raw inside a loop binds nothing', () => {
    // The parser's `\${` used to hide an unquoted `attr=${…}` from both render paths. Kept as written,
    // the inline path read it as a value the compiler had pre-rewritten — a live binding to `item`.
    const src = `<template>\n@for (items as item; track item) { @raw {<span title=\${item}>x</span>} }\n</template>\n<script setup>\nlet items = $signal([1]);\n</script>\n`;

    it('inline path: the attribute is the text', () => {
        const { code } = compile(src, 'raw-loop.pdx', [], undefined, { production: true, inlineBindings: true });
        expect(code).toContain('.setAttribute("title", "${item}")');
    });

    it('template path: the markup carries the text', () => {
        const { code } = compile(src, 'raw-loop.pdx', [], undefined, { production: false });
        expect(templateText(code)).toContain('<span title=${item}>');
    });
});

describe('a single-quoted string in an object literal read as JSON', () => {
    it('keeps an escaped double quote inside it', () => {
        expect(parseObjectLiteralToJson(`{ title: 'say \\"hi\\"' }`)).toEqual({ title: 'say "hi"' });
    });

    it('keeps an escaped backslash, and the escapes JSON has', () => {
        expect(parseObjectLiteralToJson(`{ path: 'C:\\\\x', nl: 'a\\nb', q: 'it\\'s' }`)).toEqual({ path: 'C:\\x', nl: 'a\nb', q: "it's" });
    });

    it('reads the escapes JSON does not have', () => {
        expect(parseObjectLiteralToJson(`{ a: '\\x41\\u{42}\\v\\0' }`)).toEqual({ a: 'AB\v\0' });
    });
});
