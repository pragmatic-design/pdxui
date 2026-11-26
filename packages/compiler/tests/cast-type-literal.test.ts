// A template binding cast to a type literal keeps its type as written, for the eraser (#1383).
//
// `(schema as { label?: string } | null)?.label` compiled to `(ctx.schema() as { ctx.label()?:
// ctx.string() } | null)?.label`: the type after `as` was copied only while it was names, so the
// `{` read as an object literal and its keys and types were prefixed. The module did not parse, and
// the error said the compiler wrote it (PDX_TS_UNSUPPORTED). Moving pdx-json-editor to .pdx (#1210)
// found it.

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { compile } from '../src/plugin';

/** The ES parse errors of a module, as TypeScript's parser reports them. */
function parseErrors(code: string): string[] {
    const sf = ts.createSourceFile('m.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const diagnostics = (sf as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics;
    return diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
}

const SCRIPT = '<script>\n@prop schema: Record<string, unknown> | null = null;\n@prop x: unknown = null;\n@prop y = 1;\n@prop z = 2;\n</script>';
const page = (template: string) => `<template>\n${template}\n</template>\n${SCRIPT}`;

/** Compiles, and returns the module with its parse errors. */
function compiled(template: string): { code: string; errors: string[] } {
    const { code } = compile(page(template), 'w.pdx');
    return { code, errors: parseErrors(code) };
}

describe('a cast to a type literal in a template expression', () => {
    it('in an attribute binding: the module parses and reads the label off the prop', () => {
        const { code, errors } = compiled('<div :title="(schema as { label?: string } | null)?.label || null">x</div>');
        expect(errors).toEqual([]);
        expect(code).not.toMatch(/ctx\.label|ctx\.string/);
        expect(code).toMatch(/ctx\.schema\(\)\s*\)\?\.label/);
    });

    it('in a @host binding', () => {
        const src = '<template><p>x</p></template>\n<script>\n@prop schema: Record<string, unknown> | null = null;\n'
            + '@host host { :aria-label="(schema as { label?: string } | null)?.label || null" }\n</script>';
        const { code } = compile(src, 'w.pdx');
        expect(parseErrors(code)).toEqual([]);
        expect(code).not.toMatch(/ctx\.label|ctx\.string/);
    });

    it('in text', () => {
        const { code, errors } = compiled('<p>{{ (schema as { label?: string } | null)?.label }}</p>');
        expect(errors).toEqual([]);
        expect(code).not.toMatch(/ctx\.label|ctx\.string/);
    });

    it('a literal with `;` between its members', () => {
        const { code, errors } = compiled('<p>{{ (schema as { a: number; b: string })?.b }}</p>');
        expect(errors).toEqual([]);
        expect(code).not.toMatch(/ctx\.(a|b|number|string)\b/);
    });

    it('a tuple, a function type and a string literal type', () => {
        for (const type of ['[string, number]', '(v: number) => string', "'a' | 'b'", '{ a: Array<{ b: number }> }[]']) {
            const { code, errors } = compiled(`<p>{{ String(x as ${type}) }}</p>`);
            expect(errors, type).toEqual([]);
            expect(code, type).not.toMatch(/ctx\.(a|b|v|number|string)\b/);
        }
    });
});

describe('controls — what follows the type is still prefixed', () => {
    it('a name after a cast in a ternary keeps its prefix', () => {
        const { code, errors } = compiled('<p>{{ (x as string) ? y : z }}</p>');
        expect(errors).toEqual([]);
        expect(code).toMatch(/ctx\.y\(\)/);
        expect(code).toMatch(/ctx\.z\(\)/);
    });

    it('after a type literal too', () => {
        const { code, errors } = compiled('<p>{{ (x as { a: number }) ? y : z }}</p>');
        expect(errors).toEqual([]);
        expect(code).toMatch(/ctx\.y\(\)/);
        expect(code).toMatch(/ctx\.z\(\)/);
    });

    it('a cast to a named type compiles as before', () => {
        const { errors } = compiled('<p>{{ (schema as Record<string, unknown>)?.a }}</p>');
        expect(errors).toEqual([]);
    });
});
