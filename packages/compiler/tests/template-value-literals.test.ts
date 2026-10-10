// A value the template gives the compiler is written into the generated module as a string, never
// pasted between quotes (#69).
//
// `@defer (trigger)`, `@require ('perm')`, `@portal ('#target')`, `@transition('enter', 'exit')`
// were written as `'${value}'`: a value holding a `'` closed the string, and what followed it ran.
// The others went through `JSON.stringify`, which leaves `</script>` as it is — a module inlined in
// a page ends at it — and U+2028/U+2029, which an older parser reads as line breaks.
//
// The checks, on both render paths (the template path the dev server uses, and the inline path a
// production build uses by default):
//   - the module parses;
//   - the payload is TEXT: no identifier `__PWNED` exists in the parsed module;
//   - the module contains no `</script` and no raw U+2028;
//   - the value comes back as written, through the parsed literal — escaping must not change it.

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { compile } from '../src/plugin';
import { jsString } from '../src/compiler/js-literal';

const BREAKOUT = `'+(globalThis.__PWNED=1)+'`;
const NASTY = `a"b\`c\\d\${e}</script><b>\u2028f`;

// The same, without the `"` that would close the attribute it is written in.
const ATTR = NASTY.replace(/"/g, '');

/**
 * `markup`: on the template path the value is not a JavaScript string but the TEXT of the `html```
 * template, next to the rest of the markup — `<` is what that text is made of. There it has to
 * parse, stay text, and come back as written; `</script` and U+2028 are the concerns of a string
 * literal, which is what the inline path writes.
 */
type Case = { site: string; template: string; value?: string; markup?: true };

const cases: Case[] = [
    { site: '@defer trigger', template: `@defer (idle${BREAKOUT}) { <p>x</p> }` },
    { site: '@require permission', template: `@require ('admin${BREAKOUT}') { <p>x</p> }` },
    { site: '@portal target', template: `@portal ('#t${BREAKOUT}') { <p>x</p> }` },
    { site: '@transition names', template: `@if (on) @transition('fade${BREAKOUT}', 'out') @mode('out-in${BREAKOUT}') { <p>x</p> }` },
    { site: '@switch case value', template: `@switch (mode) { @case ('${NASTY}') { <p>x</p> } }`, value: NASTY },
    { site: 'static attribute value', template: `<p title="${ATTR}">x</p>`, value: ATTR, markup: true },
];

function module(template: string, inline: boolean): string {
    const src = `<template>\n  <div>${template}</div>\n</template>\n\n<script setup>\nlet on = $signal(true);\nlet mode = $signal('a');\n</script>\n`;
    const options = inline ? { production: true, inlineBindings: true } : { production: false };
    return compile(src, 'probe.pdx', [], undefined, options).code;
}

function parsed(code: string): ts.SourceFile {
    // Line-wise: each import is on one line, and an import is illegal in a function body.
    const body = code.replace(/^\s*import\b.*$/gm, '');
    new Function(body);
    return ts.createSourceFile('gen.js', body, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
}

/** Every identifier, every string literal's VALUE, and every template's cooked text in the module. */
function walk(sf: ts.SourceFile): { identifiers: Set<string>; strings: string[]; templateText: string[] } {
    const identifiers = new Set<string>();
    const strings: string[] = [];
    const templateText: string[] = [];
    const visit = (n: ts.Node): void => {
        if (ts.isIdentifier(n)) identifiers.add(n.text);
        if (ts.isStringLiteral(n)) strings.push(n.text);
        if (ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
            templateText.push(n.text);
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return { identifiers, strings, templateText };
}

describe('template values become string literals in the generated module (#69)', () => {
    for (const inline of [false, true]) {
        const path = inline ? 'inline path' : 'template path';
        for (const c of cases) {
            it(`${c.site}, ${path}: parses, and the value stays text`, () => {
                const code = module(c.template, inline);
                const { identifiers, strings, templateText } = walk(parsed(code));
                expect(identifiers.has('__PWNED'), `the value ran as code:\n${code}`).toBe(false);
                if (c.markup && !inline) {
                    expect(templateText.some((t) => t.includes(c.value!)), `the markup does not carry the value as written:\n${code}`).toBe(true);
                    return;
                }
                expect(code.includes('</script'), 'a `</script` ends an inlined module').toBe(false);
                expect(code.includes('\u2028'), 'a raw U+2028 is a line break to an older parser').toBe(false);
                if (c.value) expect(strings, 'the value does not come back as written').toContain(c.value);
            });
        }
    }
});

describe('jsString', () => {
    it('reads back as the value it was given, for every character that needs escaping', () => {
        // `<!` + `--` written apart: esbuild reads `<!--` in a source file as an HTML comment opener.
        for (const v of [NASTY, `'`, '\u2029', '<!' + '--', '', 'plain']) {
            expect(new Function('return ' + jsString(v))()).toBe(v);
        }
    });

    it('leaves none of < > U+2028 U+2029 raw, and keeps / so an import path stays a path', () => {
        const out = jsString('</script>\u2028\u2029/src/a.js');
        expect(out).not.toMatch(/[<>\u2028\u2029]/);
        expect(out).toContain('/src/a.js');
    });

    it('writes any JSON value, and undefined as undefined', () => {
        const value = { a: ['<b>', 1, null] };
        expect(new Function('return ' + jsString(value))()).toEqual(value);
        expect(jsString(undefined)).toBe('undefined');
    });
});
