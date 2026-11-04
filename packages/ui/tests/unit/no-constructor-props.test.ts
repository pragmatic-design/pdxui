// No library component declares a prop in the constructor form (#872, step 1 of #300).
//
// `props: { label: { type: String, default: '' } }` is the alpha model: typed no further than its
// constructor, and the form #300 removes from `component()`. A prop is declared with the descriptor,
// `prop<T>(default, options?)`, `prop.required<T>()` or `prop.optional<T>()`. Read through the
// TypeScript AST, so a declaration split over several lines is seen like a one-line one.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const SRC = join(__dirname, '..', '..', 'src');

function componentFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) componentFiles(p, acc);
        else if (/^pdx-.*\.ts$/.test(entry)) acc.push(p);
    }
    return acc;
}

/** The props of every `component('tag', { props: { … } })` in `text` written as `{ type: … }`. */
function constructorProps(text: string): string[] {
    const source = ts.createSourceFile('c.ts', text, ts.ScriptTarget.Latest, true);
    const found: string[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'component') {
            const [tag, options] = node.arguments;
            if (tag && ts.isStringLiteralLike(tag) && options && ts.isObjectLiteralExpression(options)) {
                for (const member of options.properties) {
                    if (!ts.isPropertyAssignment(member) || member.name.getText(source) !== 'props') continue;
                    if (!ts.isObjectLiteralExpression(member.initializer)) continue;
                    for (const decl of member.initializer.properties) {
                        if (!ts.isPropertyAssignment(decl)) continue;
                        let init: ts.Expression = decl.initializer;
                        while (ts.isAsExpression(init) || ts.isParenthesizedExpression(init)) init = init.expression;
                        if (ts.isObjectLiteralExpression(init) && init.properties.some(
                            p => ts.isPropertyAssignment(p) && p.name.getText(source) === 'type')) {
                            found.push(`${tag.text}.${decl.name.getText(source).replace(/^['"]|['"]$/g, '')}`);
                        }
                    }
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
}

describe('the scan can fail', () => {
    it('sees a constructor-form prop, on one line and over several, and through a cast', () => {
        const text = [
            "component('pdx-probe', {",
            '    props: {',
            "        a: { type: String, default: '' },",
            '        b: {',
            '            type: Number,',
            '            default: 0,',
            '        },',
            '        c: { type: Array, default: null } as TypedProp<string[] | null>,',
            "        d: prop('x'),",
            '    },',
            '});',
        ].join('\n');
        expect(constructorProps(text)).toEqual(['pdx-probe.a', 'pdx-probe.b', 'pdx-probe.c']);
    });

    it('does not count a model\'s options, which are a descriptor', () => {
        const text = "component('pdx-probe', { models: { value: model<string>('', { type: String, form: true }) } });";
        expect(constructorProps(text)).toEqual([]);
    });
});

describe('the library', () => {
    it('declares every prop with the descriptor', () => {
        const files = componentFiles(SRC);
        expect(files.length).toBeGreaterThan(100);
        const offenders = files.flatMap(f => constructorProps(readFileSync(f, 'utf8'))
            .map(p => `${relative(SRC, f).replace(/\\/g, '/')}: ${p}`));
        expect(offenders).toEqual([]);
    });
});
